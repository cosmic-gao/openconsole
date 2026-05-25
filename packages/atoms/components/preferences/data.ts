import { shadcnThemePresets } from "./presets/shadcn";
import { tweakcnPresets } from "./presets/tweakcn";
import type {
  BrandColor,
  CollapsibleOption,
  ColorTheme,
  RadiusOption,
  SideOption,
  SidebarVariant,
  ThemePreset,
} from "./types";

/** Preferences 抽屉中可选的圆角档位。 */
export const radiusOptions: RadiusOption[] = [
  { name: "0", value: "0rem" },
  { name: "0.3", value: "0.3rem" },
  { name: "0.5", value: "0.5rem" },
  { name: "0.75", value: "0.75rem" },
  { name: "1.0", value: "1rem" },
];

/** 侧边栏变体可选项（描述会显示在 Layout 标签页中）。 */
export const sidebarVariants: SidebarVariant[] = [
  { name: "Default", value: "sidebar", description: "Standard sidebar layout" },
  { name: "Floating", value: "floating", description: "Floating sidebar with border" },
  { name: "Inset", value: "inset", description: "Inset sidebar with rounded corners" },
];

/** 折叠行为可选项。 */
export const collapsibleOptions: CollapsibleOption[] = [
  { name: "Off Canvas", value: "offcanvas", description: "Slides out of view" },
  { name: "Icon", value: "icon", description: "Collapses to icon only" },
  { name: "None", value: "none", description: "Always visible" },
];

/** 摆放位置可选项。 */
export const sideOptions: SideOption[] = [
  { name: "Left", value: "left", description: "Sidebar positioned on the left side" },
  { name: "Right", value: "right", description: "Sidebar positioned on the right side" },
];

/** Preferences 中暴露给 `<ColorPicker>` 编辑的品牌色 token 集合。 */
export const baseColors: BrandColor[] = [
  { name: "Primary", cssVar: "--primary" },
  { name: "Primary Foreground", cssVar: "--primary-foreground" },
  { name: "Secondary", cssVar: "--secondary" },
  { name: "Secondary Foreground", cssVar: "--secondary-foreground" },
  { name: "Accent", cssVar: "--accent" },
  { name: "Accent Foreground", cssVar: "--accent-foreground" },
  { name: "Muted", cssVar: "--muted" },
  { name: "Muted Foreground", cssVar: "--muted-foreground" },
];

/** 把 `Record<value, preset>` 摊平为 `<Select>` 所需的列表形态。 */
function toThemes(presets: Record<string, ThemePreset>): ColorTheme[] {
  return Object.entries(presets).map(([value, preset]) => ({
    name: preset.label ?? value,
    value,
    preset,
  }));
}

export const shadcnThemes: ColorTheme[] = toThemes(shadcnThemePresets);
export const tweakcnThemes: ColorTheme[] = toThemes(tweakcnPresets);
