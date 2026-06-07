/**
 * 预置插件 —— 把本包自带的能力打包成 {@link Plugin}，作为「显式装配」入口与第三方
 * 插件的官方样板。
 *
 * 注意：内置工具仍保持「`import "./tools"` 即自动注册进共享 {@link registry}」的
 * 向后兼容行为（见 ./tools/index）。{@link builtins} 插件是其**显式**等价物，用于
 * 隔离注册表（`use([builtins], { tools: new ToolRegistry() })`）或需要可 teardown
 * 生命周期的场景。
 */
import type { Plugin } from "./plugin";
import { builtinTools } from "./tools";

/** 把本包全部内置工具打包成插件（与「import 即自动注册」并存的显式装配入口）。 */
export const builtins: Plugin = {
  name: "builtins",
  tools: builtinTools,
};
