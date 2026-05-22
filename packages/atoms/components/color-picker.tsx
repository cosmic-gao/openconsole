"use client";

import * as React from "react";

import { Button, Input, Label } from "@openconsole/shadcn";

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const HEX8 = /^#[0-9a-f]{8}$/i;

const expandHex3 = (v: string) =>
  `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;

// Convert any CSS color to `#RRGGBB` for `<input type="color">`. The canvas
// fallback lets the browser parse oklch/hsl/named colors for us.
function hex(value: string): string | null {
  const trimmed = value.trim();
  if (HEX6.test(trimmed)) return trimmed.toLowerCase();
  if (HEX3.test(trimmed)) return expandHex3(trimmed).toLowerCase();
  if (HEX8.test(trimmed)) return trimmed.slice(0, 7).toLowerCase();
  if (typeof document === "undefined") return null;
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000";
    ctx.fillStyle = trimmed;
    const normalized = ctx.fillStyle;
    if (HEX6.test(normalized)) return normalized.toLowerCase();
    if (normalized.startsWith("rgba(") || normalized.startsWith("rgb(")) {
      const nums = normalized.match(/\d+(?:\.\d+)?/g);
      if (!nums || nums.length < 3) return null;
      const [r, g, b] = nums.map((n) => Math.round(Number(n)));
      return `#${[r, g, b]
        .map((c) => c.toString(16).padStart(2, "0"))
        .join("")}`;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ColorPickerProps {
  label: string;
  cssVar: string;
  value: string;
  onChange: (cssVar: string, value: string) => void;
}

export function ColorPicker({
  label,
  cssVar,
  value,
  onChange,
}: ColorPickerProps) {
  const [localValue, setLocalValue] = React.useState(value);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Native picker requires #RRGGBB. Fall back to the computed :root value
  // when the bound value isn't directly convertible (e.g. an unknown format).
  const swatchColor = React.useMemo(() => {
    const fromValue = hex(localValue);
    if (fromValue) return fromValue;
    if (typeof window === "undefined") return "#000000";
    const computed = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim();
    return hex(computed) ?? "#000000";
  }, [localValue, cssVar]);

  const handlePicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    onChange(cssVar, next);
  };

  const handleText = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    onChange(cssVar, next);
  };

  const inputId = `color-${cssVar}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId} className="text-xs font-medium">
        {label}
      </Label>
      <div className="flex items-start gap-2">
        <Button
          type="button"
          variant="outline"
          className="relative size-8 overflow-hidden p-0"
          style={{ backgroundColor: swatchColor }}
        >
          <input
            type="color"
            id={inputId}
            value={swatchColor}
            onChange={handlePicker}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </Button>
        <Input
          type="text"
          value={localValue}
          onChange={handleText}
          placeholder={`${cssVar} value`}
          className="h-8 flex-1 text-xs"
        />
      </div>
    </div>
  );
}
