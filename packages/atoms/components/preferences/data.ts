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

export const radiusOptions: RadiusOption[] = [
  { name: "0", value: "0rem" },
  { name: "0.3", value: "0.3rem" },
  { name: "0.5", value: "0.5rem" },
  { name: "0.75", value: "0.75rem" },
  { name: "1.0", value: "1rem" },
];

export const sidebarVariants: SidebarVariant[] = [
  { name: "Default", value: "sidebar", description: "Standard sidebar layout" },
  { name: "Floating", value: "floating", description: "Floating sidebar with border" },
  { name: "Inset", value: "inset", description: "Inset sidebar with rounded corners" },
];

export const collapsibleOptions: CollapsibleOption[] = [
  { name: "Off Canvas", value: "offcanvas", description: "Slides out of view" },
  { name: "Icon", value: "icon", description: "Collapses to icon only" },
  { name: "None", value: "none", description: "Always visible" },
];

export const sideOptions: SideOption[] = [
  { name: "Left", value: "left", description: "Sidebar positioned on the left side" },
  { name: "Right", value: "right", description: "Sidebar positioned on the right side" },
];

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

function toThemes(presets: Record<string, ThemePreset>): ColorTheme[] {
  return Object.entries(presets).map(([value, preset]) => ({
    name: preset.label ?? value,
    value,
    preset,
  }));
}

export const shadcnThemes: ColorTheme[] = toThemes(shadcnThemePresets);
export const tweakcnThemes: ColorTheme[] = toThemes(tweakcnPresets);
