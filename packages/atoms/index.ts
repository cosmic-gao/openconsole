// Custom higher-order blocks composed from @openconsole/shadcn primitives.
//
// Layout:
//   - components/   Visual components (Breadcrumbs, ColorPicker, Header,
//                   Preferences, Sidebar, ThemeSwitch). Flat files and
//                   multi-file directories coexist at the same level.
//   - providers/    Context providers (FontProvider, LayoutProvider, ThemeProvider).
//   - hooks/        Public hooks (useBreadcrumbs; useViewTransition is internal).

// Providers / context
export * from "./providers/font-provider";
export * from "./providers/layout-provider";
export * from "./providers/theme-provider";

// Hooks (public)
export * from "./hooks/use-breadcrumbs";

// Components
export * from "./components/breadcrumbs";
export * from "./components/color-picker";
export * from "./components/header";
export * from "./components/preferences";
export * from "./components/sidebar";
export * from "./components/theme-switch";
