"use client";

import * as React from "react";

/**
 * 侧边栏布局配置 —— 字段形态与 shadcn 的 `Sidebar` 原语完全对齐。
 */
export interface LayoutConfig {
  /** 侧边栏视觉变体。 */
  variant: "sidebar" | "floating" | "inset";
  /** 折叠行为：滑出 / 仅图标 / 始终展开。 */
  collapsible: "offcanvas" | "icon" | "none";
  /** 摆放在视口的哪一侧。 */
  side: "left" | "right";
}

/** {@link LayoutContext} 暴露给 {@link useLayout} 的值。 */
interface LayoutContextValue {
  config: LayoutConfig;
  updateConfig: (config: Partial<LayoutConfig>) => void;
}

/** 默认布局配置：inset 变体、icon 折叠、左侧。 */
const DEFAULT_CONFIG: LayoutConfig = {
  variant: "inset",
  collapsible: "icon",
  side: "left",
};

const LayoutContext = React.createContext<LayoutContextValue | null>(null);

/**
 * 维护侧边栏视觉配置（`variant` / `collapsible` / `side`），由 atoms 的
 * `<Sidebar>` 与 `<Header>` 读取。
 *
 * **不**做持久化 —— 需要跨刷新保留请在外层包一个存储层。
 *
 * @param defaultConfig 与默认 `{ variant: "inset", collapsible: "icon",
 *   side: "left" }` 浅合并的覆盖项。
 */
export function LayoutProvider({
  children,
  defaultConfig,
}: {
  children: React.ReactNode;
  defaultConfig?: Partial<LayoutConfig>;
}) {
  const [config, setConfig] = React.useState<LayoutConfig>({
    ...DEFAULT_CONFIG,
    ...defaultConfig,
  });

  const updateConfig = React.useCallback((next: Partial<LayoutConfig>) => {
    setConfig((prev) => ({ ...prev, ...next }));
  }, []);

  const value = React.useMemo(
    () => ({ config, updateConfig }),
    [config, updateConfig],
  );

  return (
    <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
  );
}

/**
 * 读取当前布局配置并提供部分更新器。在 {@link LayoutProvider} 外调用
 * 会抛错。
 *
 * @returns `{ config, updateConfig }` —— 当前快照 + 部分合并 setter。
 */
export function useLayout() {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
