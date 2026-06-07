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
} from "./src/agent";
export { Tool, type ToolDef } from "./src/tool";
export {
  Crew,
  type CrewInput,
  type CrewMeta,
  type CompiledCrew,
} from "./src/crew";
export { models, ModelRegistry, type ModelRef } from "./src/model";
export { registry, ToolRegistry } from "./src/registry";
export { render, strip, type RenderOptions } from "./src/template";
export { cache, type LoadOptions } from "./src/load";
export { type ParsedAgentFile, type Frontmatter } from "./src/parse";
export { type BuildOptions, type BuiltAgent } from "./src/build";
export { Mcp, type McpServers, type McpOptions } from "./src/mcp";
export { Sandbox, type RunJsOptions, type RunJsResult } from "./src/sandbox";
export { Skill } from "./src/skill";
export {
  middlewares,
  MiddlewareRegistry,
  horizon,
  observe,
  guard,
  type HorizonInject,
  type GuardPolicy,
  type GuardDecision,
} from "./src/middleware";
export {
  Hook,
  type Hooks,
  type PreToolUse,
  type PostToolUse,
  type StopEvent,
  type PreToolDecision,
} from "./src/hooks";
export {
  Session,
  type SessionOptions,
  type RunOptions,
  type Input,
  type RunnableGraph,
} from "./src/session";
export {
  events,
  type Event,
  type Usage,
  type EventSink,
  type ToEventsOptions,
  type RunStream,
} from "./src/event";
export {
  use,
  collect,
  plugins,
  PluginRegistry,
  type Plugin,
  type PluginContext,
  type Teardown,
  type UseTarget,
} from "./src/plugin";
export { builtins } from "./src/plugins";
export { checkpoint } from "./src/store";
export { makeRunPython, type PythonToolOptions } from "./src/tools/python";
export type { FilesystemPermission } from "deepagents";
export * from "./src/types";
export * from "./src/tools";
