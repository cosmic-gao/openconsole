---
name: using-mcp
description: Discover and call tools exposed by connected MCP servers, and when to prefer them over built-in tools.
---

# Using MCP tools

Tools from connected MCP (Model Context Protocol) servers appear alongside the built-in tools. Prefer an MCP tool when it directly matches the task — for example a filesystem, database, browser, or third-party API server — instead of reimplementing the capability with shell or code.

Guidelines:

- Read each tool's name, description, and parameter schema before calling it.
- Pass arguments exactly as the schema requires; never invent fields.
- If a tool can return a large payload, request only what you need and summarize the rest rather than echoing everything into the conversation.
- If no MCP tool fits the task, fall back to the built-in tools.
