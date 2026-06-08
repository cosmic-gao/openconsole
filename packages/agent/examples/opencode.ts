/**
 * 完整版 opencode —— 一个终端编码 agent，整合本包**全部核心能力**，对标 opencode /
 * claude code 的关键交互：
 *
 *  - 真实磁盘文件 + shell：`Sandbox.local()` 让 agent 自动获得 deepagents 的
 *    ls/read_file/write_file/edit_file/glob/grep/execute（作用于当前工作目录）；
 *  - 内置工具：think / web_search / read_webpages_as_markdown / http_request / run_javascript / run_python；
 *  - 持久化多轮会话：`checkpoint.sqlite`（未装可选依赖则回退内存）+ `agent.session()` 流式；
 *  - 项目上下文：若工作目录有 `AGENTS.md`，自动并入系统提示词；
 *  - plan / build 模式：`/plan` 切只读（guard 拦截写/执行），`/build` 切回可写；
 *  - 权限确认：危险 shell 命令（rm -rf、sudo…）执行前在终端 y/N 确认（guard 中间件）；
 *  - 取消：生成中按 Ctrl-C 中断本轮、空闲时退出；
 *  - 富事件渲染：token 流式 / 思考(💭，含内联 <think> 拆分) / 工具调用 / 每轮 token 用量；
 *    —— 推理走暗色、正文正常色，且本轮无正文时由 done 兜底，杜绝「多轮只剩思考、正文丢失」；
 *  - 插件：`use([...])` 装会话插件，用 `api.modifyPrompt` 每轮动态注入当前模式（演示插件系统）；
 *  - slash 命令：/help /plan /build /reset /history /cost /exit。
 *
 * 模型（写进包根 `.env` 或 `export` 均可——示例启动时自动加载 `.env`；**切勿把密钥写进源码**）：
 *   - MiniMax 中国区：MINIMAX_API_KEY=...（可选 MINIMAX_MODEL）
 *   - 通用：AGENT_MODEL=openai:gpt-4o-mini（+ OPENAI_API_KEY），或本地 Ollama/vLLM（设 OPENAI_BASE_URL）
 *
 * 接 MCP（可选）：`const { tools, client } = await Mcp.connect({...})`，把 tools 经
 *   `Agent.create("code", { tools: [...registry.get([...]), ...tools] })` 注入，用完 `client.close()`。
 *
 * ⚠️ `Sandbox.local()` 在宿主机执行命令/读写文件（弱隔离），仅在你信任的本地项目里用；
 *    需要强隔离换 `Sandbox.state()`（虚拟 FS）或 `Sandbox.adapt(...)`（接自托管沙箱）。
 *
 * 运行：pnpm --filter @openconsole/agent opencode
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

import {
  Agent,
  checkpoint,
  guard,
  models,
  Sandbox,
  use,
  type Event,
  type GuardDecision,
  type Plugin,
} from "../index";

/** 会话模式：build = 可读写执行；plan = 只读（拦截一切修改/执行）。 */
type Mode = "build" | "plan";
/** 累计 token 用量。 */
interface Cost {
  input: number;
  output: number;
  total: number;
}

// ———————————————————————————— .env 加载 ————————————————————————————

/**
 * 极简加载包根 `.env`（若存在）到 process.env：逐行 KEY=VALUE，不覆盖已 export 的变量。
 * 零依赖、兼容所有 Node —— tsx / node 默认不读 .env，故在此手动加载。
 */
