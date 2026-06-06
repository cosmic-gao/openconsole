/**
 * 简化版 opencode —— 一个终端编码 agent 示例,整合了本包的核心能力:
 *
 *  - 真实磁盘文件工具 + shell:`Sandbox.local()` backend 让 agent 自动获得 deepagents 的
 *    ls / read_file / write_file / edit_file / glob / grep / execute,作用于当前工作目录;
 *  - 内置工具:think / web_search / read_webpages_as_markdown / http_request / run_javascript / run_python;
 *  - 多轮对话:LangGraph checkpointer + 固定 thread_id,自动保留上下文;
 *  - 模型:AGENT_MODEL=...(+ key),或设 MINIMAX_API_KEY 走 MiniMax 中国区。
 *
 * ⚠️ `Sandbox.local()` 在宿主机执行命令/读写文件(弱隔离),仅在你信任的本地项目里用。
 *    需要隔离时换 `Sandbox.state()`(虚拟FS)或 `Sandbox.adapt(...)` 接自托管沙箱。
 *
 * 运行:pnpm --filter @openconsole/agent opencode
 * 对话中:/exit 退出,/reset 开新会话。
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

import { Agent, models, Sandbox } from "../index";

/** 取图结果里最后一条消息的文本。 */
function lastText(state: unknown): string {
  const messages = (state as { messages?: BaseMessage[] }).messages;
  const last = messages?.[messages.length - 1];
  return typeof last?.text === "string" ? last.text : "";
}

async function main(): Promise<void> {
  // 可选:MiniMax 中国区(设了 key 就用,否则走 AGENT_MODEL)
  const minimaxKey = 'sk-cp-ALjB-RD09EIx8OiQpseV-gGC1TzBFn6lG-oJjkCnOkyzp1pQReJJD8s2iktZq8ZrtbwHclJ0wTy5cJSuTEA0ao-OZYCqKdtkzC9hwnEmhYnwxqu7w4DzVH8'
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

  // 编码 agent:真实磁盘 backend(文件 + shell)+ 多轮 checkpointer
  const agent = await Agent.create("code", {
    backend: Sandbox.local({ rootDir: process.cwd() }),
    checkpointer: new MemorySaver(),
  });
  let thread = "opencode";

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
        thread = `opencode-${Date.now()}`;
        console.log("（已开新会话）");
        continue;
      }
      try {
        const state = await agent.graph.invoke(
          { messages: [{ role: "user", content: input }] },
          { configurable: { thread_id: thread } },
        );
        console.log(`\nagent › ${lastText(state)}`);
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
