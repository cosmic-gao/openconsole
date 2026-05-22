# Provider Assembly

`@openconsole/atoms` exposes three Context providers. Combined with one
shadcn primitive provider, they form the standard root-layout setup. This
document spells out:

- What each provider owns.
- The required assembly order and why.
- Default values and tunable props.
- Persistence strategies and extension points.

---

## The four providers

| Provider | From | Owns | Persistence |
|---|---|---|---|
| `ThemeProvider` | `@openconsole/atoms` | Light / dark / system theme (adds `dark` class to `<html>`) | localStorage (via next-themes) |
| `FontProvider` | `@openconsole/atoms` | Active font (adds `font-${name}` class to `<html>`) | localStorage (key `openconsole-font` by default, opt-out available) |
| `LayoutProvider` | `@openconsole/atoms` | Sidebar variant: `variant` / `collapsible` / `side` | **Not persisted** (consumer wires their own) |
| `SidebarProvider` | `@openconsole/shadcn` | Sidebar open / collapse state, mobile open state | cookie (shadcn handles it) |

---

## Standard setup

```tsx
// app/layout.tsx
import {
  ThemeProvider,
  FontProvider,
  LayoutProvider,
} from "@openconsole/atoms";
import { SidebarProvider } from "@openconsole/shadcn";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <FontProvider>
            <LayoutProvider>
              <SidebarProvider>
                {children}
              </SidebarProvider>
            </LayoutProvider>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

### `suppressHydrationWarning`

`<html>` must have `suppressHydrationWarning` — `next-themes` synchronously
sets the `dark` class on the client before first paint, which guarantees a
mismatch with the server-rendered class. Without the suppression, React
emits a hydration warning.

---

## Why this order

The inside-out dependency chain is `SidebarProvider` → `LayoutProvider` →
`FontProvider` → `ThemeProvider`.

- **`ThemeProvider` outermost**: it sets the `dark` class on `<html>`, and
  outer CSS resolution depends on that class. Nesting it deeper makes
  next-themes' inline script potentially fire after child providers mount.
- **`FontProvider` directly inside `ThemeProvider`**: it also sets a class
  on `<html>` (`font-inter`, etc.). Logically peer to `ThemeProvider`, but
  because `ThemeProvider` also handles SSR and `matchMedia`, putting
  `FontProvider` inside it is more natural.
- **`LayoutProvider` inside `FontProvider`**: it's pure React state with no
  DOM side effects, so placement is flexible.
- **`SidebarProvider` (from shadcn) innermost**: it reads `LayoutProvider`'s
  config to seed the sidebar's initial state. If your sidebar isn't shown
  on every route, you can push `SidebarProvider` down to a narrower layout
  that only covers sidebar-bearing routes.

---

## Picking a subset

Not every app needs the full stack. Common compositions:

### Only theme switching

```tsx
<ThemeProvider>{children}</ThemeProvider>
```

Business code only uses `ThemeSwitch` or next-themes' `useTheme`.

### Theme + font switching

```tsx
<ThemeProvider>
  <FontProvider>{children}</FontProvider>
</ThemeProvider>
```

Business code can use `useFont()` for a custom font picker UI.

### Theme + layout (no font switching)

```tsx
<ThemeProvider>
  <LayoutProvider>
    <SidebarProvider>
      {children}
    </SidebarProvider>
  </LayoutProvider>
</ThemeProvider>
```

### Using the `Preferences` drawer

Requires **all three atoms providers**:

```tsx
<ThemeProvider>
  <FontProvider>
    <LayoutProvider>
      {/* Preferences reads all three internally */}
      {children}
    </LayoutProvider>
  </FontProvider>
</ThemeProvider>
```

---

## Tunable props

### `ThemeProvider`

```tsx
<ThemeProvider
  attribute="class"           // default "class"
  defaultTheme="system"        // default "system"
  enableSystem                 // default true
  disableTransitionOnChange    // default true (avoids transition flicker)
>
  {children}
</ThemeProvider>
```

Accepts any `next-themes` `ThemeProvider` prop — it's a thin wrapper.

### `FontProvider`

```tsx
<FontProvider
  options={["inter", "manrope", "jetbrains-mono", "system"]}
  defaultFont="inter"
  storage="myapp-font"         // pass `null` to disable persistence
  classPrefix="font-"          // pass `""` to skip class application
>
  {children}
</FontProvider>
```

The active font is applied by adding `font-${value}` to `<html>`. The
default three fonts (`inter` / `manrope` / `system`) come with rules
shipped in `@openconsole/atoms/styles.css`, equivalent to:

```css
:root.font-inter body { font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif; }
:root.font-manrope body { font-family: var(--font-manrope), ui-sans-serif, system-ui, sans-serif; }
:root.font-system body { font-family: ui-sans-serif, system-ui, sans-serif, ...emoji; }
```

You only need to inject the CSS variables (`--font-inter`,
`--font-manrope`) — typically via `next/font/google`:

```ts
// app/fonts.ts
import { Inter, Manrope } from "next/font/google";

export const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
export const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });

// app/layout.tsx
<body className={`${inter.variable} ${manrope.variable}`}>
```

To extend the list (e.g. `jetbrains-mono`), add the matching
`:root.font-jetbrains-mono body { ... }` rule to your app's global CSS
**and** pass `<FontProvider options={[..., "jetbrains-mono"]}>`.

### `LayoutProvider`

```tsx
<LayoutProvider
  defaultConfig={{
    variant: "inset",          // sidebar | floating | inset
    collapsible: "icon",       // offcanvas | icon | none
    side: "left",              // left | right
  }}
>
  {children}
</LayoutProvider>
```

Does not persist. To persist, wrap it:

```tsx
"use client";
import * as React from "react";
import { LayoutProvider, useLayout, type LayoutConfig } from "@openconsole/atoms";

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

## Hook contract

Each hook must be called inside its provider — otherwise it throws.

| Hook | Required wrapper | Returns |
|---|---|---|
| `useTheme()` (from next-themes) | `ThemeProvider` | `{ theme, resolvedTheme, setTheme, themes }` |
| `useFont()` | `FontProvider` | `{ font, setFont, options }` |
| `useLayout()` | `LayoutProvider` | `{ config, updateConfig }` |
| `useSidebar()` (from shadcn) | `SidebarProvider` | `{ open, setOpen, openMobile, ... }` |

Throw messages look like:

- `useLayout must be used within a LayoutProvider`
- `useFont must be used within a FontProvider`

Seeing one of these → audit root provider assembly.

---

## SSR notes

- **`ThemeProvider`**: `next-themes` injects the `dark` class on the client
  before hydration, so the SSR output does **not** include it. Pair with
  `suppressHydrationWarning`.
- **`FontProvider`**: similar — `useEffect` reads localStorage after mount,
  so the first paint may show the default font before flipping. To avoid
  flicker, set `defaultFont` to whatever the SSR HTML expects.
- **`LayoutProvider`**: pure client state; SSR emits a fixed
  `defaultConfig` snapshot.
