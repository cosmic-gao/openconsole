# Theming

`@openconsole/atoms`' theming system is built on `next-themes` + Tailwind v4
semantic tokens (inherited from `@openconsole/shadcn`) + the three atoms
providers. This document covers:

- Setup (`@import` shadcn + atoms stylesheets).
- Wiring light / dark mode.
- View-transition circular reveal animation.
- Font switching.
- Layout variant switching.
- Theme preset extension (and its limits).

---

## Setup

App-level global CSS:

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";
```

- `shadcn/styles.css` ships theme tokens, the `@theme inline` mapping,
  and the base-layer reset.
- `atoms/styles.css` ships the font rules paired with `FontProvider`
  (`:root.font-inter body { font-family: var(--font-inter), ... }`, etc.).

Both `@import`s are required; shadcn must come first.

---

## Light / dark switching

```tsx
import { ThemeProvider, ThemeSwitch } from "@openconsole/atoms";

// At the root
<ThemeProvider>{children}</ThemeProvider>

// Anywhere
<ThemeSwitch />
```

`ThemeProvider` is a thin wrapper around `next-themes` `ThemeProvider` with
these defaults:

```tsx
<NextThemesProvider
  attribute="class"            // adds "dark" class to <html>
  defaultTheme="system"         // follows OS
  enableSystem
  disableTransitionOnChange     // avoids transition flicker during switch
/>
```

Override by passing the same prop:

```tsx
<ThemeProvider defaultTheme="light">{children}</ThemeProvider>
```

---

## View-transition circular reveal

When clicked, `ThemeSwitch` writes the cursor position to two CSS
percentage variables (`--vt-origin-x` / `--vt-origin-y`) and calls
`document.startViewTransition` to swap the theme. Combined with the global
CSS below, the new theme reveals as a circle expanding from the click point:

```css
/* Add this to your app's global CSS */
@supports (view-transition-name: root) {
  ::view-transition-new(root) {
    clip-path: circle(0% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    animation: vt-circle-in 350ms ease-out forwards;
  }
  @keyframes vt-circle-in {
    to {
      clip-path: circle(150% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    }
  }
}
```

Browsers without View Transitions support (Firefox < 132, etc.) fall back
to an instant switch.

### Writing your own animated toggle

`useViewTransition` is an **internal** hook (not exported from the
package barrel). To build a custom toggle with the same effect, mirror
`ThemeSwitch`'s pattern:

```tsx
"use client";
import { useTheme } from "next-themes";
import { Button } from "@openconsole/shadcn";

type TransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export function MyThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const onClick = (e: React.MouseEvent) => {
    const root = document.documentElement;
    root.style.setProperty("--vt-origin-x", `${(e.clientX / window.innerWidth) * 100}%`);
    root.style.setProperty("--vt-origin-y", `${(e.clientY / window.innerHeight) * 100}%`);
    const next = resolvedTheme === "dark" ? "light" : "dark";
    const doc = document as TransitionDocument;
    if (doc.startViewTransition) {
      doc.startViewTransition(() => setTheme(next));
    } else {
      setTheme(next);
    }
  };

  return <Button onClick={onClick}>Toggle theme</Button>;
}
```

> Use `resolvedTheme` rather than `theme` — when the user is on System
> mode, `theme === "system"`, so a naive `theme === "dark" ? ...` flip
> won't work on the first click.

---

## Font switching

```tsx
import { FontProvider, useFont } from "@openconsole/atoms";

// At the root
<FontProvider options={["inter", "manrope", "system"]}>
  {children}
</FontProvider>

// Anywhere
function MyFontPicker() {
  const { font, setFont, options } = useFont();
  return (
    <select value={font} onChange={(e) => setFont(e.target.value)}>
      {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
    </select>
  );
}
```

`FontProvider` applies the active font by adding `font-${value}` to
`<html>` (prefix `font-` by default). The default three options
(`inter` / `manrope` / `system`) come with font-family rules shipped in
`@openconsole/atoms/styles.css`:

```css
:root.font-inter body { font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif; }
:root.font-manrope body { font-family: var(--font-manrope), ui-sans-serif, system-ui, sans-serif; }
:root.font-system body { font-family: ui-sans-serif, system-ui, sans-serif, ...emoji; }
```

Make sure the CSS variables (`--font-inter`, `--font-manrope`) are
injected by the consuming app — usually via `next/font/google`:

```ts
// app/fonts.ts
import { Inter, Manrope } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
```

```tsx
// app/layout.tsx
<body className={`${inter.variable} ${manrope.variable}`}>
```

### Disable persistence

```tsx
<FontProvider storage={null}>{children}</FontProvider>
```

### Custom class prefix

```tsx
<FontProvider classPrefix="theme-font-">  {/* class becomes theme-font-inter */}
  {children}
</FontProvider>
```

### Disable class application (apply yourself)

```tsx
<FontProvider classPrefix="">{children}</FontProvider>
```

Then use `useFont()`'s `font` value and apply it to any element manually.

---

## Layout variant switching

```tsx
import { LayoutProvider, useLayout, Sidebar } from "@openconsole/atoms";
import { SidebarProvider } from "@openconsole/shadcn";

// At the root
<LayoutProvider>
  <SidebarProvider>
    <Sidebar {...data} />
    {children}
  </SidebarProvider>
</LayoutProvider>

// Inside a settings panel
function LayoutSettings() {
  const { config, updateConfig } = useLayout();
  return (
    <>
      <select
        value={config.variant}
        onChange={(e) => updateConfig({ variant: e.target.value as any })}
      >
        <option value="sidebar">sidebar</option>
        <option value="floating">floating</option>
        <option value="inset">inset</option>
      </select>
      <select
        value={config.collapsible}
        onChange={(e) => updateConfig({ collapsible: e.target.value as any })}
      >
        <option value="offcanvas">offcanvas</option>
        <option value="icon">icon</option>
        <option value="none">none</option>
      </select>
      <select
        value={config.side}
        onChange={(e) => updateConfig({ side: e.target.value as any })}
      >
        <option value="left">left</option>
        <option value="right">right</option>
      </select>
    </>
  );
}
```

`Sidebar` reads all three values from `config` and forwards them to
shadcn's `Sidebar` primitive — you never wire them up directly. Reach
for `useLayout()` only when building a user-controlled settings panel.

### Persistence

`LayoutProvider` **doesn't persist**. To persist, wrap it:

```tsx
"use client";
import * as React from "react";
import {
  LayoutProvider,
  useLayout,
  type LayoutConfig,
} from "@openconsole/atoms";

const STORAGE_KEY = "myapp-layout-config";

export function PersistentLayoutProvider({ children }: { children: React.ReactNode }) {
  const [stored] = React.useState<Partial<LayoutConfig> | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<LayoutConfig>) : undefined;
  });

  return (
    <LayoutProvider defaultConfig={stored}>
      <LayoutPersister />
      {children}
    </LayoutProvider>
  );
}