function loadEnv(): void {
  let text: string;
  try {
    text = readFileSync(
      fileURLToPath(new URL("../.env", import.meta.url)),
      "utf8",
    );
  } catch {
    return; // 无 .env：回退到已 export 的环境变量
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1); // 去成对引号
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ———————————————————————————— 模型配置 ————————————————————————————

/** 从环境变量配置模型；配好返回 true。绝不在源码里写死密钥。 */
function configureModel(): boolean {
  const minimaxKey = process.env["MINIMAX_API_KEY"];
  if (minimaxKey) {
    models.register(
      "main_llm",
      new ChatOpenAI({
        model: process.env["MINIMAX_MODEL"] ?? "MiniMax-M2.7-highspeed",
        apiKey: minimaxKey,
        configuration: { baseURL: "https://api.minimaxi.com/v1" },
      }),
    );
    return true;
  }
  return Boolean(process.env["AGENT_MODEL"] ?? process.env["AGENT_MAIN_MODEL"]);
}

// ————————————————————————— 持久化 checkpointer —————————————————————————

/** SQLite 持久化优先；未装可选依赖则回退内存（重启即失忆）。 */
async function openCheckpointer(): Promise<BaseCheckpointSaver> {
  try {
    return await checkpoint.sqlite("opencode-sessions.db");
  } catch {
    stdout.write(
      "（未装 @langchain/langgraph-checkpoint-sqlite —— 会话用内存，重启失忆；`pnpm add` 它即可持久化）\n",
    );
    return checkpoint.memory();
  }
}

// ———————————————————————— 权限 guard（plan + 危险命令）————————————————————————

/** 写/执行类工具（plan 模式下一律拦截）。 */
const WRITE_TOOLS = new Set(["write_file", "edit_file", "execute"]);
/** 危险 shell 命令模式（执行前需用户确认）。 */
const DANGER =
  /\brm\s+-rf|\bsudo\b|\bmkfs|\bdd\s+if=|>\s*\/dev\/|:\(\)\s*\{|chmod\s+-R\s+777\s+\/|curl[^|]*\|\s*sh/i;

/** 构造权限 guard 中间件：plan 模式拦截写/执行；危险命令终端 y/N 确认。 */
function makeGuard(getMode: () => Mode, confirm: (q: string) => Promise<boolean>) {
  return guard(async ({ name, args }): Promise<GuardDecision> => {
    if (getMode() === "plan" && WRITE_TOOLS.has(name)) {
      return { action: "deny", reason: "当前为 plan（只读）模式；/build 后再修改或执行" };
    }
    if (name === "execute") {
      const cmd = String((args as { command?: unknown }).command ?? "");
      if (DANGER.test(cmd) && !(await confirm(`⚠️  危险命令：${cmd}`))) {
        return { action: "deny", reason: "用户拒绝执行该命令" };
      }
    }
    return { action: "allow" };
  });
}

// ———————————————————————————— 会话插件 ————————————————————————————

/** 演示插件系统：每轮把当前模式动态注入系统提示词（`api.modifyPrompt`）。 */
function sessionPlugin(getMode: () => Mode): Plugin {
  return {
    name: "opencode-session",
    setup(api) {
      // system.transform：output.system 初始为当前系统消息文本，这里追加当前模式提示。
      api.transform.system((_input, output) => {
        const mode =
          getMode() === "plan"
            ? "MODE=plan (read-only): do NOT write files or run commands; only explain and propose a plan."
            : "MODE=build: you may read, write files, and run shell commands.";
        // 反「只思考不行动」：MiniMax-M2 等推理模型多轮时偶发只输出 <think> 就收尾，
        // 明确要求每轮必须落地为用户可见答案或一次工具调用。
        output.system += `\n\n${mode}\nAlways end your turn with a user-facing answer or a tool call — never stop after only thinking.`;
      });
    },
  };
}

// ———————————————————————————— 事件渲染 ————————————————————————————

// 内联 <think> 处理：部分模型（如 MiniMax-M2）把推理直接写进 content（而非独立 reasoning
// 流），于是它以普通 token 抵达。下面在流式中把推理与正文切开——正文照常显示、推理走暗色，
// 既避免 <think> 标签污染答案，也让「只思考没正文」的退化轮有迹可循、由 done 兜底。
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

/** 单轮渲染状态（每轮新建）。 */
interface Turn {
  /** 内联 <think> 流式拆分器。 */
  filter: ReturnType<typeof makeThinkFilter>;
  /** 本轮是否已输出过可见正文（用于 done 兜底判定）。 */
  sawAnswer: boolean;
  /** 本轮是否调用过工具（调过则不算「只思考」）。 */
  sawTool: boolean;
}

/**
 * 流式拆分内联 `<think>…</think>`：返回 push/flush，增量给出 `{ answer, reasoning }`。
 * 标签可能被切在两个 token 之间，故仅当末尾确为某标签前缀时才保留 holdback，其余立即放行。
 */
function makeThinkFilter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inThink = false;
  let buf = "";
  /** 末尾应保留的长度：buf 的最长后缀且为 OPEN/CLOSE 的前缀（可能是半个标签）。 */
  const partialTail = (s: string): number => {
    let keep = 0;
    for (const tag of [OPEN, CLOSE]) {
      for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
        if (s.endsWith(tag.slice(0, k))) {
          keep = Math.max(keep, k);
          break;
        }
      }
    }
    return keep;
  };
  const cut = (): { answer: string; reasoning: string } => {
    let answer = "";
    let reasoning = "";
    for (;;) {
      const tag = inThink ? CLOSE : OPEN;
      const i = buf.indexOf(tag);
      if (i === -1) break;
      const seg = buf.slice(0, i);
      if (inThink) reasoning += seg;
      else answer += seg;
      buf = buf.slice(i + tag.length);
      inThink = !inThink;
    }
    const keep = partialTail(buf);
    const seg = buf.slice(0, buf.length - keep);
    buf = buf.slice(buf.length - keep);
    if (inThink) reasoning += seg;
    else answer += seg;
    return { answer, reasoning };
  };
  return {
    /** 喂入一段 token 文本，返回本段切出的正文/推理增量。 */
    push(text: string): { answer: string; reasoning: string } {
      buf += text;
      return cut();
    },
    /** 收尾：把残留按当前状态全部吐出（标签未闭合则算推理）。 */
    flush(): { answer: string; reasoning: string } {
      const rest = buf;
      buf = "";
      return inThink
        ? { answer: "", reasoning: rest }
        : { answer: rest, reasoning: "" };
    },
  };
}

