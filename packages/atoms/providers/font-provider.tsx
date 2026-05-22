"use client";

import * as React from "react";

const DEFAULT_OPTIONS = ["inter", "manrope", "system"] as const;
const DEFAULT_STORAGE = "openconsole-font";
const DEFAULT_CLASS_PREFIX = "font-";

export type FontOption = (typeof DEFAULT_OPTIONS)[number];

export interface FontContextValue {
  font: string;
  setFont: (font: string) => void;
  options: readonly string[];
}

export interface FontProviderProps {
  children: React.ReactNode;
  /**
   * Available font options.
   * @default ["inter", "manrope", "system"]
   */
  options?: readonly string[];
  /**
   * Initial font used before any persisted value loads.
   * @default options[0]
   */
  defaultFont?: string;
  /**
   * localStorage key for persistence. Pass `null` to disable persistence.
   * @default "openconsole-font"
   */
  storage?: string | null;
  /**
   * Class prefix applied to `<html>`. Pass `""` to skip class application.
   * @default "font-"
   */
  classPrefix?: string;
}

export const FontContext = React.createContext<FontContextValue | null>(null);

/**
 * Provides the currently-active font to descendants, applying it to
 * `<html>` as a `font-${value}` class and (optionally) persisting it to
 * localStorage.
 *
 * Mount at the app root. Pair with the matching `:root.font-${value}`
 * CSS rules — the three defaults (`inter`, `manrope`, `system`) ship
 * with `@openconsole/atoms/styles.css`.
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
 * Read the active font and update it. Throws when called outside of a
 * `<FontProvider>`.
 *
 * @returns `{ font, setFont, options }` — current font, setter, and the
 *   list of available options (whatever was passed to the provider).
 */
export function useFont(): FontContextValue {
  const context = React.useContext(FontContext);
  if (!context) {
    throw new Error("useFont must be used within a FontProvider");
  }
  return context;
}
