# @openconsole/chat

**Web 版 opencode** —— 一个 Vue 3 聊天界面，经一个极简 SSE 后端桥接
[`@openconsole/agent`](../../packages/agent) 的标准化 `Event` 流。它是终端版
[`examples/opencode.ts`](../../packages/agent/examples/opencode.ts) 的浏览器孪生：
同一个 agent、同一个模型、同一套事件模型（token / 思考 / 工具调用 / 多轮）。

```
浏览器 (Vue3 + shadcn-vue)  ──POST /api/chat──▶  SSE 后端 (node:http)
        ▲                                              │
        └──────────  text/event-stream  ◀──────────  agent.session().stream()
```

agent 跑在 Node 端（要 MiniMax key、LangGraph、文件沙箱），浏览器连不了，故由后端中转。

## 跑起来

1. 配模型：在 `packages/agent/.env` 写 `MINIMAX_API_KEY=...`（已有则直接复用；也可设 `AGENT_MODEL`）。
2. 启动（一条命令同时起后端 SSE + 前端 Vite）：

   ```bash
   pnpm --filter @openconsole/chat dev
   ```

   - 前端：http://localhost:5173
   - 后端：http://localhost:8787（Vite 已把 `/api` 代理过去，无需关心 CORS）

也可分开：`pnpm --filter @openconsole/chat dev:server` 与 `dev:web`。

## 能力

- **流式**：token 边到边渲染；**内联 `<think>` 自动拆分**（MiniMax-M2 把推理塞在 content 里），
  推理折叠在「💭 思考过程」、正文干净显示。
- **多轮**：同一 `thread` 续接历史（后端 `checkpoint.memory()`）；点右上「新会话」换 thread。
- **工具调用**：以 chip 显示，带运行中/✓/✗ 状态。
- **兜底**：模型某轮只思考没作答时给出明确提示，杜绝「回复内容丢失」。
- **中断**：生成中可点■停止。

## 安全

默认后端用 `Sandbox.state()`（**虚拟文件系统**）——Web 聊天碰不到真实磁盘与 shell。
若要让它在你的真实项目里读写代码，把 [`server/index.ts`](server/index.ts) 里的
`Sandbox.state()` 换成 `Sandbox.local({ rootDir: process.cwd() })`，并**自行加鉴权、限制网络暴露**。

## 结构

```
server/index.ts            SSE 后端：session.stream() → text/event-stream
src/lib/events.ts          Event 类型镜像 + 内联 <think> 拆分器
src/composables/useChat.ts 聊天状态机：消费 SSE、按事件更新消息
src/components/ChatView.vue 布局（消息流 + 输入 + 主题/新会话）
src/components/MessageBubble.vue 单条消息渲染（思考 / 工具 / 正文 / 用量）
src/components/ui/*        shadcn-vue 组件（Button / Textarea）
```

## 技术栈

Vue 3 `<script setup>` · Vite · Tailwind v4 · shadcn-vue (Reka UI) · lucide。
