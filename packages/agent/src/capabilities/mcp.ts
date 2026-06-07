import type { StructuredTool } from "@langchain/core/tools";
import {
  MultiServerMCPClient,
  type ClientConfig,
  type Connection,
} from "@langchain/mcp-adapters";

import { registry as defaultRegistry, type ToolRegistry } from "../kernel/registry";

/** MCP server 配置:server 名 -> 连接(stdio / http / sse)。 */
export type McpServers = Record<string, Connection>;

/** 连接 MCP 的额外选项(除 mcpServers 外的 ClientConfig 字段)。 */
export type McpOptions = Omit<ClientConfig, "mcpServers">;

/**
 * 预置的官方 reference servers(均为 MIT 开源,stdio + npx 启动)。
 * 连上即获得文件系统、长期记忆、顺序思考等工具。需本机有 npx 与网络拉包。
 */
const defaults: McpServers = {
  filesystem: {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()],
  },
  memory: {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  "sequential-thinking": {
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
  },
};

/**
 * MCP 集成。基于 LangChain 官方 `@langchain/mcp-adapters`,把 MCP server 暴露的工具
 * 转成 LangChain 工具,可直接交给 agent 或注册进 {@link registry}。
 */
export const Mcp = {
  /** 预置的官方 reference servers（filesystem / memory / sequential-thinking，MIT，stdio + npx）。 */
  defaults,

  /**
   * 连接一组 MCP server,返回其工具与底层 client。
   * 用完记得 `await client.close()` 释放连接。
   */
  async connect(
    servers: McpServers,
    options: McpOptions = {},
  ): Promise<{ tools: StructuredTool[]; client: MultiServerMCPClient }> {
    const client = new MultiServerMCPClient({
      ...options,
      mcpServers: servers,
    });
    const tools = (await client.getTools()) as unknown as StructuredTool[];
    return { tools, client };
  },

  /**
   * 连接并把工具注册进 {@link registry}(于是任意 `.agent` 的 `tools:` 都能按名引用),
   * 返回 client 供关闭。
   */
  async register(
    servers: McpServers,
    options: McpOptions = {},
    target: ToolRegistry = defaultRegistry,
  ): Promise<MultiServerMCPClient> {
    const { tools, client } = await Mcp.connect(servers, options);
    target.registerAll(tools);
    return client;
  },
};
