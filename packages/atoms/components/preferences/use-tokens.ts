"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { baseColors } from "./data";
import type { ImportedTheme, ThemePreset } from "./types";

// Sidebar tokens that should follow their base counterparts when a preset or
// imported theme doesn't define sidebar-specific values (e.g. shadcn presets).
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

// Reverse map for live ColorPicker edits: editing --primary should also flow
// into --sidebar-primary so the sidebar's brand square / hover states track.
const SIDEBAR_MIRRORS: Record<string, string> = Object.fromEntries(
  Object.entries(SIDEBAR_FALLBACKS).map(([sidebar, base]) => [
    `--${base}`,
    `--${sidebar}`,
  ]),
);

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

function pickBrand(styles: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { cssVar } of baseColors) {
    const key = cssVar.replace(/^--/, "");
    if (styles[key]) out[cssVar] = styles[key];
  }
  return out;
}

export function useTokens() {
  const { theme, resolvedTheme } = useTheme();
  const [brandColors, setBrandColors] = React.useState<Record<string, string>>(
    {},
  );
  // Track only the vars we set so reset leaves third-party inline custom
  // properties untouched.
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

  // `resolvedTheme` reflects the OS scheme when `theme === "system"`.
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
