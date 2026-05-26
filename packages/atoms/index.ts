/**
 * `@openconsole/atoms` —— 基于 `@openconsole/shadcn` 拼装的业务级组件。
 *
 * 目录约定：
 *
 * - `components/`  视觉组件（Breadcrumbs / ColorPicker / Errors / Header /
 *                  Preferences / Sidebar / ThemeSwitch）。扁平文件和多文件
 *                  目录在同一层。
 * - `providers/`   上下文 Provider（FontProvider / LayoutProvider /
 *                  ThemeProvider）。
 * - `hooks/`       公开 Hook（`useBreadcrumbs`；`useViewTransition` 仅内部用）。
 *
 * @module
 */

// Providers / context
export * from "./providers/font-provider";
export * from "./providers/layout";
export * from "./providers/theme-provider";

// Hooks（公开）
export * from "./hooks/use-breadcrumbs";

// Components
export * from "./components/breadcrumbs";
export * from "./components/color-picker";
export * from "./components/errors";
export * from "./components/header";
export * from "./components/preferences";
export * from "./components/sidebar";
export * from "./components/theme-switch";
