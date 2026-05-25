/** 主题预设：light / dark 两套 CSS 变量。 */
export interface ThemePreset {
  /** 预设名（可选，用于下拉显示）。 */
  label?: string;
  styles: {
    /** light 模式下的 CSS 变量映射，键不含 `--` 前缀。 */
    light: Record<string, string>;
    /** dark 模式下的 CSS 变量映射，键不含 `--` 前缀。 */
    dark: Record<string, string>;
  };
}

/** Theme preset 的下拉项形态。 */
export interface ColorTheme {
  /** 显示名。 */
  name: string;
  /** 在 reducer / Select 中使用的稳定 key。 */
  value: string;
  /** 完整的预设数据。 */
  preset: ThemePreset;
}

/** 用户从 Importer 对话框粘贴 CSS 解析出的主题。 */
export interface ImportedTheme {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** 品牌色 token：显示名 + CSS 变量名（**带** `--` 前缀）。 */
export interface BrandColor {
  name: string;
  cssVar: string;
}

/** 圆角预设选项。 */
export interface RadiusOption {
  name: string;
  value: string;
}

/** 侧边栏 variant 选项（与 shadcn Sidebar 对齐）。 */
export interface SidebarVariant {
  name: string;
  value: "sidebar" | "floating" | "inset";
  description: string;
}

/** 折叠行为选项。 */
export interface CollapsibleOption {
  name: string;
  value: "offcanvas" | "icon" | "none";
  description: string;
}

/** 摆放位置选项。 */
export interface SideOption {
  name: string;
  value: "left" | "right";
  description: string;
}
