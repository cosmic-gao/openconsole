/**
 * 终端交互式对话示例：多轮对话，自动保留上下文（LangGraph checkpointer + thread_id）。
 *
 * 配置模型（任选其一）：
 *   MiniMax 中国区：设 MINIMAX_API_KEY（默认 MiniMax-M2.7 @ api.minimaxi.com，可用 MINIMAX_MODEL 覆盖）
 *   其它（通用）：  AGENT_MODEL=openai:gpt-4o-mini + OPENAI_API_KEY（或 anthropic:… 等）
 *
 * 运行：
 *   pnpm --filter @openconsole/agent chat
 *   AGENT=search|explore 选择内置 agent（默认 search）
 *   对话中：/exit 退出，/reset 开新会话。
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { BaseMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";

import { Agent, models } from "../index";

/** 从图结果 state 取最后一条消息的文本（用官方 BaseMessage.text）。 */
function lastText(state: unknown): string {
  const messages = (state as { messages?: BaseMessage[] }).messages;
  const last = messages?.[messages.length - 1];
  return typeof last?.text === "string" ? last.text : "";
}

async function main(): Promise<void> {
  // 若提供了 MiniMax 中国区 key，注册为 main_llm（演示第三方 OpenAI 兼容接入）。
  const minimaxKey =
    "sk-cp-ALjB-RD09EIx8OiQpseV-gGC1TzBFn6lG-oJjkCnOkyzp1pQReJJD8s2iktZq8ZrtbwHclJ0wTy5cJSuTEA0ao-OZYCqKdtkzC9hwnEmhYnwxqu7w4DzVH8";
  if (minimaxKey) {
    models.register(
      "main_llm",
      new ChatOpenAI({
        model: "MiniMax-M3",
        apiKey: minimaxKey,
        configuration: { baseURL: "https://api.minimaxi.com/v1" }, // 中国区端点
      }),
    );
  }

  if (
    !minimaxKey &&
    !process.env["AGENT_MODEL"] &&
    !process.env["AGENT_MAIN_MODEL"]
  ) {
    console.error(
      "未配置模型。设 MINIMAX_API_KEY（MiniMax 中国区），或 AGENT_MODEL（如 openai:gpt-4o-mini）+ 对应 API Key。",
    );
    process.exitCode = 1;
    return;
  }

  const name = process.env["AGENT"] ?? "search";
  // checkpointer 让同一 thread_id 的多轮对话自动保留上下文（每轮只需发新消息）。
  const agent = await Agent.create(name, { checkpointer: new MemorySaver() });
  let thread = "cli";

  const rl = createInterface({ input: stdin, output: stdout });
  console.log(
    `已加载 agent「${name}」。直接输入开始对话；/exit 退出，/reset 新会话。`,
  );

  try {
    for (;;) {
      const input = (await rl.question("\n你 › ")).trim();
      if (input === "") continue;
      if (input === "/exit" || input === "/quit") break;
      if (input === "/reset") {
        thread = `cli-${Date.now()}`; // 换 thread_id 即开一段全新上下文
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
