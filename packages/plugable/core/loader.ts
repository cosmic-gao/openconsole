/**
 * 插件加载器:`spec` → 动态 import → 形态检测。支持 {@link Plugin} 对象,或返回 Plugin 的工厂函数。
 */

import type { Plugin } from "./plugin";

/**
 * 加载一个插件。
 *
 * @param spec npm 包名 / 相对路径 / `file:` URL
 * @param baseUrl 解析相对路径用的基准 URL(如 `import.meta.url`);文件型 spec 必填
 */
export async function loadPlugin(spec: string, baseUrl?: string): Promise<Plugin> {
  const isFile = spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("file:");
  const target = isFile && baseUrl ? new URL(spec, baseUrl).href : spec;
  const mod = (await import(target)) as Record<string, unknown>;
  const candidate = mod["default"] ?? mod["plugin"] ?? mod;
  const resolved = typeof candidate === "function" ? (candidate as () => unknown)() : candidate;
  if (resolved && typeof (resolved as Plugin).setup === "function") return resolved as Plugin;
  throw new TypeError(`"${spec}" 不是合法插件(缺少 setup)`);
}
