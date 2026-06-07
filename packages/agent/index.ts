/**
 * @openconsole/agent —— magic 的声明式 Agent 层，编译到 DeepAgent 之上。
 *
 * 这里是公共 API 的统一出口（barrel）。架构说明以及 magic -> DeepAgent 的
 * 映射关系详见 README.md。
 */
export {
  Agent,
  subagent,
  type CreateAgentOptions,
  type SubagentOptions,
} from "./src/kernel/agent";
export { Tool, type ToolDef } from "./src/capabilities/tool";
export {
  Crew,
  type CrewInput,
  type CrewMeta,
  type CompiledCrew,
} from "./src/lang/crew";
export { models, ModelRegistry, type ModelRef } from "./src/kernel/model";
export { registry, ToolRegistry } from "./src/kernel/registry";
export { render, strip, type RenderOptions } from "./src/lang/template";
export { cache, type LoadOptions } from "./src/lang/load";
export { type ParsedAgentFile, type Frontmatter } from "./src/lang/parse";
export { type BuildOptions, type BuiltAgent } from "./src/kernel/build";
export { Mcp, type McpServers, type McpOptions } from "./src/capabilities/mcp";
export { Sandbox, type RunJsOptions, type RunJsResult } from "./src/capabilities/sandbox";
export { Skill } from "./src/capabilities/skill";
export {
  middlewares,
  MiddlewareRegistry,
  horizon,
  observe,
  guard,
  type HorizonInject,
  type GuardPolicy,
  type GuardDecision,
} from "./src/kernel/middleware";
export {
  Hook,
  type Hooks,
  type PreToolUse,
  type PostToolUse,
  type StopEvent,
  type PreToolDecision,
} from "./src/capabilities/hooks";
export {
  Session,
  type SessionOptions,
  type RunOptions,
  type Input,
  type RunnableGraph,
} from "./src/kernel/session";
export {
  events,
  type Event,
  type Usage,
  type EventSink,
  type ToEventsOptions,
  type RunStream,
} from "./src/kernel/event";
export {
  use,
  plugins,
  manager,
  PluginRegistry,
  PluginManager,
  type Plugin,
  type PluginApi,
  type Teardown,
  type Order,
  type ToolGate,
} from "./src/kernel/plugin";
export { builtins } from "./src/plugins/builtins";
export { checkpoint } from "./src/capabilities/store";
export { makeRunPython, type PythonToolOptions } from "./src/capabilities/tools/python";
export type { FilesystemPermission } from "deepagents";
export * from "./src/types";
export * from "./src/capabilities/tools";
