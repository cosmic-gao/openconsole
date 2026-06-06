/**
 * MCP 集成示例：连接官方 filesystem reference server(MIT)，把它的工具交给 agent。
 *
 * 需要：本机有 npx + 网络(首次会拉取 @modelcontextprotocol/server-filesystem)，
 * 以及配置好模型(AGENT_MODEL=... + 对应 key)。
 * 运行：pnpm --filter @openconsole/agent exec tsx examples/mcp.ts
 */
import { Agent, Mcp, registry } from "../index";

async function main(): Promise<void> {
  // 连接 filesystem MCP，限制在当前目录
  const { tools, client } = await Mcp.connect({
    filesystem: {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
    },
  });

  try {
    console.log("MCP filesystem tools:", tools.map((t) => t.name).join(", "));

    if (!process.env["AGENT_MODEL"] && !process.env["AGENT_MAIN_MODEL"]) {
      console.log(
        "(设置 AGENT_MODEL + 对应 API Key 后可继续让 agent 调用这些工具)",
      );
      return;
    }

    // 内置 web/think 工具 + MCP 文件系统工具，一起交给 agent
    const agent = await Agent.create("search", {
      tools: [
        ...registry.get(["web_search", "read_webpages_as_markdown", "think"]),
        ...tools,
      ],
    });
    console.log(await agent.run("List the files in the current directory."));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
