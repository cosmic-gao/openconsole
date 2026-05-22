// Custom higher-order blocks composed from @opendesign/shadcn primitives.
//
// 目录:
//   - components/   视觉组件 (ThemeSwitch, ColorPicker, Combobox, DataTable,
//                   DatePicker, Preferences, Sidebar)。单文件或多文件目录平级共存。
//   - providers/    Context provider (FontProvider, LayoutProvider, ThemeProvider)
//   - hooks/        通用 hook (useViewTransition)

// Providers / context
export * from "./providers/font-provider";
export * from "./providers/layout-provider";
export * from "./providers/theme-provider";

// Components
export * from "./components/theme-switch";
export * from "./components/color-picker";
export * from "./components/combobox";
export * from "./components/data-table";
export * from "./components/date-picker";
export * from "./components/preferences";
export * from "./components/sidebar";
