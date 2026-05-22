"use client";

import * as React from "react";

/**
 * Sidebar layout configuration — mirrors the shape consumed by shadcn's
 * `Sidebar` primitive.
 */
export interface LayoutConfig {
  variant: "sidebar" | "floating" | "inset";
  collapsible: "offcanvas" | "icon" | "none";
  side: "left" | "right";
}

interface LayoutContextValue {
  config: LayoutConfig;
  updateConfig: (config: Partial<LayoutConfig>) => void;
}

const DEFAULT_CONFIG: LayoutConfig = {
  variant: "inset",
  collapsible: "icon",
  side: "left",
};

const LayoutContext = React.createContext<LayoutContextValue | null>(null);

/**
 * Holds the sidebar variant config (`variant` / `collapsible` / `side`)
 * read by atoms' `<Sidebar>` component.
 *
 * Does not persist — wrap with your own storage layer if you need
 * persistence across reloads.
 *
 * @param defaultConfig - Partial override merged into the defaults
 *   (`{ variant: "inset", collapsible: "icon", side: "left" }`).
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
 * Read the current layout config and update it. Throws when called
 * outside of a `<LayoutProvider>`.
 *
 * @returns `{ config, updateConfig }` — current snapshot plus a partial
 *   merger.
 */
export function useLayout() {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
