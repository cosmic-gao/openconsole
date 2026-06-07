/**
 * 预置插件 —— 把本包自带的能力打包成 {@link Plugin}，作为「显式装配」入口与第三方
 * 插件的官方样板。
 *
 * 注意：内置工具仍保持「`import "./tools"` 即自动注册进共享 registry」的向后兼容行为
 *（见 ./tools/index）。{@link builtins} 插件是其**显式**等价物，便于走插件生命周期
 *（teardown）或在自定义 {@link PluginManager} 里隔离装配。
 */
import type { Plugin } from "../kernel/plugin";
import { builtinTools } from "../capabilities/tools";

/** 把本包全部内置工具打包成插件（rsbuild 式：在 setup 里 `api.addTool`）。 */
export const builtins: Plugin = {
  name: "builtins",
  setup(api) {
    for (const tool of builtinTools) api.addTool(tool);
  },
};
