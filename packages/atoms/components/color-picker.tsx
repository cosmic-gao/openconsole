"use client";

import * as React from "react";

import { Button, Input, Label } from "@openconsole/shadcn";

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX3 = /^#[0-9a-f]{3}$/i;
const HEX8 = /^#[0-9a-f]{8}$/i;

const expandHex3 = (v: string) =>
  `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;

/**
 * 把任意 CSS 颜色转换为 `#RRGGBB`，以匹配 `<input type="color">` 的要求。
 *
 * 直接命中 3/6/8 位 hex 时本地转换；否则借助 canvas 让浏览器解析
 * oklch / hsl / 命名色，再读回 `fillStyle` 拿到规范化形式。
 */
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

/** {@link ColorPicker} 的 props。 */
export interface ColorPickerProps {
  /** 文本标签，例如 "Primary"。 */
  label: string;
  /** 绑定的 CSS 变量名，例如 `--primary`。 */
  cssVar: string;
  /** 当前值；可以是任何 CSS 颜色（hex / oklch / hsl / 名称）。 */
  value: string;
  /** 变更回调：`(cssVar, value)`，调用方负责把新值写回 DOM 或 store。 */
  onChange: (cssVar: string, value: string) => void;
}

/**
 * 带原生取色器的色块 + 文本输入双行编辑器。常作为 Preferences 抽屉里
 * 「品牌色」分组中每一项的渲染单元。
 *
 * - 色块按钮内嵌一个透明的 `<input type="color">`，点击触发系统取色面板。
 * - 文本框允许直接粘贴非 hex 值（oklch、hsl、命名色），由 {@link hex}
 *   解析后再喂给取色器；解析失败时落到 `:root` 的计算值。
 */
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

  // 原生取色器只接受 #RRGGBB。如果绑定值无法直接转换（未知格式），就回退
  // 到读取 `:root` 上的计算值。
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
