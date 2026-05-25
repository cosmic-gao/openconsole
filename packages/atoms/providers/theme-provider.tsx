"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * `next-themes` 的薄包装，预置常用默认值。
 *
 * 默认：`attribute="class"` / `defaultTheme="system"` / 启用系统主题 /
 * 切换时关闭全局过渡。任意 prop 都可覆盖（例如 `attribute="data-theme"`）。
 *
 * 必须挂在应用根部，是 {@link FontProvider} / {@link LayoutProvider} 与
 * {@link ThemeSwitch} / {@link Preferences} 正常工作的前提。
 */
export function ThemeProvider(
  props: React.ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