/** 把标准化事件流渲染到终端，并累计 token 用量。 */
function renderEvent(ev: Event, cost: Cost, turn: Turn): void {
  switch (ev.type) {
    case "token": {
      // 内联推理走暗色、正文正常色，避免 <think> 标签污染答案
      const { answer, reasoning } = turn.filter.push(ev.text);
      if (reasoning) stdout.write(DIM + reasoning + RESET);
      if (answer) {
        stdout.write(answer);
        if (answer.trim()) turn.sawAnswer = true;
      }
      break;
    }
    case "think":
      // 独立 reasoning 流（部分模型走这里）；MiniMax 把 <think> 内联在 token，由 filter 处理
      stdout.write(`\n  💭 ${ev.text.trim()}\n`);
      break;
    case "tool_start":
      turn.sawTool = true;
      stdout.write(`\n  · ${ev.name}…`);
      break;
    case "tool_end":
      stdout.write(ev.ok ? " ✓" : " ✗");
      break;
    case "error":
      stdout.write(`\n[错误] ${ev.message}`);
      break;
    case "done": {
      // flush 拆分器残留（含未闭合标签内容）
      const { answer, reasoning } = turn.filter.flush();
      if (reasoning) stdout.write(DIM + reasoning + RESET);
      if (answer) {
        stdout.write(answer);
        if (answer.trim()) turn.sawAnswer = true;
      }
      // 兜底：本轮既无正文也无工具（模型只输出 <think> 就收尾——MiniMax-M2 多轮偶发）。
      // 优先用 done.text（剥掉 think），否则给明确提示，避免「回复内容丢失」的观感。
      if (!turn.sawAnswer && !turn.sawTool) {
        const finalText = (ev.text ?? "")
          .replace(/<think>[\s\S]*?<\/think>/g, "")
          .trim();
        stdout.write(
          finalText
            ? `\n${finalText}\n`
            : "\n（本轮模型只思考、未给出回答；可重述需求或再发一次）\n",
        );
      }
      if (ev.usage) {
        cost.input += ev.usage.input;
        cost.output += ev.usage.output;
        cost.total += ev.usage.total;
        stdout.write(`\n  (本轮 ${ev.usage.total} tok)`);
      }
      break;
    }
    default:
      break;
  }
}

function printHelp(mode: Mode): void {
  stdout.write(
    `\n完整 opencode —— 终端编码助手｜工作目录 ${process.cwd()}｜模式 ${mode}\n` +
      `  直接输入需求；slash 命令：\n` +
      `  /plan    切只读模式（不改文件/不执行）     /build   切回可写模式\n` +
      `  /reset   开新会话                          /history 当前会话消息数\n` +
      `  /cost    累计 token 用量                   /help    本帮助\n` +
      `  /exit    退出                              Ctrl-C   中断当前生成（空闲时退出）\n`,
  );
}

