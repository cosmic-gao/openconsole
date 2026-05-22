"use client";

import {
  Check,
  Dices,
  ExternalLink,
  Moon,
  Palette as PaletteIcon,
  Sun,
  Upload,
} from "lucide-react";
import * as React from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  cn,
} from "@openconsole/shadcn";

import { ColorPicker } from "../color-picker";

import {
  baseColors,
  radiusOptions,
  shadcnThemes,
  tweakcnThemes,
} from "./data";
import type { ColorTheme, ThemePreset } from "./types";
import { useViewTransition } from "../../hooks/use-view-transition";

const PREVIEW_TOKENS = ["primary", "secondary", "accent", "muted"] as const;
const TWEAKCN_URL = "https://tweakcn.com/editor/theme";

interface PaletteProps {
  // Values
  shadcnValue: string;
  tweakcnValue: string;
  radius: string;
  isDarkMode: boolean;
  brandColors: Record<string, string>;
  // Actions
  onShadcn: (preset: ThemePreset, value: string) => void;
  onTweakcn: (preset: ThemePreset, value: string) => void;
  onRadius: (radius: string) => void;
  onColor: (cssVar: string, value: string) => void;
  onImport: () => void;
}

function PresetSection({
  label,
  placeholder,
  themes,
  selectedValue,
  onApply,
}: {
  label: string;
  placeholder: string;
  themes: ColorTheme[];
  selectedValue: string;
  onApply: (preset: ThemePreset, value: string) => void;
}) {
  const random = () => {
    const picked = themes[Math.floor(Math.random() * themes.length)];
    onApply(picked.preset, picked.value);
  };
  const select = (value: string) => {
    const found = themes.find((t) => t.value === value);
    if (found) onApply(found.preset, value);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="outline"
          size="sm"
          onClick={random}
          className="cursor-pointer"
        >
          <Dices className="h-3.5 w-3.5 mr-1.5" />
          Random
        </Button>
      </div>
      <Select value={selectedValue} onValueChange={select}>
        <SelectTrigger className="w-full cursor-pointer">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-60">
          <div className="p-2">
            {themes.map((theme) => (
              <SelectItem
                key={theme.value}
                value={theme.value}
                className="cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {PREVIEW_TOKENS.map((token) => (
                      <div
                        key={token}
                        className="w-3 h-3 rounded-full border border-border/20"
                        style={{
                          backgroundColor: theme.preset.styles.light[token],
                        }}
                      />
                    ))}
                  </div>
                  <span>{theme.name}</span>
                </div>
              </SelectItem>
            ))}
          </div>
        </SelectContent>
      </Select>
    </div>
  );
}

export function Palette({
  shadcnValue,
  tweakcnValue,
  radius,
  isDarkMode,
  brandColors,
  onShadcn,
  onTweakcn,
  onRadius,
  onColor,
  onImport,
}: PaletteProps) {
  const { toggleTheme } = useViewTransition();

  const toggleMode =
    (target: boolean) => (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isDarkMode === target) return;
      toggleTheme(event);
    };

  return (
    <div className="p-4 space-y-6">
      <PresetSection
        label="Shadcn UI Theme Presets"
        placeholder="Choose Shadcn Theme"
        themes={shadcnThemes}
        selectedValue={shadcnValue}
        onApply={onShadcn}
      />

      <Separator />

      <PresetSection
        label="Tweakcn Theme Presets"
        placeholder="Choose Tweakcn Theme"
        themes={tweakcnThemes}
        selectedValue={tweakcnValue}
        onApply={onTweakcn}
      />

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-medium">Radius</Label>
        <div className="grid grid-cols-5 gap-2">
          {radiusOptions.map((option) => (
            <div
              key={option.value}
              className={cn(
                "relative cursor-pointer rounded-md p-3 border transition-colors",
                radius === option.value
                  ? "border-primary"
                  : "border-border hover:border-border/60",
              )}
              onClick={() => onRadius(option.value)}
            >
              <div className="text-center text-xs font-medium">
                {option.name}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        <Label className="text-sm font-medium">Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={!isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={toggleMode(false)}
            className="cursor-pointer"
          >
            <Sun className="size-4 mr-1" />
            Light
            {!isDarkMode && <Check className="h-3.5 w-3.5 ml-1" />}
          </Button>
          <Button
            variant={isDarkMode ? "secondary" : "outline"}
            size="sm"
            onClick={toggleMode(true)}
            className="cursor-pointer"
          >
            <Moon className="size-4 mr-1" />
            Dark
            {isDarkMode && <Check className="h-3.5 w-3.5 ml-1" />}
          </Button>
        </div>
      </div>

      <Separator />

      <Button
        variant="outline"
        size="lg"
        onClick={onImport}
        className="w-full cursor-pointer"
      >
        <Upload className="size-3.5 mr-1.5" />
        Import Theme
      </Button>

      <Accordion type="single" collapsible className="w-full">
        <AccordionItem
          value="brand-colors"
          className="border border-border rounded-lg overflow-hidden"
        >
          <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-muted/50 transition-colors">
            <Label className="text-sm font-medium cursor-pointer">
              Brand Colors
            </Label>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-muted/20">
            {baseColors.map((color) => (
              <ColorPicker
                key={color.cssVar}
                label={color.name}
                cssVar={color.cssVar}
                value={brandColors[color.cssVar] || ""}
                onChange={onColor}
              />
            ))}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="p-4 bg-muted rounded-lg space-y-3">
        <div className="flex items-center gap-2">
          <PaletteIcon className="size-4 text-primary" />
          <span className="text-sm font-medium">Advanced Customization</span>
        </div>
        <p className="text-xs text-muted-foreground">
          For advanced theme customization with real-time preview, visual color
          picker, and hundreds of prebuilt themes, visit{" "}
          <a
            href={TWEAKCN_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline font-medium cursor-pointer"
          >
            tweakcn.com
          </a>
        </p>
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer"
          onClick={() => {
            if (typeof window === "undefined") return;
            window.open(TWEAKCN_URL, "_blank", "noopener,noreferrer");
          }}
        >
          <ExternalLink className="size-3.5 mr-1.5" />
          Open Tweakcn
        </Button>
      </div>
    </div>
  );
}
