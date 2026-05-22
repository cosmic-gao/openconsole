"use client";

import {
  Layout as LayoutIcon,
  Palette as PaletteIcon,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import * as React from "react";

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout-provider";

import "./circular-transition.css";
import { shadcnThemes, tweakcnThemes } from "./data";
import { Importer } from "./importer";
import { Layout } from "./layout";
import { Palette } from "./palette";
import type { ImportedTheme, ThemePreset } from "./types";
import { useTokens } from "./use-tokens";

interface PreferencesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Source = "shadcn" | "tweakcn" | "imported" | "none";

interface State {
  source: Source;
  shadcnValue: string;
  tweakcnValue: string;
  importedTheme: ImportedTheme | null;
  radius: string;
}

type Action =
  | { type: "applyShadcn"; value: string }
  | { type: "applyTweakcn"; value: string }
  | { type: "applyImported"; data: ImportedTheme }
  | { type: "setRadius"; value: string }
  | { type: "reset" };

const DEFAULT_SHADCN = "default";
const DEFAULT_RADIUS = "0.5rem";

const INITIAL_STATE: State = {
  source: "shadcn",
  shadcnValue: DEFAULT_SHADCN,
  tweakcnValue: "",
  importedTheme: null,
  radius: DEFAULT_RADIUS,
};

const DEFAULT_SIDEBAR = {
  variant: "inset",
  collapsible: "offcanvas",
  side: "left",
} as const;

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "applyShadcn":
      return { ...state, source: "shadcn", shadcnValue: action.value };
    case "applyTweakcn":
      return { ...state, source: "tweakcn", tweakcnValue: action.value };
    case "applyImported":
      return { ...state, source: "imported", importedTheme: action.data };
    case "setRadius":
      return { ...state, radius: action.value };
    case "reset":
      return INITIAL_STATE;
  }
}

export function Preferences({ open, onOpenChange }: PreferencesProps) {
  const {
    isDarkMode,
    brandColors,
    applyPreset,
    applyImported,
    applyRadius,
    setColor,
    resetTheme,
  } = useTokens();
  const { config, updateConfig } = useLayout();

  const [state, dispatch] = React.useReducer(reducer, INITIAL_STATE);
  const [activeTab, setActiveTab] = React.useState("theme");
  const [importerOpen, setImporterOpen] = React.useState(false);

  // Handlers only dispatch; the effects below apply state to the DOM.
  const selectShadcn = (_preset: ThemePreset, value: string) =>
    dispatch({ type: "applyShadcn", value });
  const selectTweakcn = (_preset: ThemePreset, value: string) =>
    dispatch({ type: "applyTweakcn", value });
  const importTheme = (data: ImportedTheme) =>
    dispatch({ type: "applyImported", data });
  const setRadius = (value: string) =>
    dispatch({ type: "setRadius", value });

  const reset = () => {
    dispatch({ type: "reset" });
    resetTheme();
    updateConfig(DEFAULT_SIDEBAR);
  };

  // Apply preset/imported theme whenever the active source or dark mode changes.
  React.useEffect(() => {
    switch (state.source) {
      case "imported":
        if (state.importedTheme) applyImported(state.importedTheme, isDarkMode);
        return;
      case "shadcn": {
        const preset = shadcnThemes.find((t) => t.value === state.shadcnValue)
          ?.preset;
        if (preset) applyPreset(preset, isDarkMode);
        return;
      }
      case "tweakcn": {
        const preset = tweakcnThemes.find((t) => t.value === state.tweakcnValue)
          ?.preset;
        if (preset) applyPreset(preset, isDarkMode);
        return;
      }
      case "none":
        return;
    }
  }, [
    state.source,
    state.shadcnValue,
    state.tweakcnValue,
    state.importedTheme,
    isDarkMode,
    applyPreset,
    applyImported,
  ]);

  // Apply radius independently — orthogonal to the theme source.
  React.useEffect(() => {
    applyRadius(state.radius);
  }, [state.radius, applyRadius]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} modal={false}>
        <SheetContent
          side={config.side === "left" ? "right" : "left"}
          className="w-[400px] p-0 gap-0 pointer-events-auto [&>button]:hidden overflow-hidden flex flex-col"
          onInteractOutside={(e) => {
            if (importerOpen) e.preventDefault();
          }}
        >
          <SheetHeader className="space-y-0 p-4 pb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Settings className="size-4" />
              </div>
              <SheetTitle className="text-lg font-semibold">
                Preferences
              </SheetTitle>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={reset}
                  className="size-8 cursor-pointer"
                >
                  <RotateCcw className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => onOpenChange(false)}
                  className="size-8 cursor-pointer"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <SheetDescription className="sr-only">
              Customize the theme and layout of your dashboard.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="h-full flex flex-col"
            >
              <div className="py-2">
                <TabsList className="grid w-full grid-cols-2 rounded-none h-12 p-1.5">
                  <TabsTrigger
                    value="theme"
                    className="cursor-pointer data-[state=active]:bg-background"
                  >
                    <PaletteIcon className="size-4" /> Theme
                  </TabsTrigger>
                  <TabsTrigger
                    value="layout"
                    className="cursor-pointer data-[state=active]:bg-background"
                  >
                    <LayoutIcon className="size-4" /> Layout
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="theme" className="flex-1 mt-0">
                <Palette
                  shadcnValue={state.shadcnValue}
                  tweakcnValue={state.tweakcnValue}
                  radius={state.radius}
                  isDarkMode={isDarkMode}
                  brandColors={brandColors}
                  onShadcn={selectShadcn}
                  onTweakcn={selectTweakcn}
                  onRadius={setRadius}
                  onColor={setColor}
                  onImport={() => setImporterOpen(true)}
                />
              </TabsContent>

              <TabsContent value="layout" className="flex-1 mt-0">
                <Layout />
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      <Importer
        open={importerOpen}
        onOpenChange={setImporterOpen}
        onImport={importTheme}
      />
    </>
  );
}
