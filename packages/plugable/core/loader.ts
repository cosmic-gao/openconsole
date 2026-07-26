/**
 * 插件加载器:`spec` → 动态 import → 取 default 导出。default 是函数则视作工厂,用 `options`
 * 调用一次(rollup / vite 插件包的通行形态)。
 */

import type { Plugin } from "./plugin";

export interface LoadOptions<O> {
  /** 传给工厂函数的入参。 */
  options?: O | undefined;
  /** 解析相对 `spec` 的基准 URL,如 `import.meta.url`;文件型 spec 必填。 */
  base?: string | undefined;
}

/**
 * @param spec npm 包名 / 相对路径 / `file:` URL
 * @throws {TypeError} default 导出不是插件(缺少 `setup`)
 */
export async function loadPlugin<O = unknown>(
  spec: string,
  load: LoadOptions<O> = {},
): Promise<Plugin> {
  const relative = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("file:");
  const target = relative && load.base ? new URL(spec, load.base).href : spec;
  const exported = ((await import(target)) as { default?: unknown }).default;
  const plugin = typeof exported === "function" ? (exported as (options?: O) => unknown)(load.options) : exported;
  if (plugin && typeof (plugin as Plugin).setup === "function") return plugin as Plugin;
  throw new TypeError(`"${spec}" 的 default 导出不是插件(缺少 setup)`);
}
