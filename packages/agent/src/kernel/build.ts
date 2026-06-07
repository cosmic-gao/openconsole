import type { StructuredTool } from "@langchain/core/tools";
import type { InteropZodObject } from "@langchain/core/utils/types";
import type { BaseCheckpointSaver, BaseStore } from "@langchain/langgraph";
import {
  createDeepAgent,
  type AnyBackendProtocol,
  type FilesystemPermission,
  type SubAgent,
  type SupportedResponseFormat,
} from "deepagents";
import type { AgentMiddleware } from "langchain";

import { models, type ModelRef } from "./model";
import { manager } from "./plugin";
import { registry as defaultRegistry, type ToolRegistry } from "./registry";
import type { AgentSpec } from "../types";

/**
 * {@link build} 的选项。所有可变部分都通过 `opts` 覆盖 —— 扩展方式是
 * 「传值」而非「继承」。默认值在 DeepAgent 内置运行时之上复现 magic 的接线方式
 *（文件系统、任务、子代理、历史摘要等已由 `createDeepAgent` 默认提供）。
 *
 * middleware / memory / permissions / responseFormat / contextSchema 均透传给 createDeepAgent。
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
  /** 追加在 DeepAgent 内置中间件之后的自定义中间件（见 ./middleware 与 ./hooks）。 */
  middleware?: AgentMiddleware[];
  /** 要加载的记忆文件路径（AGENTS.md）；启动时读入并并进系统提示词。 */
  memory?: string[];
  /** 文件系统权限规则：按声明顺序首匹配胜、默认 allow；作用于 ls/read_file/write_file/edit_file/glob/grep。 */
  permissions?: FilesystemPermission[];
  /** 结构化输出格式（Zod schema 或 createAgent 支持的其它格式）；设置后图 state 产出 structuredResponse。 */
  responseFormat?: SupportedResponseFormat;
  /** 只读的 context schema（不跨调用持久化），供中间件经 runtime.context 读取。 */
  contextSchema?: InteropZodObject;
}

/**
 * 把 {@link AgentSpec} 编译为 DeepAgent。这里是 magic -> DeepAgent 的衔接点：
 * `spec.prompt` 成为系统提示词，`spec.tools` 的名字解析为工具实例，
 * 运行时的其余部分都来自 DeepAgent 的默认实现。
 *
 * middleware / memory / permissions / responseFormat / contextSchema 一并透传给 createDeepAgent。
 */
export function build(spec: AgentSpec, options: BuildOptions = {}) {
  // 装配期：先应用已装配插件的 modifySpec（链式改 model/tools/prompt）。
  const finalSpec = manager.applySpec(spec);
  const model = options.model ?? models.resolve(finalSpec.modelId);
  const reg = options.registry ?? defaultRegistry;
  const tools = options.tools ?? reg.get(Object.keys(finalSpec.tools));
  // 插件运行时 hooks 编译出的中间件 + 用户传入的中间件。
  const pluginMw = manager.middleware();
  const middleware = [
    ...(options.middleware ?? []),
    ...(pluginMw ? [pluginMw] : []),
  ];

  // 注意：这里不手动挂载文件系统/任务/摘要等中间件 —— createDeepAgent 默认已内置它们。
  // systemPrompt 直接取已渲染好的 spec.prompt（模板展开 + 注释剥离均已在 Agent.load 阶段完成）。
  // 下面这些可选项采用「有值才展开」的写法：用 `?? {}` 在未设置时展开为空对象，
  // 从而不向 createDeepAgent 传入 undefined，让其各自的内部默认值生效。
  return createDeepAgent({
    model,
    tools,
    systemPrompt: finalSpec.prompt,
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
    ...(middleware.length > 0 ? { middleware } : {}),
    ...(options.memory !== undefined ? { memory: options.memory } : {}),
    ...(options.permissions !== undefined ? { permissions: options.permissions } : {}),
    ...(options.responseFormat !== undefined
      ? { responseFormat: options.responseFormat }
      : {}),
    ...(options.contextSchema !== undefined
      ? { contextSchema: options.contextSchema }
      : {}),
  });
}

/** {@link build} 返回的、已编译的 DeepAgent 类型。 */
export type BuiltAgent = ReturnType<typeof build>;