function LayoutPersister() {
  const { config } = useLayout();
  React.useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [config]);
  return null;
}
```

---

## Theme preset extension (limits)

The `Preferences` drawer ships with two built-in preset families:
**shadcn** and **tweakcn**. Their data lives inside the atoms package
(`components/preferences/presets/`) and **cannot** be edited by the
consumer.

To extend:

1. **Temporary theme change** — let the user paste a CSS block
   (`:root { … } .dark { … }`) into the `Preferences` **Importer** tab.
   It's parsed and applied live.
2. **Permanent theme change** — override `:root` / `.dark` semantic tokens
   (`--primary`, `--background`, …) in your app's global CSS.

If you need built-in presets (e.g. brand-specific palettes), the
recommended workaround is:

- Maintain your own preset list at the app level.
- Build a simple `<select>` UI (don't go through the `Preferences` drawer).
- On select, apply each CSS variable via
  `document.documentElement.style.setProperty`:

```tsx
const presets = {
  ocean: {
    "--primary": "oklch(0.55 0.18 235)",
    "--background": "oklch(0.98 0.01 235)",
    /* ... */
  },
  forest: {
    "--primary": "oklch(0.55 0.18 145)",
    "--background": "oklch(0.98 0.01 145)",
    /* ... */
  },
};

function applyPreset(name: keyof typeof presets) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(presets[name])) {
    root.style.setProperty(k, v);
  }
}
```

---

## State boundaries across the three providers

| State | Controlled by | Applies to |
|---|---|---|
| Light / dark | `<html class="dark">` | Anything referencing the `dark:` variant or semantic tokens |
| Font | `<html class="font-inter">` | Global `font-family` (requires the matching CSS rule) |
| Sidebar variant | atoms `useLayout()` config | `Sidebar` component (shadcn `Sidebar` primitive's `variant` / `collapsible` / `side` props) |
| Sidebar open / collapse | shadcn `useSidebar()` open state | `Sidebar` component itself |

Structural tokens (theme colors, radius, spacing) aren't owned by any
provider — they're plain global CSS variables that all components read
naturally.
