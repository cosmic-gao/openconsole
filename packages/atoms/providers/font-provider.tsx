"use client";

import * as React from "react";

const DEFAULT_OPTIONS = ["inter", "manrope", "system"] as const;
const DEFAULT_STORAGE = "openconsole-font";
const DEFAULT_CLASS_PREFIX = "font-";

/** 内置三个字体选项。自定义时传 `options` 覆盖。 */
export type FontOption = (typeof DEFAULT_OPTIONS)[number];

/** {@link FontContext} 暴露给 {@link useFont} 的值。 */
export interface FontContextValue {
  /** 当前生效的字体值。 */
  font: string;
  /** 设置字体；变更会立刻反映到 `<html>` 类名并写入 localStorage。 */
  setFont: (font: string) => void;
  /** 当前可选字体列表（构造时传入或使用默认值）。 */
  options: readonly string[];
}

/** {@link FontProvider} 的 props。 */
export interface FontProviderProps {
  children: React.ReactNode;
  /**
   * 可选字体集合。
   *
   * @default ["inter", "manrope", "system"]
   */
  options?: readonly string[];
  /**
   * 持久化值加载前使用的初始字体。
   *
   * @default options[0]
   */
  defaultFont?: string;
  /**
   * localStorage 持久化键名；传 `null` 关闭持久化。
   *
   * @default "openconsole-font"
   */
  storage?: string | null;
  /**
   * 写到 `<html>` 上的 class 前缀；传 `""` 跳过类名应用。
   *
   * @default "font-"
   */
  classPrefix?: string;
}

/** 直接使用 Context（一般通过 {@link useFont} 间接访问）。 */
export const FontContext = React.createContext<FontContextValue | null>(null);

/**
 * 把当前字体注入到子树，并以 `font-${value}` 类名应用到 `<html>`，
 * 同时（默认）持久化到 localStorage。
 *
 * 应挂在应用根部。配套的 CSS 规则 `:root.font-${value}` 在
 * `@openconsole/atoms/styles.css` 中提供（覆盖三个默认值）。
 */
export function FontProvider({
  children,
  options = DEFAULT_OPTIONS,
  defaultFont,
  storage = DEFAULT_STORAGE,
  classPrefix = DEFAULT_CLASS_PREFIX,
}: FontProviderProps) {
  const [font, setFontState] = React.useState<string>(
    defaultFont ?? options[0],
  );
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    if (!storage) return;
    const stored = localStorage.getItem(storage);
    if (stored && options.includes(stored)) {
      setFontState(stored);
    }
  }, [storage, options]);

  React.useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;

    if (classPrefix) {
      options.forEach((f) => root.classList.remove(`${classPrefix}${f}`));
      root.classList.add(`${classPrefix}${font}`);
    }

    if (storage) {
      localStorage.setItem(storage, font);
    }
  }, [font, mounted, options, classPrefix, storage]);

  const setFont = React.useCallback((newFont: string) => {
    setFontState(newFont);
  }, []);

  const value = React.useMemo<FontContextValue>(
    () => ({ font, setFont, options }),
    [font, setFont, options],
  );

  return (
    <FontContext.Provider value={value}>{children}</FontContext.Provider>
  );
}

/**
 * 读取当前字体并提供 setter。在 {@link FontProvider} 外调用会抛错。
 *
 * @returns `{ font, setFont, options }` —— 当前字体、setter 与可选列表
 *   （即传入 Provider 的 `options`）。
 */
export function useFont(): FontContextValue {
  const context = React.useContext(FontContext);
  if (!context) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
