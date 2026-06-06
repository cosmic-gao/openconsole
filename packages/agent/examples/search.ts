/**
 * 最小端到端示例：加载 `search` 代理，将其编译到 DeepAgent 之上，并执行一轮对话。
 *
 * 需要一个模型。请设置以下其一：
 *   AGENT_MODEL=openai:gpt-4o-mini           OPENAI_API_KEY=...
 *   AGENT_MODEL=anthropic:claude-sonnet-4-5  ANTHROPIC_API_KEY=...
 *   # 或者一个本地的 OpenAI 兼容服务（Ollama / vLLM / LM Studio）：
 *   AGENT_MODEL=openai:llama3.1  OPENAI_BASE_URL=http://localhost:11434/v1  OPENAI_API_KEY=ollama
 *
 * 运行：pnpm --filter @openconsole/agent example
 */
import { ChatOpenAI } from "@langchain/openai";

import { Agent, models } from "../index"; // 导入 barrel 会自动注册内置工具

async function main(): Promise<void> {
  models.register(
    "main_llm",
    new ChatOpenAI({
      model: "MiniMax-M3", // “minimax 2.7”
      apiKey:
        "sk-cp-ALjB-RD09EIx8OiQpseV-gGC1TzBFn6lG-oJjkCnOkyzp1pQReJJD8s2iktZq8ZrtbwHclJ0wTy5cJSuTEA0ao-OZYCqKdtkzC9hwnEmhYnwxqu7w4DzVH8",
      configuration: { baseURL: "https://api.minimaxi.com/v1" }, // 国内账号换成控制台给的对应 base URL
    }),
  );

  const agent = await Agent.create("search");
  const answer = await agent.run(
    "What is the current Node.js LTS version? Cite a source URL.",
  );
  console.log("\n=== answer ===\n" + answer);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
