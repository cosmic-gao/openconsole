"use client";

import * as React from "react";

import {
  COOKIE_MAX_AGE_SECONDS,
  encodeLayoutConfig,
  type LayoutConfig,
} from "./model";

/** {@link useLayout} 返回值。 */
interface LayoutContextValue {
  /** 当前布局配置(完整值)。 */
  config: LayoutConfig;
  /** 部分合并更新,自动持久化到 cookie。 */
  updateConfig: (config: Partial<LayoutConfig>) => void;
}

const LayoutContext = React.createContext<LayoutContextValue | null>(null);

/** {@link LayoutStateProvider} 的内部 props。 */
export interface LayoutStateProviderProps {
  children: React.ReactNode;
  /** 服务端合并好的初始配置(内置默认 + 调用方覆盖 + cookie 还原)。 */
  initial: LayoutConfig;
  /** 持久化 cookie 名;`null` 关闭持久化。 */
  storage: string | null;
}

/**
 * 客户端布局状态 Provider —— 内部实现,通过服务端 `<LayoutProvider>`
 * 间接使用。
 *
 * `initial` 在服务端已经把 cookie 还原值合并进默认配置,首屏渲染与
 * hydration 结果完全一致 —— 不会出现「先默认再翻到真实值」的闪烁。
 */
export function LayoutStateProvider({
  children,
  initial,
  storage,
}: LayoutStateProviderProps) {
  const [config, setConfig] = React.useState<LayoutConfig>(initial);

  const updateConfig = React.useCallback(
    (next: Partial<LayoutConfig>) => {
      setConfig((prev) => {
        const merged = { ...prev, ...next };
        // 写回 cookie,供下次刷新由服务端读出作为 initial。
        if (storage) writeCookie(storage, encodeLayoutConfig(merged));
        return merged;
      });
    },
    [storage],
  );

  const value = React.useMemo<LayoutContextValue>(
    () => ({ config, updateConfig }),
    [config, updateConfig],
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

/**
 * 读取当前布局配置并提供部分更新器。在 `<LayoutProvider>` 外调用会抛错。
 *
 * @returns `{ config, updateConfig }` —— 当前快照 + 部分合并 setter。
 */
export function useLayout(): LayoutContextValue {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}

/** 浏览器端写 cookie;隔离 / 沙箱上下文中静默降级。 */
function writeCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // 写不进就拉倒。
  }
}
