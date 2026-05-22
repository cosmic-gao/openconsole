"use client";

import * as React from "react";

export interface SidebarConfig {
  variant: "sidebar" | "floating" | "inset";
  collapsible: "offcanvas" | "icon" | "none";
  side: "left" | "right";
}

interface SidebarConfigContextValue {
  config: SidebarConfig;
  updateConfig: (config: Partial<SidebarConfig>) => void;
}

const DEFAULT_CONFIG: SidebarConfig = {
  variant: "inset",
  collapsible: "icon",
  side: "left",
};

const SidebarConfigContext =
  React.createContext<SidebarConfigContextValue | null>(null);

export function SidebarConfigProvider({
  children,
  defaultConfig,
}: {
  children: React.ReactNode;
  defaultConfig?: Partial<SidebarConfig>;
}) {
  const [config, setConfig] = React.useState<SidebarConfig>({
    ...DEFAULT_CONFIG,
    ...defaultConfig,
  });

  const updateConfig = React.useCallback(
    (next: Partial<SidebarConfig>) => {
      setConfig((prev) => ({ ...prev, ...next }));
    },
    [],
  );

  const value = React.useMemo(
    () => ({ config, updateConfig }),
    [config, updateConfig],
  );

  return (
    <SidebarConfigContext.Provider value={value}>
      {children}
    </SidebarConfigContext.Provider>
  );
}

export function useSidebarConfig() {
  const context = React.useContext(SidebarConfigContext);
  if (!context) {
    throw new Error(
      "useSidebarConfig must be used within a SidebarConfigProvider",
    );
  }
  return context;
}
