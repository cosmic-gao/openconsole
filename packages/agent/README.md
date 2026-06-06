# @openconsole/agent

> 把 [dtyq/magic](https://github.com/dtyq/magic) 的**声明式 agent 层**，移植到 TypeScript，底座用 **[DeepAgent](https://github.com/langchain-ai/deepagentsjs)**（`deepagents`，LangChain 的开箱即用 agent 框架）。

这是一个**架构脚手架**：magic 的 agent 系统有约 85 个工具、crew/claw 多智能体、skills、MCP 等，本包不照搬，而是抽离其最有特色的部分——`.agent` 声明式格式、`{{ @… }}` 提示词模板引擎、crew 编译器——并装配到 DeepAgent 上，附带几个全开源示例工具。其余能力作为 [Phase-2 路线图](#phase-2-路线图) 增量补齐。

## 核心思想

magic 在自己的 Python 运行时里手写了一整套 ReAct 循环、规划、子 agent、文件系统、压缩。**这些 DeepAgent 已全部内置**，所以“抽离 agent”不是重写循环，而是：

1. **移植声明式层**——`.agent` 文件、模板引擎、crew 编译器（magic 的特色 IP）；
2. **桥接工具**——把 magic 的 `BaseTool`（zod 参数 + `ToolResult`）映射成 LangChain 工具；
3. **装配**——把一个 `.agent` 编译成 `createDeepAgent({...})`。

### magic → DeepAgent 映射

| magic（`super-magic`）                                          | 本包                                          | DeepAgent 承接                                                   |
| --------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| `app/magic/agent.py` 主循环/重试/状态机                         | ——                                            | DeepAgent / LangGraph 主循环                                     |
| `todo_*`（todo 驱动续跑）                                       | ——                                            | 内置 `write_todos` 规划                                          |
| `call_subagent`（星型，深度 1）                                 | `subagent()` / `Agent.build` 装配 `subagents` | 内置 `task()` 工具                                               |
| 文件工具 `read/write/edit/list/grep`                            | ——                                            | 内置 filesystem（`ls/read_file/write_file/edit_file/glob/grep`） |
| skills（`SKILL.md` 渐进披露）                                   | `Agent.load` 产出 skills 路径                 | `createDeepAgent({ skills })`                                    |
| `compact_chat_history`                                          | ——                                            | 内置 summarization                                               |
| 记忆工具                                                        | ——                                            | 内置 memory（`createDeepAgent({ memory })`）                     |
| `ToolFactory`/`@tool`/`ToolResult`                              | `registry` + `Tool.define` + `types.ts`       | LangChain `tool()` + zod                                         |
| `LLMFactory` 模型别名                                           | `ModelRegistry` / `models.resolve`            | `"provider:model"` 串 / chat-model 实例                          |
| `.agent` 解析（`parser.py`）                                    | `Agent.parse`                                 | ——                                                               |
| `{{ @… }}` + `<!--zh-->`（`syntax.py`+`annotation_remover.py`） | `render` / `strip`                            | ——                                                               |
| `AgentLoader`（`loader.py`）                                    | `Agent.load`                                  | ——                                                               |
| crew 编译器（`crew_agent_compiler.py`）                         | `Crew.compile`                                | ——                                                               |

## 安装

包在 monorepo 内（`@openconsole/*`），随 `pnpm install` 一并装好。运行时依赖均为开源：`deepagents`、`langchain`、`@langchain/{core,langgraph,openai,anthropic}`、`zod`、`yaml`、`turndown`、`cheerio`、`duck-duck-scrape`。

## 快速开始

```ts
import { Agent } from "@openconsole/agent";

// 加载内置的 search agent（packages/agent/agents/search.agent），编译成 DeepAgent
const agent = await Agent.create("search");
const answer = await agent.run("Node.js 当前的 LTS 版本是多少？给出来源 URL。");
console.log(answer);
```

### API 速览（领域分组、方法皆单词）

| 操作                       | 调用                                                         |
| -------------------------- | ------------------------------------------------------------ |
| 解析 `.agent` 文本 → spec  | `Agent.parse(text)`                                          |
| 加载并渲染 `.agent` → spec | `await Agent.load("search")`                                 |
| 把 spec 编译成 DeepAgent   | `Agent.build(spec)`                                          |
| 一步加载+构建（最常用）    | `await Agent.create("search")`                               |
| 运行 / 流式                | `agent.run("...")` / `agent.stream("...")`                   |
| 定义工具                   | `Tool.define({ name, description, schema, execute })`        |
| 注册 / 解析工具名          | `registry.register(t)` / `registry.get(names)`               |
| 注册 / 解析模型            | `models.register(alias, ref)` / `models.resolve("main_llm")` |
| 编译 crew                  | `Crew.compile({ identity, template })`                       |
| 渲染 / 剥离模板            | `render(body, opts)` / `strip(text)`                         |
| 加载子 agent               | `await subagent("explore")`                                  |

### 配置模型（厂商无关、开源优先）

两种方式，按需选用。

**方式一：环境变量。** 不写死默认模型，用 `"provider:model"` 给出：

```bash
# OpenAI
AGENT_MODEL=openai:gpt-4o-mini            OPENAI_API_KEY=...
# Anthropic
AGENT_MODEL=anthropic:claude-sonnet-4-5   ANTHROPIC_API_KEY=...
# 纯本地开源（Ollama / vLLM / LM Studio，OpenAI 兼容接口，免云端 key）
AGENT_MODEL=openai:llama3.1  OPENAI_BASE_URL=http://localhost:11434/v1  OPENAI_API_KEY=ollama
```

**方式二：代码里统一注册（`ModelRegistry`）。** 与 `ToolRegistry` 对称，把所有模型集中注册、统一取用——注册值可以是 `"provider:model"` 字符串，也可以是已配置好的 chat-model 实例：

```ts
import { ChatAnthropic } from "@langchain/anthropic";

import { models } from "@openconsole/agent";

models.registerAll({
  main_llm: "openai:gpt-4o-mini", // 别名 -> provider:model
  coder_llm: new ChatAnthropic({ model: "claude-sonnet-4-5", temperature: 0 }), // 别名 -> 实例
});
```

`.agent` 里的 `llm:` 字段就是注册到这里的别名（如 `main_llm`），`models.resolve` 解析时**先查注册表**，未命中再回退到环境变量；也可在 `.agent` 直接写 `llm: openai:gpt-4o-mini`。

## 目录结构（扁平、单词化）

```
src/
  types.ts      公共类型 + zod schema（AgentSpec、SkillsConfig、ToolResult）
  parse.ts      Agent.parse / split —— 解析 .agent 的 YAML frontmatter
  template.ts   render / strip —— {{ @include/@variable/@env/... }} 展开 + 剥离 <!--zh-->
  load.ts       Agent.load —— 读 .agent → 解析 → 渲染成系统提示词
  model.ts      ModelRegistry / models —— 模型统一注册与解析（models.resolve）
  registry.ts   ToolRegistry / registry —— 工具按名注册与解析
  tool.ts       Tool.define —— zod + ToolResult 桥接成 LangChain tool()
  build.ts      Agent.build —— 把 AgentSpec 装配成 createDeepAgent(...)
  agent.ts      Agent（parse/load/build/create + run/stream）+ subagent
  crew.ts       Crew.compile —— IDENTITY/AGENTS/SOUL/TOOLS/SKILLS → 一个 .agent
  tools/        内置工具：think、ask、web_search(search)、read_webpages_as_markdown(fetch)
agents/         内置定义：search.agent、explore.agent、crew.template.agent + prompts/
examples/       search.ts —— load → build → run 全流程
tests/          parse/template/load/crew/registry/build/model/subagent 单测
```

命名约定：导出方法尽量是**单个单词**，靠所属类/对象（`Agent` / `Tool` / `Crew` / `models` / `registry`）提供语境。

## `.agent` 文件格式

YAML frontmatter + 模板化正文：

```
---
llm: main_llm                 # 必填：模型别名或 provider:model
tools:                        # 必填：工具名白名单（Agent.build 经 registry 解析）
  - web_search
  - read_webpages_as_markdown
  - think
skills:                       # 可选：渐进披露的技能（当前不自动接线，见 Phase-2）
  system_skills: "*"
---
<role>
{{ @variable("agent_profile") }}
<!--zh: 这种中文是开发者注释，渲染前被剥离，不进入模型 -->
You are ...
</role>
<context>
{{ @include(path="./prompts/static_context.prompt") }}
</context>
```

模板指令：`@include`（递归 + 环检测）、`@variable`、`@env`、`@config`、`@datetime`、`@uuid`、`@random`。`<!--zh: …-->`（行内）与 `<!--zh … -->`（块）注释在渲染前被剥离——仅模型看英文正文，中文留给开发者。`@config` 仅在直接调用 `render(body, { config })` 时生效。

## 多智能体（子 agent 编排）

DeepAgent 在存在 `subagents` 时会自动给主 agent 装上内置 `task()` 工具，按子 agent 的 `description` 选择并委派（星型、深度 1，等价 magic 的 `call_subagent`）。`subagent()` 助手把任意 `.agent` 一行加载成子 agent：

```ts
import { Agent, subagent } from "@openconsole/agent";

const agent = await Agent.create("search", {
  subagents: [
    await subagent("explore"), // 复用内置 explore.agent
    await subagent("search", { description: "Deep web research on a single question." }),
  ],
});
```

子 agent 默认沿用各自 `.agent` 里声明的 `llm`（可与主 agent 用不同模型）；当前环境解析不出该模型时，则继承主 agent 的模型。也可用 `subagent(name, { model, tools, description })` 覆盖。

## 扩展点（极简：参数 / 接口 / 注册表）

**加工具** —— `Tool.define` + `registry.register`：

```ts
import { z } from "zod";

import { ok, registry, Tool } from "@openconsole/agent";

const echo = Tool.define({
  name: "echo",
  description: "Echo the input.",
  schema: z.object({ text: z.string() }),
  execute: ({ text }) => ok(text),
});
registry.register(echo); // 之后任何 .agent 的 tools 列表写 "echo" 即可
```

**注册模型** —— `models.register(alias, ref)`，见上文[配置模型](#配置模型厂商无关开源优先)。

**换搜索后端** —— 实现 `SearchProvider`：

```ts
import { setSearchProvider } from "@openconsole/agent";

setSearchProvider({
  async search(q, n) {
    /* Tavily / SearxNG / Brave ... */ return [];
  },
});
```

**人机协作（HITL）** —— 给 `Agent.create` 传 `interruptOn` + `checkpointer`，在敏感工具前暂停等待批准：

```ts
import { MemorySaver } from "@langchain/langgraph";

const agent = await Agent.create("search", {
  interruptOn: { ask: true },
  checkpointer: new MemorySaver(),
});
```

**skills** —— DeepAgent 的 skills 是 backend 上的 `SKILL.md` 路径。配 `FilesystemBackend` + `Agent.create(name, { skills: ["/skills/"] })` 即可启用渐进披露。

**crew（员工）** —— 用 `Crew.compile` 把 5 个 markdown 文件编译成一个 `.agent`：

```ts
import { Crew } from "@openconsole/agent";

const { agent, meta } = Crew.compile({ template, identity, agents, soul, tools, skills });
```

## 设计原则

- **极简**：用最少文件表达架构，合并同职责模块，不做没有新语义的包装层。
- **可扩展不过度**：扩展只走参数 / 接口 / 注册表（工具用 `ToolRegistry`，模型用 `ModelRegistry`），不靠继承或预埋抽象。
- **命名**：文件用行业通用单词；导出方法尽量单个单词，靠所属类/对象给语境（`Agent.parse`、`Tool.define`、`Crew.compile`、`models.resolve`）。
- **开源优先、厂商无关**：示例工具用免 key 的开源库，模型支持本地开源后端。

## 与 magic 的取舍

- magic 的逐轮 `AgentHorizon` 上下文注入、两级 LLM 重试**本次不做**（DeepAgent 主循环 + summarization 已覆盖常见场景）。
- 工具名沿用 magic（`web_search`/`read_webpages_as_markdown`）；文件类能力直接用 DeepAgent 内置的 `ls/read_file/grep`（名字与 magic 的 `list_dir/grep_search` 不同）。

## Phase-2 路线图

完整工具目录（magic 余下约 70 个）、MCP（LangChain MCP adapters）、完整 crew/claw 运行时与发布链路、`AgentHorizon` 式系统上下文注入（自定义中间件）、socket/事件流式、Code-Mode（`run_sdk_snippet`）执行器。

## 开发

```bash
pnpm --filter @openconsole/agent typecheck   # tsc --noEmit
pnpm --filter @openconsole/agent test        # vitest（29 个用例）
pnpm --filter @openconsole/agent example     # 跑 examples/search.ts（需配置模型）
```
