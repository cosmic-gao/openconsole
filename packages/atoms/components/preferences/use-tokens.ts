"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { baseColors } from "./data";
import type { ImportedTheme, ThemePreset } from "./types";

/**
 * 侧边栏 token 缺失时所追随的基础 token。
 *
 * shadcn 主题预设通常只定义 `--background` / `--foreground` 等基础变量，
 * 没有 sidebar 专属值。这里在应用时把基础值灌进对应 sidebar 变量，
 * 保证侧边栏跟主题保持视觉一致。
 */
const SIDEBAR_FALLBACKS: Record<string, string> = {
  sidebar: "background",
  "sidebar-foreground": "foreground",
  "sidebar-primary": "primary",
  "sidebar-primary-foreground": "primary-foreground",
  "sidebar-accent": "accent",
  "sidebar-accent-foreground": "accent-foreground",
  "sidebar-border": "border",
  "sidebar-ring": "ring",
};

/**
 * {@link SIDEBAR_FALLBACKS} 的反向映射，用于 `<ColorPicker>` 的实时编辑：
 * 用户改 `--primary` 时同时写入 `--sidebar-primary`，让侧边栏品牌色块、
 * hover 态自然跟随。
 */
const SIDEBAR_MIRRORS: Record<string, string> = Object.fromEntries(
  Object.entries(SIDEBAR_FALLBACKS).map(([sidebar, base]) => [
    `--${base}`,
    `--${sidebar}`,
  ]),
);

/**
 * 把 preset 内未定义的 sidebar token 用对应的基础 token 值填充。
 *
 * 已存在的 sidebar 值优先保留，不会覆盖。
 */
function withSidebarFallbacks(
  styles: Record<string, string>,
): Record<string, string> {
  const out = { ...styles };
  for (const [sidebarKey, baseKey] of Object.entries(SIDEBAR_FALLBACKS)) {
    if (out[sidebarKey] === undefined && out[baseKey] !== undefined) {
      out[sidebarKey] = out[baseKey];
    }
  }
  return out;
}

/** 从一份完整 styles 中挑出 {@link baseColors} 暴露给 UI 编辑的子集。 */
function pickBrand(styles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { cssVar } of baseColors) {
    const key = cssVar.replace(/^--/, "");
    if (styles[key]) out[cssVar] = styles[key];
  }
  return out;
}

/**
 * 内部 Hook —— 集中处理 Preferences 抽屉的 token 操作。
 *
 * - 把 preset / imported theme 应用到 `:root`；
 * - 通过 `managed` Set 只追踪自己写入的 CSS 变量，`resetTheme()` 时只清除
 *   它们，不动第三方注入的 inline 自定义属性；
 * - 实时 `setColor()` 编辑会镜像基础 token 到对应 sidebar token。
 */
export function useTokens() {
  const { theme, resolvedTheme } = useTheme();
  const [brandColors, setBrandColors] = React.useState<Record<string, string>>(
    {},
  );
  // 仅追踪我们自己写入的变量，reset 时只清除这部分，不影响第三方 inline
  // 自定义属性。
  const managed = React.useRef<Set<string>>(new Set());

  const applyStyles = React.useCallback((styles: Record<string, string>) => {
    const { style } = document.documentElement;
    const filled = withSidebarFallbacks(styles);
    for (const [key, value] of Object.entries(filled)) {
      const prop = `--${key}`;
      style.setProperty(prop, value);
      managed.current.add(prop);
    }
  }, []);

  const clearManaged = React.useCallback(() => {
    const { style } = document.documentElement;
    for (const prop of managed.current) {
      style.removeProperty(prop);
    }
    managed.current.clear();
  }, []);

  // `theme === "system"` 时 `resolvedTheme` 反映操作系统的明暗设置。
  const isDarkMode = resolvedTheme
    ? resolvedTheme === "dark"
    : theme === "dark";

  const applyPreset = React.useCallback(
    (preset: ThemePreset, darkMode: boolean) => {
      const styles = darkMode ? preset.styles.dark : preset.styles.light;
      clearManaged();
      applyStyles(styles);
      setBrandColors(pickBrand(styles));
    },
    [applyStyles, clearManaged],
  );

  const applyImported = React.useCallback(
    (data: ImportedTheme, darkMode: boolean) => {
      const styles = darkMode ? data.dark : data.light;
      applyStyles(styles);
      setBrandColors(pickBrand(styles));
    },
    [applyStyles],
  );

  const applyRadius = React.useCallback((radius: string) => {
    document.documentElement.style.setProperty("--radius", radius);
    managed.current.add("--radius");
  }, []);

  const setColor = React.useCallback((cssVar: string, value: string) => {
    const { style } = document.documentElement;
    style.setProperty(cssVar, value);
    managed.current.add(cssVar);
    const mirror = SIDEBAR_MIRRORS[cssVar];
    if (mirror) {
      style.setProperty(mirror, value);
      managed.current.add(mirror);
    }
  }, []);

  const resetTheme = React.useCallback(() => {
    clearManaged();
    setBrandColors({});
  }, [clearManaged]);

  return {
    isDarkMode,
    brandColors,
    applyPreset,
    applyImported,
    applyRadius,
    setColor,
    resetTheme,
  };
}
