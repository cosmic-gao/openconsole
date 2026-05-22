export interface ThemePreset {
  label?: string;
  styles: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}

export interface ColorTheme {
  name: string;
  value: string;
  preset: ThemePreset;
}

export interface ImportedTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
}

export interface BrandColor {
  name: string;
  cssVar: string;
}

export interface RadiusOption {
  name: string;
  value: string;
}

export interface SidebarVariant {
  name: string;
  value: "sidebar" | "floating" | "inset";
  description: string;
}

export interface CollapsibleOption {
  name: string;
  value: "offcanvas" | "icon" | "none";
  description: string;
}

export interface SideOption {
  name: string;
  value: "left" | "right";
  description: string;
}
