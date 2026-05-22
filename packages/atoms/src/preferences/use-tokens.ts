"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { baseColors } from "./data";
import type { ImportedTheme, ThemePreset } from "./types";

const stripPrefix = (cssVar: string) => cssVar.replace(/^--/, "");

/** Extract brand-color values from a style record (keys without `--`). */
function pickBrand(styles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { cssVar } of baseColors) {
    const key = stripPrefix(cssVar);
    if (styles[key]) out[cssVar] = styles[key];
  }
  return out;
}

/** Apply a `{ key: value }` record as `--key: value` on :root. */
function applyStyles(styles: Record<string, string>) {
  const { style } = document.documentElement;
  for (const [key, value] of Object.entries(styles)) {
    style.setProperty(`--${key}`, value);
  }
}

/** Strip every inline `--*` custom property from :root. */
function clearProperties() {
  const { style } = document.documentElement;
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style[i];
    if (prop.startsWith("--")) style.removeProperty(prop);
  }
}

/**
 * Manages the design tokens (CSS custom properties) applied to :root.
 *
 * - `applyPreset` resets first, then writes the preset's vars
 *   (shadcn and tweakcn share the same preset shape).
 * - `applyImported` writes additively without resetting,
 *   matching the user's expectation when pasting a partial CSS.
 */
export function useTokens() {
  const { theme } = useTheme();
  const [brandColors, setBrandColors] = React.useState<Record<string, string>>(
    {},
  );

  const isDarkMode = React.useMemo(() => {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }, [theme]);

  const applyPreset = React.useCallback(
    (preset: ThemePreset, darkMode: boolean) => {
      const styles = darkMode ? preset.styles.dark : preset.styles.light;
      clearProperties();
      applyStyles(styles);
      setBrandColors(pickBrand(styles));
    },
    [],
  );

  const applyImported = React.useCallback(
    (data: ImportedTheme, darkMode: boolean) => {
      const styles = darkMode ? data.dark : data.light;
      applyStyles(styles);
      setBrandColors(pickBrand(styles));
    },
    [],
  );

  const applyRadius = React.useCallback((radius: string) => {
    document.documentElement.style.setProperty("--radius", radius);
  }, []);

  const setColor = React.useCallback((cssVar: string, value: string) => {
    document.documentElement.style.setProperty(cssVar, value);
  }, []);

  const resetTheme = React.useCallback(() => {
    clearProperties();
    setBrandColors({});
  }, []);

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
