# @openconsole/agent

> 把 [dtyq/magic](https://github.com/dtyq/magic) 的**声明式 agent 层**，移植到 TypeScript，底座用 **[DeepAgent](https://github.com/langchain-ai/deepagentsjs)**（`deepagents`，LangChain 的开箱即用 agent 框架）。全部依赖均为开源（MIT/Apache），不含任何商业云。

本包抽离 magic 最有特色的部分——`.agent` 声明式格式、`{{ @… }}` 提示词模板引擎、crew 编译器——装配到 DeepAgent 上，并集成了 **SKILL**、**MCP** 与**安全沙箱**。其余能力（完整工具目录、claw 运行时等）见 [Phase-2 路线图](#phase-2-路线图)。

## 核心思想

magic 在自己的 Python 运行时里手写了一整套 ReAct 循环、规划、子 agent、文件系统、压缩。**这些 DeepAgent 已全部内置**，所以“抽离 agent”不是重写循环，而是：

1. **移植声明式层**——`.agent` 文件、模板引擎、crew 编译器（magic 的特色 IP）；
2. **桥接工具**——把 magic 的 `BaseTool`（zod 参数 + `ToolResult`）映射成 LangChain 工具；
3. **装配**——把一个 `.agent` 编译成 `createDeepAgent({...})`，并接通 SKILL/MCP/沙箱。

### magic → DeepAgent 映射

| magic（`super-magic`）                                               | 本包                                                            | 承接                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 主循环/重试/状态机、`todo_*`、`compact_chat_history`、记忆、文件工具 | ——                                                              | DeepAgent 内置（loop / write_todos / summarization / memory / filesystem） |
| `call_subagent`（星型，深度 1）                                      | `subagent()` / `Agent.build({subagents})`                       | 内置 `task()` 工具                                                         |
| `ToolFactory`/`@tool`/`ToolResult`                                   | `registry` + `Tool.define`                                      | LangChain `tool()` + zod                                                   |
| `LLMFactory` 模型别名                                                | `models` / `models.resolve`                                     | `"provider:model"` 串 / chat-model 实例                                    |
| `.agent` 解析 + `{{ @… }}` + `<!--zh-->`                             | `Agent.parse` / `render` / `strip`                              | ——                                                                         |
| crew 编译器                                                          | `Crew.compile`                                                  | ——                                                                         |
| skills（`SKILL.md` 渐进披露）                                        | `Skill.dir/backend` + 预置 SKILL.md                             | `createDeepAgent({ skills })`                                              |
| MCP（`app/mcp`）                                                     | `Mcp.connect/register`                                          | `@langchain/mcp-adapters`                                                  |
| `run_python_snippet` / Code Mode、sandbox                            | `Sandbox.runJs` + `run_javascript`；`Sandbox.state/local/adapt` | quickjs WASM；deepagents backend                                           |

## 安装

包在 monorepo 内（`@openconsole/*`），随 `pnpm install` 装好。运行时依赖均为开源：`deepagents`、`langchain`、`@langchain/{core,langgraph,openai,anthropic,mcp-adapters}`、`quickjs-emscripten`、`zod`、`yaml`、`turndown`、`cheerio`、`duck-duck-scrape`。

## 快速开始

```ts
import { Agent } from "@openconsole/agent";

const agent = await Agent.create("search"); // 内置 search.agent
const answer = await agent.run("Node.js 当前的 LTS 版本是多少？给出来源 URL。");
console.log(answer);
```

### API 速览（领域分组、方法皆单词）

| 操作                        | 调用                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 解析 / 加载 / 构建 / 运行   | `Agent.parse(text)` / `await Agent.load(n)` / `Agent.build(spec)` / `await Agent.create(n)` → `agent.run/stream` |
| 工具：定义 / 注册 / 解析    | `Tool.define({...})` / `registry.register(t)` / `registry.get(names)`                                            |
| 模型：注册 / 解析           | `models.register(alias, ref)` / `models.resolve("main_llm")`                                                     |
| crew 编译 / 子 agent        | `Crew.compile({...})` / `await subagent("explore")`                                                              |
| **MCP** 连接 / 注册         | `Mcp.connect(servers)` / `Mcp.register(servers)`                                                                 |
| **沙箱** 跑 JS / 选 backend | `Sandbox.runJs(code)` / `Sandbox.state() ｜ local() ｜ adapt(s)`                                                 |
| **SKILL** 目录 / backend    | `Skill.dir()` / `Skill.backend()`                                                                                |
| 模板 渲染 / 剥离            | `render(body, opts)` / `strip(text)`                                                                             |

### 配置模型（厂商无关、开源优先）

**环境变量**（不写死默认模型）：

```bash
AGENT_MODEL=openai:gpt-4o-mini            OPENAI_API_KEY=...
AGENT_MODEL=anthropic:claude-sonnet-4-5   ANTHROPIC_API_KEY=...
# 纯本地开源（Ollama / vLLM / LM Studio，OpenAI 兼容接口，免云端 key）
AGENT_MODEL=openai:llama3.1  OPENAI_BASE_URL=http://localhost:11434/v1  OPENAI_API_KEY=ollama
```

**代码里统一注册**（`ModelRegistry`，与 `ToolRegistry` 对称）：

```ts
import { ChatAnthropic } from "@langchain/anthropic";

import { models } from "@openconsole/agent";

models.registerAll({
  main_llm: "openai:gpt-4o-mini", // 别名 -> provider:model
  coder_llm: new ChatAnthropic({ model: "claude-sonnet-4-5" }), // 别名 -> 实例
});
```

`.agent` 的 `llm:` 即此处别名；`models.resolve` 先查注册表，未命中再回退到环境变量。

## 目录结构（微内核 · 能力分层）

```
src/
  types.ts            公共类型 + zod schema（AgentSpec/SkillsConfig/ToolResult）—— 零依赖共享基础
  kernel/             内核：编排 + 运行时 + 注册表 + 插件宿主（顶层不依赖 capabilities）
    agent.ts          Agent（parse/load/build/create + run/stream/session）+ subagent
    build.ts          AgentSpec → createDeepAgent（装配期咨询 manager：applySpec + middleware）
    plugin.ts         Plugin/PluginApi/PluginManager/use —— rsbuild 风格插件系统
    session.ts        Session —— 多轮/thread/resume/fork/取消
    event.ts          events.of/console —— 归一化统一事件流（有界背压）
    registry.ts       ToolRegistry / registry —— 工具按名注册
    model.ts          ModelRegistry / models —— 模型注册与解析
    middleware.ts     horizon/observe/guard + MiddlewareRegistry
  lang/               声明式 AGENT 定义层（.agent → 系统提示词）
    parse.ts          解析 .agent 的 YAML frontmatter
    template.ts       render / strip —— {{ @… }} 展开 + 剥离 <!--zh-->
    load.ts           读 .agent → 解析 → 渲染（带编译缓存）
    crew.ts           Crew.compile —— IDENTITY/AGENTS/SOUL/TOOLS/SKILLS → 一个 .agent
  capabilities/       能力实现（经 Plugin / build 选项流入内核）
    tool.ts           Tool.define —— zod + ToolResult 桥接成 LangChain tool()
    mcp.ts            Mcp.connect/register/defaults —— @langchain/mcp-adapters
    skill.ts          Skill.dir/backend —— deepagents skills middleware
    sandbox.ts        Sandbox.state/files/local/adapt + runJs —— deepagents backend + quickjs WASM
    store.ts          checkpoint.memory/sqlite —— 持久化 checkpointer（SQLite 可选依赖）
    hooks.ts          Hook.middleware —— Claude Code 式 preToolUse/postToolUse/stop
    tools/            内置工具(11)：think、ask；web_search、image_search、read_webpages_as_markdown、http_request、download；run_javascript、run_python；current_time、html_to_markdown
  plugins/            官方预置插件
    builtins.ts       把内置工具以 setup(api.addTool) 装配
agents/               内置定义：search/explore/code/crew.template.agent + prompts/
skills/               预置 SKILL.md：using-mcp、deep-research、using-sandbox
examples/             opencode —— 终端编码 agent 整合示例
tests/                62 用例（结构变、行为不变）
```

依赖单向无环：`types` ← 各层；`lang` 只依赖 `types`；`kernel` 依赖 `lang`+`types`（**顶层不依赖 `capabilities`**——`addMcp`/`setSearch` 经动态 import 按需加载能力）；`capabilities` 依赖 `kernel`；`plugins` 依赖二者。

## `.agent` 文件格式

YAML frontmatter + 模板化正文：`llm`（必填，别名或 provider:model）、`tools`（必填，工具名白名单，经 `registry` 解析）、`skills`（可选）。正文支持 `@include`（递归 + 环检测）、`@variable`、`@env`、`@config`、`@datetime`、`@uuid`、`@random`；`<!--zh: …-->` / `<!--zh … -->` 注释渲染前被剥离（仅模型看英文，中文留给开发者）。

## 多智能体（子 agent 编排）

DeepAgent 在存在 `subagents` 时自动给主 agent 装上内置 `task()` 工具，按 `description` 选择并委派（星型、深度 1，等价 magic 的 `call_subagent`）。`subagent()` 把任意 `.agent` 一行加载成子 agent：

```ts
const agent = await Agent.create("search", {
  subagents: [await subagent("explore"), await subagent("search")],
});
```

子 agent 默认沿用各自 `.agent` 的 `llm`；解析不出时继承主 agent 模型。

## MCP 集成

基于 LangChain 官方 `@langchain/mcp-adapters`（MIT）。`Mcp.connect` 拿到工具，`Mcp.register` 连接并把工具注册进 `registry`（于是任意 `.agent` 的 `tools:` 可按名引用）。预置官方 reference servers（`Mcp.defaults`：`filesystem`、`memory`、`sequential-thinking`，stdio + npx，均 MIT）：

```ts
import { Agent, Mcp, registry } from "@openconsole/agent";

const { tools, client } = await Mcp.connect({
  filesystem: { transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", process.cwd()] },
});
const agent = await Agent.create("search", {
  tools: [...registry.get(["web_search", "think"]), ...tools],
});
await agent.run("列出当前目录的文件");
await client.close(); // 用完关闭连接
```

## SKILL（技能）

用 deepagents 的 skills middleware（渐进披露：系统提示里只放 skill 的名字与描述，agent 需要时再读全文）。预置 3 个 `SKILL.md`：`using-mcp`、`deep-research`、`using-sandbox`。

```ts
import { Agent, Skill } from "@openconsole/agent";

const agent = await Agent.create("search", {
  skills: ["/"], // 相对 backend 根，扫描全部内置 SKILL.md
  backend: Skill.backend(), // 指向内置 skills 目录
});
```

自定义 skill：在某目录放 `<name>/SKILL.md`（frontmatter `name` + `description` + 正文），用 `Sandbox.files(dir)` 作 backend 即可。

## 安全沙箱（全开源）

两层，按隔离强度选用：

| 档位         | API                                           | 隔离强度                                         | 说明                                                  |
| ------------ | --------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| 虚拟文件系统 | `Sandbox.state()`                             | 无执行，最安全                                   | 默认；agent 有虚拟 FS（ls/read/write/edit/glob/grep） |
| 进程内 JS    | `Sandbox.runJs(code)` / `run_javascript` 工具 | quickjs WASM，无 Node API/网络/FS，超时+内存限制 | 安全执行模型生成的 JS（计算/数据变换）                |
| 本地 shell   | `Sandbox.local(opts)`                         | ⚠️ 弱隔离（命令在宿主机执行）                    | 仅信任环境；agent 自动获得 `execute` 工具             |
| 外部沙箱     | `Sandbox.adapt({ execute, id })`              | 取决于实现                                       | 适配自托管开源沙箱（Docker / gVisor / nsjail 等）     |

```ts
import { Agent, Sandbox } from "@openconsole/agent";

// 进程内安全执行 JS（无需模型/网络）
const r = await Sandbox.runJs("const a=[3,1,2]; console.log(a.sort()); a.length");
// => { ok: true, logs: ["[ 1, 2, 3 ]"], result: 3 }

// 给 agent 配 backend：本地 shell（弱隔离）或自托管沙箱
const agent = await Agent.create("explore", { backend: Sandbox.local() });
```

不可信代码请用 `Sandbox.runJs`（进程内 WASM 强隔离）或 `Sandbox.adapt` 接自托管开源沙箱；`Sandbox.local()` 只适合你信任 agent 的本地环境。

## 扩展点（极简：参数 / 接口 / 注册表）

```ts
import { z } from "zod";

import { ok, registry, setSearchProvider, Tool } from "@openconsole/agent";

// 加工具
registry.register(Tool.define({ name: "echo", description: "Echo the input.", schema: z.object({ text: z.string() }), execute: ({ text }) => ok(text) }));
// 换搜索后端（默认 DuckDuckGo）
setSearchProvider({
  async search(q, n) {
    /* Tavily / SearxNG ... */ return [];
  },
});
```

人机协作（HITL）：`Agent.create(name, { interruptOn: { ask: true }, checkpointer: checkpoint.memory() })`，在敏感工具前暂停等待批准。

## 插件系统（rsbuild 风格）

参考 [rsbuild](https://rsbuild.rs/plugins/dev/) 的插件架构：一个 `Plugin` = `{ name, pre?, post?, setup(api) }`，**没有静态字段**，一切通过 `setup(api)` 命令式声明。运行时 hooks 被**编译成一个 LangChain `createMiddleware`**（贴合 DeepAgent 底座，不自造 hook 总线）；`await use([...])` 后自动作用到其后 `Agent.create` 的 agent。

`api` 提供四类能力：

| 类别          | 方法                                                                     | 说明                                                                  |
| ------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 贡献          | `addTool` / `addModel` / `addMcp` / `setSearch`                          | 注册工具 / 模型别名 / MCP / 搜索后端                                  |
| 装配期 modify | `modifySpec(fn, {order})`                                                | 链式改 `AgentSpec`（model/tools/prompt）                              |
| 运行时 hooks  | `modifyPrompt` / `modifyToolCall` / `onToolResult` / `onStart` / `onEnd` | 编译成 middleware（wrapModelCall/wrapToolCall/beforeAgent/afterAgent） |
| 通信          | `expose` / `useExposed`                                                  | 插件间共享值                                                          |

顺序：插件间用 `pre`/`post` 声明依赖（装配前拓扑排序）；同阶段多个 hook 用 `order: "pre"|"default"|"post"` 排序。

```ts
import { Agent, use, Tool, ok, type Plugin } from "@openconsole/agent";
import { z } from "zod";

const myPlugin: Plugin = {
  name: "my-tools",
  pre: ["builtins"], // 在 builtins 之后装（拓扑顺序）
  setup(api) {
    api.addTool(
      Tool.define({
        name: "echo",
        description: "Echo the input.",
        schema: z.object({ text: z.string() }),
        execute: ({ text }) => ok(text),
      }),
    );
    api.addModel("fast_llm", "openai:gpt-4o-mini");
    api.modifyPrompt(() => "Always answer concisely."); // 每轮追加系统提示词
    api.modifyToolCall((c) =>
      c.name === "execute" ? { deny: "read-only" } : undefined,
    ); // 拦截工具调用
    api.expose("ready", true);
    // 需要 IO 时 setup 可 async：await api.addMcp({ ... })
  },
};

const off = await use([myPlugin]); // 装配 → 工具/hooks 即对其后 create 的 agent 生效
const agent = await Agent.create("search");
await off(); // 移除本批 hooks/exposed、关闭其 MCP 连接
```

进阶：`new PluginManager(tools, models)` 可建独立管理器做隔离装配 / 测试；全局单例 `manager` 在 `build` 装配时被咨询。预置插件 `builtins` 把内置工具以 `setup(api.addTool)` 形式装配。

## 性能

| 措施              | API / 开关                                             | 说明                                                                                          |
| ----------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| 编译缓存          | 自动；`cache.clear()` / `AGENT_NO_CACHE=1` 旁路        | `Agent.load` 按「主文件 mtime + vars」缓存已渲染 spec，省去重复读盘 + `@include` 递归 + 渲染   |
| 持久 checkpointer | `checkpoint.memory()` / `await checkpoint.sqlite(path)` | SQLite 让 session 的 history/resume/fork 跨重启保留；SQLite 走可选依赖（`pnpm add @langchain/langgraph-checkpoint-sqlite`） |
| 事件流背压        | 自动（有界通道，默认水位 256）                         | 高吞吐下 token/工具事件不在内存无界堆积，生产端随消费端自然减速                                |
| 并发              | 由 LangGraph 提供                                       | 并行工具调用 / 并行子 agent；`events.of` 三路并发消费                                            |

## 设计原则

- **贴合底座**：沙箱/skills 复用 deepagents 现成机制；MCP 用 LangChain 官方 adapter；不另造轮子。
- **极简、可扩展不过度**：扩展只走参数 / 接口 / 注册表（`registry`、`models`、`SearchProvider`、`Sandbox.adapt`），不靠继承或预埋抽象。
- **命名**：文件用行业通用单词；导出方法尽量单个单词，靠所属类/对象给语境（`Agent.parse`、`Tool.define`、`Mcp.connect`、`Sandbox.runJs`）。
- **完全开源、厂商无关**：所有依赖 MIT/Apache 且可自托管，无商业云；模型支持本地开源后端。

## 与 magic 的取舍

- magic 的逐轮 `AgentHorizon` 上下文注入、两级 LLM 重试**本期不做**（DeepAgent 主循环 + summarization 已覆盖常见场景）。
- 工具名沿用 magic（`web_search`/`read_webpages_as_markdown`）；文件类能力直接用 DeepAgent 内置的 `ls/read_file/grep`。

## Phase-2 路线图

完整工具目录（magic 余下约 70 个：媒体理解/生成、文档转换、slides/dashboard 等）、完整 crew/claw 运行时与发布链路、permission modes（plan/auto/ask）与 slash commands、headless server 层（多端接入）。（`AgentHorizon` 式上下文注入、统一事件流、插件系统、编译缓存 / 持久化均已落地。）

## 开发

```bash
pnpm --filter @openconsole/agent typecheck   # tsc --noEmit
pnpm --filter @openconsole/agent test        # vitest（60 个用例）
pnpm --filter @openconsole/agent opencode    # 简化版 opencode：终端编码 agent（examples/opencode.ts）
```
