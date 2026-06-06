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
import { Agent } from "../index"; // 导入 barrel 会自动注册内置工具

async function main(): Promise<void> {
  if (!process.env["AGENT_MODEL"] && !process.env["AGENT_MAIN_MODEL"]) {
    console.error(
      'Set AGENT_MODEL (e.g. "openai:gpt-4o-mini") and the matching API key first.',
    );
    process.exitCode = 1;
    return;
  }

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