// ———————————————————————————————— main ————————————————————————————————

async function main(): Promise<void> {
  loadEnv(); // 先加载包根 .env，使 MINIMAX_API_KEY / AGENT_MODEL 等无需手动 export
  if (!configureModel()) {
    stdout.write(
      "未配置模型。设 MINIMAX_API_KEY（MiniMax 中国区），或 AGENT_MODEL（如 openai:gpt-4o-mini）+ 对应 API Key。\n",
    );
    process.exitCode = 1;
    return;
  }

  let mode: Mode = "build";
  const cost: Cost = { input: 0, output: 0, total: 0 };
  const rl = createInterface({ input: stdin, output: stdout });
  // 危险命令确认：复用同一个 readline（仅在 guard 触发时、流式空档调用）
  const confirm = async (q: string): Promise<boolean> =>
    /^y(es)?$/i.test((await rl.question(`\n${q}\n  允许？(y/N) `)).trim());

  // 装会话插件（全局），其 modifyPrompt 会被 build 自动并入 agent
  const off = await use([sessionPlugin(() => mode)]);

  // 编码 agent：真实磁盘 backend + 持久化 + 权限 guard +（存在则）AGENTS.md 项目上下文
  const checkpointer = await openCheckpointer();
  const hasAgentsMd = existsSync(resolve(process.cwd(), "AGENTS.md"));
  const agent = await Agent.create("code", {
    backend: Sandbox.local({ rootDir: process.cwd() }),
    checkpointer,
    middleware: [makeGuard(() => mode, confirm)],
    ...(hasAgentsMd ? { memory: ["AGENTS.md"] } : {}),
  });
  let session = agent.session({ thread: "opencode" });

  // Ctrl-C：生成中→中断本轮；空闲→优雅退出
  let abort: AbortController | undefined;
  let interrupted = false;
  const shutdown = async (): Promise<void> => {
    await off();
    rl.close();
    stdout.write("\n再见 👋\n");
    process.exit(0);
  };
  rl.on("SIGINT", () => {
    if (abort) {
      interrupted = true;
      abort.abort();
    } else {
      void shutdown();
    }
  });

  printHelp(mode);
  if (hasAgentsMd) stdout.write("（已加载 AGENTS.md 项目上下文）\n");

  for (;;) {
    const input = (await rl.question(`\n你 (${mode}) › `)).trim();
    if (input === "") continue;

    // slash 命令
    if (input.startsWith("/")) {
      const cmd = input.split(/\s+/)[0];
      if (cmd === "/exit" || cmd === "/quit") break;
      if (cmd === "/reset") {
        session = session.resume(`opencode-${Date.now()}`);
        stdout.write("（已开新会话）\n");
      } else if (cmd === "/plan") {
        mode = "plan";
        stdout.write("→ plan 模式（只读）\n");
      } else if (cmd === "/build") {
        mode = "build";
        stdout.write("→ build 模式（可写）\n");
      } else if (cmd === "/cost") {
        stdout.write(
          `累计：输入 ${cost.input} / 输出 ${cost.output} / 合计 ${cost.total} tok\n`,
        );
      } else if (cmd === "/history") {
        const h = await session.history();
        stdout.write(`当前会话 ${h.length} 条消息\n`);
      } else if (cmd === "/help") {
        printHelp(mode);
      } else {
        stdout.write(`未知命令 ${cmd}（/help 看全部）\n`);
      }
      continue;
    }

    // 一轮对话（流式 + 可 Ctrl-C 中断）
    abort = new AbortController();
    interrupted = false;
    const turn: Turn = {
      filter: makeThinkFilter(),
      sawAnswer: false,
      sawTool: false,
    };
    try {
      stdout.write("\nagent › ");
      for await (const ev of session.stream(input, { signal: abort.signal })) {
        renderEvent(ev, cost, turn);
      }
      stdout.write("\n");
    } catch (e) {
      if (!interrupted) {
        stdout.write(`\n[错误] ${e instanceof Error ? e.message : String(e)}\n`);
      }
    } finally {
      if (interrupted) stdout.write("\n（已中断）\n");
      abort = undefined;
    }
  }

  await shutdown();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
