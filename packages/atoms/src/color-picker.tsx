"use client";

import * as React from "react";

import { Button, Input, Label } from "@opendesign/shadcn";

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

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

  // Native <input type="color"> requires #RRGGBB.
  // When the bound value isn't a hex literal, fall back to the value currently
  // applied to :root so the swatch reflects what the user actually sees.
  const swatchColor = React.useMemo(() => {
    if (HEX_PATTERN.test(localValue)) return localValue;
    if (typeof window === "undefined") return "#000000";
    const computed = getComputedStyle(document.documentElement)
      .getPropertyValue(cssVar)
      .trim();
    return HEX_PATTERN.test(computed) ? computed : "#000000";
  }, [localValue, cssVar]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
            onChange={handleChange}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </Button>
        <Input
          type="text"
          value={localValue}
          onChange={handleChange}
          placeholder={`${cssVar} value`}
          className="h-8 flex-1 text-xs"
        />
      </div>
    </div>
  );
}
