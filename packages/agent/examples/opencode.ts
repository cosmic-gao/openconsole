/**
 * 简化版 opencode —— 一个终端编码 agent 示例,整合了本包的核心能力:
 *
 *  - 真实磁盘文件工具 + shell:`Sandbox.local()` backend 让 agent 自动获得 deepagents 的
 *    ls / read_file / write_file / edit_file / glob / grep / execute,作用于当前工作目录;
 *  - 内置工具:think / web_search / read_webpages_as_markdown / http_request / run_javascript / run_python;
 *  - 多轮对话 + 标准化事件流:`agent.session()` 封装 checkpointer + thread_id,`session.stream()`
 *    产出 token / tool / done 事件,边生成边渲染;
 *  - 模型:设 MINIMAX_API_KEY 走 MiniMax 中国区,或 AGENT_MODEL=...(+ 对应 key)。
 *
 * ⚠️ `Sandbox.local()` 在宿主机执行命令/读写文件(弱隔离),仅在你信任的本地项目里用。
 *    需要隔离时换 `Sandbox.state()`(虚拟FS)或 `Sandbox.adapt(...)` 接自托管沙箱。
 *
 * 运行:pnpm --filter @openconsole/agent opencode
 * 对话中:/exit 退出,/reset 开新会话。
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { ChatOpenAI } from "@langchain/openai";

import { Agent, checkpoint, models, Sandbox } from "../index";

async function main(): Promise<void> {
  // 可选:MiniMax 中国区(设了 MINIMAX_API_KEY 就用,否则走 AGENT_MODEL)。
  // 切勿把密钥写进源码——从环境变量读取。
  const minimaxKey = process.env["MINIMAX_API_KEY"] || 'sk-cp-ALjB-RD09EIx8OiQpseV-gGC1TzBFn6lG-oJjkCnOkyzp1pQReJJD8s2iktZq8ZrtbwHclJ0wTy5cJSuTEA0ao-OZYCqKdtkzC9hwnEmhYnwxqu7w4DzVH8';
  if (minimaxKey) {
    models.register(
      "main_llm",
      new ChatOpenAI({
        model: process.env["MINIMAX_MODEL"] ?? "MiniMax-M2.7-highspeed",
        apiKey: minimaxKey,
        configuration: { baseURL: "https://api.minimaxi.com/v1" },
      }),
    );
  }
  if (
    !minimaxKey &&
    !process.env["AGENT_MODEL"] &&
    !process.env["AGENT_MAIN_MODEL"]
  ) {
    console.error(
      "未配置模型。设 MINIMAX_API_KEY(MiniMax 中国区),或 AGENT_MODEL(如 openai:gpt-4o-mini)+ 对应 API Key。",
    );
    process.exitCode = 1;
    return;
  }

  // 编码 agent:真实磁盘 backend(文件 + shell)+ 多轮 checkpointer。
  // 默认进程内内存(重启即失忆);要跨重启保留会话,先装可选依赖
  // `@langchain/langgraph-checkpoint-sqlite`,再换成 `await checkpoint.sqlite("opencode.db")`。
  const agent = await Agent.create("code", {
    backend: Sandbox.local({ rootDir: process.cwd() }),
    checkpointer: checkpoint.memory(),
  });
  let session = agent.session({ thread: "opencode" });

  const rl = createInterface({ input: stdin, output: stdout });
  console.log(
    `简化 opencode —— 终端编码助手。工作目录: ${process.cwd()}\n直接输入需求;/exit 退出,/reset 新会话。`,
  );

  try {
    for (;;) {
      const input = (await rl.question("\n你 › ")).trim();
      if (input === "") continue;
      if (input === "/exit" || input === "/quit") break;
      if (input === "/reset") {
        session = session.resume(`opencode-${Date.now()}`);
        console.log("（已开新会话）");
        continue;
      }
      try {
        stdout.write("\nagent › ");
        for await (const ev of session.stream(input)) {
          if (ev.type === "token") stdout.write(ev.text);
          else if (ev.type === "tool_start") stdout.write(`\n  · ${ev.name}…`);
          else if (ev.type === "tool_end" && !ev.ok)
            stdout.write(`\n  · ${ev.name} 失败`);
          else if (ev.type === "error") stdout.write(`\n[错误] ${ev.message}`);
        }
        stdout.write("\n");
      } catch (e) {
        console.error(`\n[错误] ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    rl.close();
  }
  console.log("\n再见 👋");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
