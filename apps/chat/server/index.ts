/**
 * 极简 SSE 后端 —— Web 聊天的「桥」：把 @openconsole/agent 的 `session.stream()` 标准化
 * {@link Event} 流序列化为 `text/event-stream` 推给浏览器。零 HTTP 框架（原生 node:http），
 * 与终端版 examples/opencode.ts 同源、同模型、同事件模型。
 *
 * 安全默认：用 `Sandbox.state()`（虚拟 FS），Web 聊天**碰不到真实磁盘/shell**。要让它在你的
 * 真实项目里读写代码，把下面 backend 换成 `Sandbox.local({ rootDir: process.cwd() })` —— 但请
 * 自行加鉴权/限网，切勿把它暴露到可信网络之外。
 *
 * 模型：复用 packages/agent/.env 里的 MINIMAX_API_KEY（或设 AGENT_MODEL）。
 * 运行：pnpm --filter @openconsole/chat dev:server   （或 pnpm --filter @openconsole/chat dev 一起起前端）
 */
import { existsSync, readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { ChatOpenAI } from "@langchain/openai";

import {
  Agent,
  checkpoint,
  models,
  Sandbox,
  use,
  type Event,
  type Plugin,
} from "@openconsole/agent";

const PORT = Number(process.env["CHAT_SERVER_PORT"] ?? 8787);

// ———————————————————————————— .env 加载 ————————————————————————————

/** 逐行 KEY=VALUE 读取给定 .env 到 process.env（不覆盖已有），零依赖。 */
function loadEnvFile(url: URL): void {
  let text: string;
  try {
    if (!existsSync(fileURLToPath(url))) return;
    text = readFileSync(fileURLToPath(url), "utf8");
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

/** 先本地 apps/chat/.env，再回退复用 packages/agent/.env（密钥多半在那）。 */
function loadEnv(): void {
  loadEnvFile(new URL("../.env", import.meta.url));
  loadEnvFile(new URL("../../../packages/agent/.env", import.meta.url));
}

// ———————————————————————————— 模型配置 ————————————————————————————

/** 与 opencode.ts 同：配好返回 true，绝不写死密钥。 */
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

// ———————————————————————————— SSE 工具 ————————————————————————————

/** 读取请求体为字符串。 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

/**
 * 递归把 {@link Event} 流写成 SSE。token / think / tool_start / tool_end / error / done 可直接 JSON 序列化；
 * 子代理事件含嵌套异步流，无法序列化 —— 先写一条提示，再把其子事件递归并入同一条流。
 */
async function pump(
  events: AsyncIterable<Event>,
  write: (ev: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  for await (const ev of events) {
    if (signal.aborted) break;
    if (ev.type === "subagent") {
      write({ type: "token", text: `\n[子代理 ${ev.name}]\n` });
      await pump(ev.events, write, signal);
      continue;
    }
    write(ev);
  }
}

// ———————————————————————————————— 启动 ————————————————————————————————

loadEnv();
if (!configureModel()) {
  console.error(
    "未配置模型。在 packages/agent/.env 设 MINIMAX_API_KEY，或设 AGENT_MODEL（如 openai:gpt-4o-mini）+ 对应 key。",
  );
  process.exit(1);
}

// 反「只思考不行动」：MiniMax-M2 多轮偶发只输出 <think> 就收尾，明确要求每轮落地为答案/工具调用。
const nudge: Plugin = {
  name: "web-nudge",
  setup(api) {
    api.modifyPrompt(
      () =>
        "You are served over a web chat UI. Always end your turn with a user-facing answer or a tool call — never stop after only thinking. Be concise.",
    );
  },
};
await use([nudge]);

const agent = await Agent.create("code", {
  // 安全默认：虚拟 FS。要接真实项目改成 Sandbox.local({ rootDir: process.cwd() })（并自行加鉴权）。
  backend: Sandbox.state(),
  checkpointer: checkpoint.memory(),
});

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void handle(req, res);
});

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // 开发期前端走 Vite 代理无需 CORS；仍放开以便直连调试。
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    let body: { input?: unknown; thread?: unknown };
    try {
      body = JSON.parse((await readBody(req)) || "{}");
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("bad json");
      return;
    }
    const input = String(body.input ?? "");
    const thread = String(body.thread ?? "web");
    if (!input.trim()) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("empty input");
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const ac = new AbortController();
    req.on("close", () => ac.abort());
    const write = (ev: unknown): void => {
      res.write(`data: ${JSON.stringify(ev)}\n\n`);
    };
    try {
      const session = agent.session({ thread });
      await pump(session.stream(input, { signal: ac.signal }), write, ac.signal);
    } catch (e) {
      if (!ac.signal.aborted) {
        write({
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
    return;
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
}

server.listen(PORT, () => {
  console.log(
    `SSE 后端就绪 → http://localhost:${PORT}  (agent: code · sandbox: state · 多轮: memory)`,
  );
});
