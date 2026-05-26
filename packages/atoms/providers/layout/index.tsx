/**
 * 侧边栏布局上下文 —— 公开入口。
 *
 * 模块分层:
 * - {@link ./model `./model`}     纯数据模型:类型、默认值、cookie 编解码,服务端 / 客户端共享。
 * - {@link ./context `./context`}   `"use client"` —— React Context、状态 Provider、{@link useLayout} hook。
 * - 本文件                       服务端 Provider({@link LayoutProvider} / {@link SidebarProvider}),
 *                                负责在首屏渲染前从 cookie 还原状态,消除闪烁。
 *
 * 公开的 Provider 是**同步包装**:对外是普通组件,内部把读 cookie 的 async 工作
 * 包在自带的 `<Suspense>` 边界里 —— 满足 Next 16 `cacheComponents` 模式
 * 对动态 API(`cookies()`)必须在 Suspense 内访问的硬要求,业务方无需
 * 在调用点再写 Suspense。cookies 几乎总是同请求即可读到,Suspense fallback
 * 在实际运行中很少触发,体感无差异。
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
 * 侧边栏布局上下文 Provider —— 服务端读 cookie 还原持久化配置,首屏渲染
 * 即为最终态,消除「客户端 useEffect 读 storage → 翻转」造成的闪烁。
 *
 * 内部用 `<Suspense fallback={null}>` 包了异步的 cookie 读取,满足 Next 16
 * `cacheComponents` 模式对动态 API 必须在 Suspense 内访问的要求 —— 调用方
 * **无需**再额外用 Suspense 包裹。
 *
 * @example
 * ```tsx
 * <LayoutProvider>{children}</LayoutProvider>
 * <LayoutProvider storage="my-layout">{children}</LayoutProvider>
 * <LayoutProvider storage={null}>{children}</LayoutProvider>
 * <LayoutProvider defaultConfig={{ side: "right" }}>{children}</LayoutProvider>
 * ```
 */
export function LayoutProvider({
  children,
  defaultConfig,
  storage = DEFAULT_LAYOUT_COOKIE,
}: LayoutProviderProps) {
  return (
    <React.Suspense fallback={null}>
      <LayoutProviderAsync defaultConfig={defaultConfig} storage={storage}>
        {children}
      </LayoutProviderAsync>
    </React.Suspense>
  );
}

/** {@link LayoutProvider} 的异步内核 —— 实际读 cookie 的地方。 */
async function LayoutProviderAsync({
  children,
  defaultConfig,
  storage,
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
 * 侧边栏 Provider —— 在服务端读 `sidebar_state` cookie 算出 `defaultOpen`,
 * 再委托给 shadcn 的 `SidebarProvider`,消除「刷新瞬间侧边栏先展开再收起」
 * 的闪烁。
 *
 * 内部自带 `<Suspense fallback={null}>` 边界,无需在调用点额外包。
 *
 * 接口与 shadcn 的 `SidebarProvider` 兼容,可直接替换。
 *
 * @example
 * ```tsx
 * import { SidebarProvider } from "@openconsole/atoms";
 *
 * <SidebarProvider>{children}</SidebarProvider>
 * ```
 */
export function SidebarProvider({
  children,
  defaultOpen,
  storage = DEFAULT_SIDEBAR_COOKIE,
  ...props
}: SidebarProviderProps) {
  return (
    <React.Suspense fallback={null}>
      <SidebarProviderAsync
        defaultOpen={defaultOpen}
        storage={storage}
        {...props}
      >
        {children}
      </SidebarProviderAsync>
    </React.Suspense>
  );
}

/** {@link SidebarProvider} 的异步内核。 */
async function SidebarProviderAsync({
  children,
  defaultOpen,
  storage,
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
