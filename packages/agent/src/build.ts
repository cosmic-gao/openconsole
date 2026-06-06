import type { StructuredTool } from "@langchain/core/tools";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import {
  createDeepAgent,
  type AnyBackendProtocol,
  type SubAgent,
} from "deepagents";

import { models, type ModelRef } from "./model";
import { registry as defaultRegistry, type ToolRegistry } from "./registry";
import type { AgentSpec } from "./types";

/**
 * {@link build} 的选项。所有可变部分都通过 `opts` 覆盖 —— 扩展方式是
 * 「传值」而非「继承」。默认值在 DeepAgent 内置运行时之上复现 magic 的接线方式
 *（文件系统、任务、子代理、历史摘要等已由 `createDeepAgent` 默认提供）。
 *
 * 注意：memory / permissions / responseFormat / middleware 等 createDeepAgent 选项本期未透传（见 Phase-2）。
 */
export interface BuildOptions {
  /** 覆盖模型。默认为 `models.resolve(spec.modelId)`。 */
  model?: ModelRef;
  /** 工具实例。默认把 `spec.tools` 的名字在 {@link registry} 中解析得到。 */
  tools?: StructuredTool[];
  /** 用于解析工具名的注册表。默认使用共享的 {@link registry}。 */
  registry?: ToolRegistry;
  /** 可委派的子代理（存在时 DeepAgent 会暴露内置的 `task()` 工具）。 */
  subagents?: SubAgent[];
  /** Skill 源路径（POSIX 风格，相对于 backend 根目录）。 */
  skills?: string[];
  /** 文件系统 backend。默认使用 DeepAgent 基于 state 的虚拟文件系统。 */
  backend?: AnyBackendProtocol;
  /** 人机协作：需要暂停的工具名（如 `{ ask: true }`）。需要配合 checkpointer。 */
  interruptOn?: Record<string, boolean>;
  /** LangGraph checkpointer：启用 interruptOn（人机协作）与跨轮状态持久化所必需。 */
  checkpointer?: BaseCheckpointSaver | boolean;
  /** LangGraph store：用于长期记忆。 */
  store?: BaseStore;
  /** 代理名称。 */
  name?: string;
}

/**
 * 把 {@link AgentSpec} 编译为 DeepAgent。这里是 magic -> DeepAgent 的衔接点：
 * `spec.prompt` 成为系统提示词，`spec.tools` 的名字解析为工具实例，
 * 运行时的其余部分都来自 DeepAgent 的默认实现。
 *
 * 注意：memory / permissions / responseFormat / middleware 等 createDeepAgent 选项本期未透传（见 Phase-2）。
 */
export function build(spec: AgentSpec, options: BuildOptions = {}) {
  const model = options.model ?? models.resolve(spec.modelId);
  const reg = options.registry ?? defaultRegistry;
  const tools = options.tools ?? reg.get(Object.keys(spec.tools));

  // 注意：这里不手动挂载文件系统/任务/摘要等中间件 —— createDeepAgent 默认已内置它们。
  // systemPrompt 直接取已渲染好的 spec.prompt（模板展开 + 注释剥离均已在 Agent.load 阶段完成）。
  // 下面这些可选项采用「有值才展开」的写法：用 `?? {}` 在未设置时展开为空对象，
  // 从而不向 createDeepAgent 传入 undefined，让其各自的内部默认值生效。
  return createDeepAgent({
    model,
    tools,
    systemPrompt: spec.prompt,
    ...(options.subagents !== undefined
      ? { subagents: options.subagents }
      : {}),
    ...(options.skills !== undefined ? { skills: options.skills } : {}),
    ...(options.backend !== undefined ? { backend: options.backend } : {}),
    ...(options.interruptOn !== undefined
      ? { interruptOn: options.interruptOn }
      : {}),
    ...(options.checkpointer !== undefined
      ? { checkpointer: options.checkpointer }
      : {}),
    ...(options.store !== undefined ? { store: options.store } : {}),
    ...(options.name !== undefined ? { name: options.name } : {}),
  });
}

/** {@link build} 返回的、已编译的 DeepAgent 类型。 */
export type BuiltAgent = ReturnType<typeof build>;
