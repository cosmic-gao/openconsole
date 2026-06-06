import type { BaseMessage } from "@langchain/core/messages";
import type { StructuredTool } from "@langchain/core/tools";
import type { SubAgent } from "deepagents";

import { build, type BuildOptions, type BuiltAgent } from "./build";
import { load, type LoadOptions } from "./load";
import { models, type ModelRef } from "./model";
import { parse } from "./parse";
import { registry as defaultRegistry, type ToolRegistry } from "./registry";

/** {@link Agent.create} 的选项：加载选项 + 全部 {@link BuildOptions}。 */
export interface CreateAgentOptions extends BuildOptions {
  /** 存放 `.agent` 文件的目录。 */
  agentsDir?: string;
  /** 提示词模板所需的变量。 */
  vars?: Record<string, string>;
}

/** 从图（graph）的结果 state 中提取最后一条消息的文本（用官方 BaseMessage.text，自动处理多模态分块）。 */
function lastText(state: unknown): string {
  const messages = (state as { messages?: BaseMessage[] }).messages;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  return typeof last?.text === "string" ? last.text : "";
}

/**
 * 对已编译 DeepAgent 的轻量运行时封装。负责加载并编译 `.agent` 定义，
 * 并对外暴露 `run` / `stream`。底层图保留在 `.graph` 上，供需要完整
 * LangGraph 能力（streamEvents、checkpointing 等）的调用方使用。
 */
export class Agent {
  private constructor(readonly graph: BuiltAgent) {}

  /** 将 `.agent` 文件文本解析为 frontmatter 字段与原始正文。 */
  static parse = parse;
  /** 加载一个 `.agent` 定义并完整渲染为 {@link AgentSpec}。 */
  static load = load;
  /** 把 {@link AgentSpec} 编译为 DeepAgent。 */
  static build = build;

  /** 加载 `<name>.agent`，编译它，返回一个就绪的 {@link Agent}。 */
  static async create(
    name: string,
    options: CreateAgentOptions = {},
  ): Promise<Agent> {
    // 把加载相关选项（agentsDir/vars）从构建选项中剥离出来，分别传给 Agent.load 与 build
    const { agentsDir, vars, ...buildOpts } = options;
    const loadOpts: LoadOptions = {};
    if (agentsDir !== undefined) loadOpts.agentsDir = agentsDir;
    if (vars !== undefined) loadOpts.vars = vars;
    const spec = await load(name, loadOpts);
    return new Agent(build(spec, buildOpts));
  }

  /** 执行一轮对话，返回最终的助手文本。 */
  async run(query: string): Promise<string> {
    const state = await this.graph.invoke({
      messages: [{ role: "user", content: query }],
    });
    return lastText(state);
  }

  /** 以流式方式返回一轮对话的图 state 更新（LangGraph stream）。 */
  stream(query: string) {
    return this.graph.stream({ messages: [{ role: "user", content: query }] });
  }
}

/** {@link subagent} 的选项。 */
export interface SubagentOptions {
  /** 存放 `.agent` 文件的目录。 */
  agentsDir?: string;
  /** 提示词模板所需的变量。 */
  vars?: Record<string, string>;
  /** 覆盖给主 agent 看的委派描述（task() 据此选择子 agent）。 */
  description?: string;
  /** 覆盖工具实例（默认按 `.agent` 的 tools 名从注册表解析）。 */
  tools?: StructuredTool[];
  /** 覆盖模型（默认解析 `.agent` 的 llm；解析失败则继承主 agent 模型）。 */
  model?: ModelRef;
  /** 解析工具名所用的注册表。默认共享 {@link registry}。 */
  registry?: ToolRegistry;
}

/**
 * 把一个 `.agent` 定义加载成 DeepAgent 的 {@link SubAgent}，用于多智能体编排：
 *
 * ```ts
 * const agent = await Agent.create("magic", {
 *   subagents: [await subagent("search"), await subagent("explore")],
 * });
 * ```
 *
 * 主 agent 据此自动获得内置 `task()` 工具，按 `description` 选择并委派给子 agent
 * （星型、深度 1，等价 magic 的 `call_subagent`）。
 */
export async function subagent(
  name: string,
  options: SubagentOptions = {},
): Promise<SubAgent> {
  const loadOpts: LoadOptions = {};
  if (options.agentsDir !== undefined) loadOpts.agentsDir = options.agentsDir;
  if (options.vars !== undefined) loadOpts.vars = options.vars;
  const spec = await load(name, loadOpts);

  const reg = options.registry ?? defaultRegistry;
  const tools = options.tools ?? reg.get(Object.keys(spec.tools));

  // 默认尊重 .agent 里声明的 llm（子 agent 可用与主 agent 不同的模型）；
  // 若当前环境无法解析该模型，则不设 model，交由 DeepAgent 继承主 agent 的模型。
  let model = options.model;
  if (model === undefined) {
    try {
      model = models.resolve(spec.modelId);
    } catch {
      /* 解析失败：保持 undefined，继承主 agent 模型 */
    }
  }

  const sub: SubAgent = {
    name,
    description:
      options.description ??
      `Delegate a focused subtask to the "${name}" agent.`,
    systemPrompt: spec.prompt,
    tools,
  };
  if (model !== undefined) sub.model = model;
  return sub;
}
