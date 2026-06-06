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
export { defaultAgentsDir, type LoadOptions } from "./src/load";
export { type ParsedAgentFile, type Frontmatter } from "./src/parse";
export { type BuildOptions, type BuiltAgent } from "./src/build";
export * from "./src/types";
export * from "./src/tools";
