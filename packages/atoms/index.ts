// Custom higher-order blocks composed from @openconsole/shadcn primitives.
//
// 目录:
//   - components/   视觉组件 (Breadcrumbs, ColorPicker, Combobox, DataTable,
//                   DatePicker, Header, Preferences, Sidebar, ThemeSwitch)。
//                   单文件或多文件目录平级共存。
//   - providers/    Context provider (FontProvider, LayoutProvider, ThemeProvider)
//   - hooks/        通用 hook (useBreadcrumbs; useViewTransition 是内部 hook)

// Providers / context
export * from "./providers/font-provider";
export * from "./providers/layout-provider";
export * from "./providers/theme-provider";

// Hooks (public)
export * from "./hooks/use-breadcrumbs";

// Components
export * from "./components/theme-switch";
export * from "./components/breadcrumbs";
export * from "./components/color-picker";
export * from "./components/combobox";
export * from "./components/data-table";
export * from "./components/date-picker";
export * from "./components/header";
export * from "./components/preferences";
export * from "./components/sidebar";
