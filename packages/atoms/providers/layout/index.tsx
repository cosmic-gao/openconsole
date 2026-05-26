/**
 * 侧边栏布局上下文 —— 公开入口。
 *
 * 模块分层:
 * - {@link ./model `./model`}     纯数据模型:类型、默认值、cookie 编解码,服务端 / 客户端共享。
 * - {@link ./context `./context`}   `"use client"` —— React Context、状态 Provider、{@link useLayout} hook。
 * - 本文件                       服务端异步 Provider({@link LayoutProvider} / {@link SidebarProvider}),
 *                                负责在首屏渲染前从 cookie 还原状态,消除闪烁。
 *
 * @module
 */
import * as React from "react";

import { SidebarProvider as ShadcnSidebarProvider } from "@openconsole/shadcn";

import { LayoutStateProvider } from "./context";
import {
  DEFAULT_LAYOUT_CONFIG,
  DEFAULT_LAYOUT_COOKIE,
  DEFAULT_SIDEBAR_COOKIE,
  decodeLayoutConfig,
  decodeSidebarOpen,
  type LayoutConfig,
} from "./model";

export { useLayout } from "./context";
export {
  DEFAULT_LAYOUT_CONFIG,
  DEFAULT_LAYOUT_COOKIE,
  DEFAULT_SIDEBAR_COOKIE,
} from "./model";
export type { LayoutConfig } from "./model";

/** {@link LayoutProvider} 的 props。 */
export interface LayoutProviderProps {
  children: React.ReactNode;
  /**
   * 调用方传入的默认配置。优先级低于从 cookie 还原的持久化值,高于内置
   * {@link DEFAULT_LAYOUT_CONFIG}。
   */
  defaultConfig?: Partial<LayoutConfig>;
  /**
   * 持久化 cookie 名;传 `null` 关闭持久化(永远使用 `defaultConfig`)。
   *
   * @default {@link DEFAULT_LAYOUT_COOKIE}
   */
  storage?: string | null;
}

/**
 * 侧边栏布局上下文 Provider —— **服务端**异步组件,先在服务端读 cookie
 * 还原持久化配置,再把首屏渲染对齐到真实值。
 *
 * 这样做避免了「客户端 useEffect 读 storage → 翻转 → 闪烁」的经典问题:
 * HTML 直接以正确的 `variant` / `collapsible` / `side` 渲染,hydration
 * 不会触发布局抖动。
 *
 * 业务方调用接口与普通组件一致 —— 直接 `<LayoutProvider>...</LayoutProvider>`,
 * 异步性由 React Server Components 自动处理,父组件无需 `await`。
 *
 * @example
 * ```tsx
 * <LayoutProvider>{children}</LayoutProvider>
 * <LayoutProvider storage="my-layout">{children}</LayoutProvider>
 * <LayoutProvider storage={null}>{children}</LayoutProvider>
 * <LayoutProvider defaultConfig={{ side: "right" }}>{children}</LayoutProvider>
 * ```
 */
export async function LayoutProvider({
  children,
  defaultConfig,
  storage = DEFAULT_LAYOUT_COOKIE,
}: LayoutProviderProps) {
  const raw = storage ? await readCookie(storage) : undefined;
  const persisted = raw ? decodeLayoutConfig(raw) : undefined;
  const initial: LayoutConfig = {
    ...DEFAULT_LAYOUT_CONFIG,
    ...defaultConfig,
    ...persisted,
  };
  return (
    <LayoutStateProvider initial={initial} storage={storage ?? null}>
      {children}
    </LayoutStateProvider>
  );
}

/** {@link SidebarProvider} 的 props。 */
export interface SidebarProviderProps
  extends Omit<
    React.ComponentProps<typeof ShadcnSidebarProvider>,
    "defaultOpen"
  > {
  /** 显式覆盖初始展开状态;设置后跳过 cookie 读取。 */
  defaultOpen?: boolean;
  /**
   * cookie 名;传 `null` 关闭持久化读取(不影响 shadcn 内部的 cookie 写入
   * —— 它仍然按 `"sidebar_state"` 写)。
   *
   * @default {@link DEFAULT_SIDEBAR_COOKIE}
   */
  storage?: string | null;
}

/**
 * 侧边栏 Provider —— **服务端**异步组件,在服务端读 `sidebar_state` cookie
 * 算出 `defaultOpen`,再委托给 shadcn 的 `SidebarProvider` 渲染。
 *
 * 解决的问题:shadcn 自己只写不读 cookie,默认 `defaultOpen=true`,
 * 如果用户上次收起了侧边栏,刷新瞬间会先以「展开」渲染再翻成「收起」,
 * 产生明显闪烁。
 *
 * 本组件在服务端就把 cookie 还原成正确的 `defaultOpen`,HTML 首屏即终态。
 *
 * @example
 * ```tsx
 * import { SidebarProvider } from "@openconsole/atoms";
 *
 * <SidebarProvider>{children}</SidebarProvider>
 * ```
 */
export async function SidebarProvider({
  children,
  defaultOpen,
  storage = DEFAULT_SIDEBAR_COOKIE,
  ...props
}: SidebarProviderProps) {
  let resolved = defaultOpen;
  if (resolved === undefined && storage) {
    resolved = decodeSidebarOpen(await readCookie(storage));
  }
  return (
    <ShadcnSidebarProvider defaultOpen={resolved} {...props}>
      {children}
    </ShadcnSidebarProvider>
  );
}

/**
 * 服务端读 cookie。非 Next.js 请求作用域(测试、background)时返回 undefined。
 *
 * 用动态 `import("next/headers")` 包在 try/catch 内,保证非 Next.js 环境
 * 静默降级而不抛错破坏渲染。
 */
async function readCookie(name: string): Promise<string | undefined> {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return jar.get(name)?.value;
  } catch {
    return undefined;
  }
}
