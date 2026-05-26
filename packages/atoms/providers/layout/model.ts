/**
 * 侧边栏布局数据模型 —— 类型、默认值、cookie 编解码。
 *
 * 纯逻辑模块,不依赖 React 也不依赖 next/headers,服务端组件与客户端
 * 组件都可以直接导入。客户端用 {@link encodeLayoutConfig} 写 cookie,
 * 服务端用 {@link decodeLayoutConfig} 读回,两端共享同一份序列化协议。
 *
 * @module
 */

/** 侧边栏布局配置 —— 字段形态与 shadcn 的 `Sidebar` 原语完全对齐。 */
export interface LayoutConfig {
  /** 侧边栏视觉变体。 */
  variant: "sidebar" | "floating" | "inset";
  /** 折叠行为:滑出 / 仅图标 / 始终展开。 */
  collapsible: "offcanvas" | "icon" | "none";
  /** 摆放在视口的哪一侧。 */
  side: "left" | "right";
}

/** 内置默认布局配置:inset 变体、icon 折叠、左侧。 */
export const DEFAULT_LAYOUT_CONFIG: LayoutConfig = {
  variant: "inset",
  collapsible: "icon",
  side: "left",
};

/** {@link LayoutProvider} 默认使用的 cookie 名。 */
export const DEFAULT_LAYOUT_COOKIE = "openconsole-layout";

/**
 * {@link SidebarProvider} 默认使用的 cookie 名。
 *
 * shadcn 的 `SidebarProvider` 客户端写入用的是硬编码的 `"sidebar_state"`,
 * 改 storage 只影响读取端,一般保留默认即可。
 */
export const DEFAULT_SIDEBAR_COOKIE = "sidebar_state";

/** cookie 默认有效期 30 天。 */
export const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** 各字段的合法枚举值,用作 cookie 反序列化时的白名单。 */
const SCHEMA = {
  variant: ["sidebar", "floating", "inset"],
  collapsible: ["offcanvas", "icon", "none"],
  side: ["left", "right"],
} as const satisfies { [K in keyof LayoutConfig]: readonly LayoutConfig[K][] };

/** 把 LayoutConfig 序列化为 cookie 值(URL-encoded JSON)。 */
export function encodeLayoutConfig(config: LayoutConfig): string {
  return encodeURIComponent(JSON.stringify(config));
}

/**
 * 把 cookie 值反序列化为 `Partial<LayoutConfig>`。
 *
 * 通过 {@link SCHEMA} 白名单校验,防止 cookie 被篡改导致渲染异常;
 * 无效 / 不可解析 / 不在白名单时返回 undefined,让 caller 走默认值。
 */
export function decodeLayoutConfig(
  raw: string,
): Partial<LayoutConfig> | undefined {
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const obj = parsed as Record<string, unknown>;
    const result: Partial<LayoutConfig> = {};
    for (const key of Object.keys(SCHEMA) as Array<keyof LayoutConfig>) {
      const picked = pickEnum(obj[key], SCHEMA[key]);
      if (picked !== undefined) {
        // SCHEMA[key] 的元素类型就是 LayoutConfig[key],类型系统看不到这层
        // 关联,这里做一次受控断言。
        (result as Record<string, string>)[key] = picked;
      }
    }
    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 解析 `sidebar_state` cookie 字面量(`"true"` / `"false"`)为布尔。
 *
 * 其它值(空、未识别)返回 undefined,让 shadcn 走自己的默认值(展开)。
 */
export function decodeSidebarOpen(raw: string | undefined): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

/** 字面量参数 `value` 在 `allowed` 白名单内才返回,否则 undefined。 */
function pickEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}
