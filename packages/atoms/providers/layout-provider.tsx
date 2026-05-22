"use client";

import * as React from "react";

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

export function useLayout() {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}
