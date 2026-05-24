---
name: openconsole-atoms
description: >
  Guide for using `@openconsole/atoms`. Higher-order components and Context
  providers built on top of `@openconsole/shadcn` primitives — ThemeSwitch
  (view-transition circular reveal), Preferences (settings drawer), Sidebar
  (brand / menu / account three-section layout), Header (sticky dashboard
  header), Breadcrumbs (auto-derived from pathname), ColorPicker, plus
  ThemeProvider / FontProvider / LayoutProvider. Use when scaffolding an
  app shell (theme/font/layout providers), building a settings drawer, a
  branded sidebar, a sticky header with breadcrumbs, or toggling the theme.
type: ui
library: "@openconsole/atoms"
runtime:
  react: "^19"
  tailwind: "^4"
peers:
  "@openconsole/shadcn": "*"
  "lucide-react": "*"
  "next": "*"
  "next-themes": "*"
---

# `@openconsole/atoms` — Higher-Order UI Components + Providers

An npm package that composes `@openconsole/shadcn` primitives into
business-ready higher-order components (settings drawer, branded sidebar,
sticky header, breadcrumbs, theme toggle…) and a set of Context providers
that manage cross-page state (theme, font, layout variant).

This package is **read-only consumption**: every available export is what
`index.ts` lists. There is no CLI and source files cannot be modified.

This document covers:

1. Mapping a user request to the right atom.
2. Provider assembly order at the app root and why it matters.
3. Each component's API plus a complete code example.
4. How atoms compose with `@openconsole/shadcn` (when to use the atom vs.
   when to drop down to the primitive).
5. The edges of what the three providers (theme / font / layout) can do.

---

## When to use this document

Use it when any of the following is true:

- You're editing or writing code in a file that imports `@openconsole/atoms`.
- You're scaffolding a new app shell that needs `ThemeProvider` +
  `FontProvider` + `LayoutProvider`.
- The user describes a "settings drawer", "branded sidebar", "theme toggle
  button", "sticky header", "page breadcrumbs", or anything else this
  package covers.
- You're unsure whether to reach for the atom or directly use a shadcn
  primitive.

---

## Installation

In your app's global CSS, `@import` atoms' stylesheet **after** shadcn's:

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";
```

`atoms/styles.css` ships:

- `@source` directives that register its own source files with Tailwind.
- Font rules paired with `FontProvider` (`:root.font-inter`, `.font-manrope`,
  `.font-system`).

Tokens are inherited from shadcn — atoms doesn't redeclare them. So **both
`@import`s are required**, and shadcn must come first.

---

## Project context

| Field | Value |
|---|---|
| Import path | `@openconsole/atoms` (single entry point) |
| Underlying library | `@openconsole/shadcn` primitives |
| Styling | Tailwind v4 + semantic tokens inherited from shadcn |
| Icons | Rendered via shadcn's `Icon` wrapper, which resolves lucide-react icons by string name |
| Theme runtime | `next-themes` (`ThemeProvider` is a thin wrapper) |
| Persistence | `ThemeProvider` uses localStorage (via next-themes); `FontProvider` uses localStorage (optional); `LayoutProvider` does **not** persist |

---

## Use-case lookup

When a user describes what they want in plain language, map their wording
to the right atom using the table below. The table only lists scenarios
**this package covers** — if the request lands on a shadcn primitive (Button,
Dialog, Card, etc.), reach for shadcn directly.

| User phrasing (keywords) | Pick this | Key props / combos |
|---|---|---|
| "App shell / admin chrome" | App root `<ThemeProvider> + <FontProvider> + <LayoutProvider>` + `<Sidebar>` + `<Header>` | See [Provider assembly](#provider-assembly-critical) |
| "Theme toggle button / light-dark switcher" | `ThemeSwitch` | Zero-config — auto circular reveal via view-transition |
| "Settings drawer / preferences / theme panel / change font or layout" | `Preferences` | `<Preferences open={x} onOpenChange={setX} />` |
| "Sidebar / navigation / admin sidebar / sidebar with logo" | `Sidebar` | Pass `brand` + `menu` + `account`; `account.menu` adds a Profile/Logout dropdown |
| "Sticky header / dashboard header / top bar with breadcrumbs" | `Header` | `<Header />` auto-renders `<Breadcrumbs />`; pass `actions` for right-side controls |
| "Breadcrumb navigation / auto crumbs from URL" | `Breadcrumbs` (or `useBreadcrumbs` for headless) | `<Breadcrumbs />` for default UI; `useBreadcrumbs({ labels })` for custom rendering |
| "Color input / palette field" | `ColorPicker` | Bind to a `cssVar`, write the value back via `document.documentElement.style.setProperty` in the callback |
| "Error page / 404 / 500 / access denied / maintenance" | `Unauthorized` / `Forbidden` / `NotFound` / `ServerError` / `Maintenance` | Drop into Next.js `not-found.tsx` / `error.tsx`; override `actions` for context-specific buttons (e.g. `reset` callback) |
| "Font switching (business writes its own button)" | `useFont()` hook + your own toggle | `FontProvider` must wrap the call site |
| "Layout variant switching (floating / inset, left/right, collapsible mode)" | `useLayout()` hook | `LayoutProvider` must wrap the call site; manipulates `config.variant` / `collapsible` / `side` |

### Common boundary calls

- "I need a Sidebar" → use atoms' `Sidebar` (one stop for brand/menu/account)
  rather than hand-assembling shadcn's `<Sidebar>` root + sub-primitives.
- "I need a theme toggle button" → use atoms' `ThemeSwitch`; don't write
  your own `useTheme` flip.
- "I need a theme + font + layout settings panel" → use atoms' `Preferences`.
- "I want a sticky header with breadcrumbs" → use atoms' `Header` + the
  built-in `<Breadcrumbs />` default. Override via `breadcrumbs={…}` when
  you need a custom title or page action.
- "I want auto breadcrumbs but with custom labels for some routes" →
  `<Header breadcrumbsProps={{ labels: { "/orders/123": "Order #123" } }} />`
  or `<Breadcrumbs labels={…} />` if rendering outside a Header.

---

## Provider assembly (critical)

```tsx
// app/layout.tsx (or your root layout)
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

**Assembly order**: `ThemeProvider` → `FontProvider` → `LayoutProvider` →
`SidebarProvider` (from shadcn) → children.

- `ThemeProvider` is outermost — it sets the `dark` class on `<html>`.
- `FontProvider` adds `font-${value}` to `<html>`.
- `LayoutProvider` holds the sidebar variant state (`variant` /
  `collapsible` / `side`).
- `SidebarProvider` (**shadcn's**, not atoms') is required by atoms'
  `Sidebar` component.

See [provider-setup.md](./provider-setup.md) for the full breakdown.

---

## Component reference

### `ThemeSwitch`

Zero-prop, one-click light/dark toggle. Uses the View Transitions API to
animate a circular reveal from the click point; falls back to an instant
switch in unsupported browsers. Reads `resolvedTheme` so it flips correctly
even while in System mode.

```tsx
import { ThemeSwitch } from "@openconsole/atoms";

<ThemeSwitch />
```

Drop it in a nav, sidebar, or header corner.

### `Header`

Sticky dashboard header designed to pair with `<Sidebar>` / `<SidebarInset>`.

```tsx
import { Header } from "@openconsole/atoms";

// Defaults: auto breadcrumbs + ThemeSwitch + Preferences trigger.
<Header />

// With custom right-side actions (renders before the default action group).
<Header
  actions={
    <>
      <SearchButton />
      <NotificationsBell />
    </>
  }
/>

// Override breadcrumbs with a page title.
<Header breadcrumbs={<h1 className="font-semibold">Orders</h1>} />

// Hide breadcrumbs entirely.
<Header breadcrumbs={false} />

// Customize default Breadcrumbs without overriding it.
<Header breadcrumbsProps={{ labels: { "/orders/123": "Order #123" } }} />

// Hide the built-in ThemeSwitch + Preferences group.
<Header hideDefaultActions actions={<MyOwnActions />} />
```

Layout: two segments (`nav` / `tools`) with `justify-between`, a soft
`bg-background/60 backdrop-blur-md` backdrop, and a compact `md:h-14`
desktop height. The `nav` segment (breadcrumbs + expand trigger when
collapsed) sits on the sidebar side; `tools` (caller `actions` plus the
built-in `<ThemeSwitch />` and Settings button that opens `Preferences`)
sits on the opposite side. When `LayoutProvider`'s `side` is `"right"`,
both segments swap automatically alongside the sidebar itself.

**Notes**:
- The sidebar toggle is split across the two components: brand carries
  the collapse button when expanded; Header auto-renders an expand
  button at the header edge nearest the sidebar (left edge for
  `side="left"`, right edge for `side="right"`) when the sidebar is
  collapsed. Icons mirror the sidebar position — `ChevronsLeft` /
  `PanelLeftOpen` for left sidebars, `ChevronsRight` / `PanelRightOpen`
  for right sidebars. Together they cover both `icon` and `offcanvas`
  modes — no extra trigger needed. Both buttons are suppressed when
  `collapsible="none"` (sidebar always visible, nothing to toggle).
- Requires `SidebarProvider` from `@openconsole/shadcn` above it (Header
  reads `useSidebar()`).
- The `breadcrumbs` slot accepts `ReactNode | false`. `undefined`
  (default) renders `<Breadcrumbs />`; `false` hides; anything else
  replaces.
- `actions` renders **before** the default group, so app-level controls
  sit closer to the page content and theme controls sit at the far edge.

### `Breadcrumbs`

Auto-derived breadcrumb navigation. Reads `usePathname()` and renders one
crumb per segment. The last crumb is the current page (rendered as
`BreadcrumbPage`, non-clickable); intermediate crumbs are `<Link>`s. Empty
pathnames render `null` (no chrome).

```tsx
import { Breadcrumbs } from "@openconsole/atoms";

// Default — derived from the current pathname.
<Breadcrumbs />

// Per-path title overrides.
<Breadcrumbs labels={{ "/orders/123": "Order #123", "/orders": "All orders" }} />

// Manually-provided crumbs (e.g. wizards, modal flows).
<Breadcrumbs
  items={[
    { title: "Settings", link: "/settings" },
    { title: "Billing", link: "/settings/billing" },
  ]}
/>

// Custom separator.
<Breadcrumbs separator={<span>/</span>} />

// Keep intermediate crumbs visible on mobile (default: hidden < md).
<Breadcrumbs showAllOnMobile />
```

For headless rendering (your own UI), call `useBreadcrumbs()` directly.

### `useBreadcrumbs`

Headless hook that returns the crumb chain for the current pathname.

```tsx
import { useBreadcrumbs, type Crumb } from "@openconsole/atoms";

const crumbs: Crumb[] = useBreadcrumbs({
  labels: { "/orders/123": "Order #123" },
  transform: (segment) => segment.toUpperCase(),
});
// → [{ title: "ORDERS", link: "/orders" }, { title: "Order #123", link: "/orders/123" }]
```

`Crumb` is `{ title: string; link: string }`. The hook is `"use client"`
because it reads `usePathname()`.

### `Preferences`

Full settings drawer that slides in from the right. Built-in tabs:

- **Theme**: pick from shadcn and tweakcn presets, tweak individual tokens
  (via the built-in `ColorPicker`), or paste a CSS theme via the Importer
  dialog.
- **Layout**: configure `LayoutConfig` (variant / collapsible / side)
  with live preview — instantly reflected in `<Sidebar>`.

```tsx
import { Preferences } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { Settings } from "lucide-react";

function PreferencesButton() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <Settings />
      </Button>
      <Preferences open={open} onOpenChange={setOpen} />
    </>
  );
}
```

**Prerequisites**: the app root must have `ThemeProvider` + `FontProvider`
+ `LayoutProvider` mounted. `<Header />` opens this drawer by default —
you only need to render it directly when not using `Header`.

### `Sidebar`

Three-section sidebar (brand / menu / account) that automatically reads
`variant` / `collapsible` / `side` from `LayoutProvider`.

Visual styling stays close to shadcn defaults: the brand logo sits in a
solid `bg-sidebar-primary` square; the active menu item highlights with
the primitive's built-in `bg-sidebar-accent` — change the theme tokens
and the whole sidebar follows.

The brand header also carries a collapse button (hidden when the
sidebar is collapsed). The icon flips with `side` —
`ChevronsLeft` / `ChevronsRight`. To re-expand: click the matching
`PanelLeftOpen` / `PanelRightOpen` button auto-rendered at the
corresponding edge of `<Header>`, click the `SidebarRail` (rendered by
default), or press `Ctrl/Cmd+B`.

```tsx
import { Sidebar } from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";

const data = {
  brand: {
    name: "Acme",
    logo: "Command",                       // lucide icon name
    description: "Workspace · Free",
  },
  menu: [
    {
      label: "Main",
      items: [
        { label: "Dashboard", icon: "LayoutDashboard", href: "/" },
        { label: "Projects", icon: "FolderOpen", href: "/projects", badge: "12" },
        {
          label: "Team",
          icon: "Users",
          children: [
            { label: "Members", icon: "User", href: "/team/members" },
            { label: "Permissions", icon: "Shield", href: "/team/permissions" },
          ],
        },
      ],
    },
  ],
  account: {
    name: "Jane Doe",
    email: "jane@acme.com",
    avatar: "/avatar.png",
    // Optional dropdown menu (Profile / Billing / Sign out).
    // Without `menu`, the account block is a static card.
    menu: [
      { label: "Profile", icon: "User", href: "/profile" },
      { label: "Billing", icon: "CreditCard", href: "/billing" },
      { label: "Notifications", icon: "Bell", href: "/notifications" },
      {
        label: "Sign out",
        icon: "LogOut",
        onSelect: () => signOut(),
        separator: true,    // Draws a separator immediately above this item.
        destructive: true,  // Red text for destructive actions.
      },
    ],
  },
};

// Render inside SidebarProvider.
<Sidebar {...data} />
<SidebarInset>{children}</SidebarInset>
```

**`AccountMenuItem` fields**:

| Field | Type | Notes |
|---|---|---|
| `label` | `string` | Required, menu item text. |
| `icon` | `string` | Optional, lucide icon name. |
| `href` | `LinkProps["href"]` | Renders as a `<Link>`. |
| `onSelect` | `() => void` | Click handler (mutually exclusive with `href`). |
| `separator` | `boolean` | Insert a separator immediately **before** this item. |
| `destructive` | `boolean` | Red text — fits "Sign out" / "Delete". |

**Notes**:
- Data-driven — don't hand-assemble menu items in JSX.
- Icons are passed as string names (`"LayoutDashboard"`), not imported
  components.
- Only one level of nesting is rendered (parent + children); deeper
  nesting is ignored.
- `account.menu` empty/omitted ⇒ static card; populated ⇒ dropdown
  trigger with a `ChevronsUpDown` affordance (desktop opens to the right;
  mobile opens from the bottom).
- When importing shadcn's `Sidebar` in the same file, alias one of them
  (see [Common pitfalls](#common-pitfalls)).

### `ColorPicker`

Color input bound to a CSS variable — used inside the Preferences drawer
to tweak individual brand tokens, but exported for app-level reuse.

```tsx
import { ColorPicker } from "@openconsole/atoms";

<ColorPicker
  label="Primary"
  cssVar="--primary"
  value="oklch(0.6 0.15 250)"
  onChange={(cssVar, value) => {
    document.documentElement.style.setProperty(cssVar, value);
  }}
/>
```

Accepts hex / oklch / hsl / rgb / named colors. The round swatch opens
the native `<input type="color">` — any non-hex value is normalized via
a hidden canvas before being shown there. The user's original string is
preserved in `value`.

### `Unauthorized` / `Forbidden` / `NotFound` / `ServerError` / `Maintenance`

Five drop-in error pages covering the common HTTP statuses (401 / 403 /
404 / 500 / 503). Each renders a centered layout — icon, status code,
title, description, action row — pre-wired with sensible defaults plus
"Go back" + "Go home" buttons.

```tsx
// app/not-found.tsx (Next.js app router)
import { NotFound } from "@openconsole/atoms";

export default function NotFoundPage() {
  return <NotFound />;
}
```

```tsx
// app/error.tsx
"use client";
import { ServerError } from "@openconsole/atoms";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <ServerError
      description="An unexpected error occurred. Try refreshing the page."
      actions={<Button onClick={reset}>Try again</Button>}
    />
  );
}
```

Every default — `status` / `title` / `description` / `icon` / `actions`
/ `className` — is overridable through props (typed as `ErrorPageProps`).
Pass `className` to embed inside a smaller container (the default
wrapper uses `min-h-svh`).

---

## Provider hooks

### `useFont()` — font switching

```tsx
import { useFont } from "@openconsole/atoms";
import { ToggleGroup, ToggleGroupItem } from "@openconsole/shadcn";

function FontToggle() {
  const { font, setFont, options } = useFont();
  return (
    <ToggleGroup
      type="single"
      value={font}
      onValueChange={(v) => v && setFont(v)}
    >
      {options.map((opt) => (
        <ToggleGroupItem key={opt} value={opt}>{opt}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
```

`FontProvider` defaults to `["inter", "manrope", "system"]` and applies
the active option by setting `font-${value}` on `<html>`. Pass
`<FontProvider options={...}>` to customize the list.

### `useLayout()` — layout variant

```tsx
import { useLayout } from "@openconsole/atoms";

const { config, updateConfig } = useLayout();
// config = { variant, collapsible, side }
// variant: "sidebar" | "floating" | "inset"
// collapsible: "offcanvas" | "icon" | "none"
// side: "left" | "right"

updateConfig({ variant: "floating" });
```

`Sidebar` automatically reads this config, so business code usually
doesn't need to call this hook directly — you only reach for it when
building your own settings panel.

---

## Theming

See [theming.md](./theming.md) for the full picture. Short version:

- Setup: `@import "@openconsole/shadcn/styles.css"` +
  `@import "@openconsole/atoms/styles.css"` in your app's global CSS.
  shadcn provides the tokens; atoms provides the font rules.
- Semantic tokens (colors, radius) are owned by shadcn — to override a
  token, redeclare its `:root` / `.dark` variable after the `@import`s.
- Theme presets: use the `Preferences` component (Theme tab) or paste a
  CSS theme into its Importer tab.
- Custom switch animations: `ThemeSwitch` already integrates view-transition
  circular reveal. To write your own animated toggle, mirror its
  implementation (`document.startViewTransition` + setting
  `--vt-origin-x/y` CSS variables).

---

## Boundary with shadcn

| Task | atoms | shadcn |
|---|---|---|
| Theme toggle button | ✓ `ThemeSwitch` | (don't hand-assemble) |
| Settings drawer | ✓ `Preferences` | (don't hand-assemble tabs + sheet) |
| Branded sidebar | ✓ `Sidebar` | (don't hand-assemble `Sidebar` root + sub-primitives) |
| Sticky dashboard header | ✓ `Header` | (don't hand-assemble) |
| Path-derived breadcrumbs | ✓ `Breadcrumbs` / `useBreadcrumbs` | Use `Breadcrumb` primitives directly for non-path-based crumbs |
| Color-bound input field | ✓ `ColorPicker` | — |
| Theme / font / layout providers | ✓ atoms providers | shadcn's `SidebarProvider` still required |
| Buttons, Cards, Dialogs, Tabs, Forms, Alerts, Tables, etc. | — | ✓ |
| Multi-select dropdowns, date ranges, command palettes, anything atoms doesn't cover | — | ✓ Compose primitives |

---

## Common pitfalls

- **Missing provider**: `useLayout()` / `useFont()` throw outside their
  respective providers. `Preferences` requires **all three atoms providers**
  in the tree above.
- **Forgot shadcn's `SidebarProvider`**: atoms' `Sidebar` **does not**
  include `SidebarProvider`. That primitive must be mounted at the app
  root (or above the route subtree that renders the sidebar).
- **`Sidebar` name clash**: shadcn also exports a `Sidebar` primitive.
  When importing both in the same file, alias one:

  ```tsx
  import { Sidebar } from "@openconsole/atoms";              // business uses atoms'
  import { SidebarProvider, SidebarInset } from "@openconsole/shadcn"; // sub-primitives don't clash
  ```

- **Icons passed as strings, not JSX**: `Sidebar`'s `brand.logo` and
  `menu.items[].icon` take string names (`"LayoutDashboard"`), not
  imported icon components.
- **`MenuItem.children` only one level deep**: never pass three or more
  levels of nesting.
- **`LayoutProvider` doesn't persist**: refreshing resets the sidebar
  variant. Wrap it yourself if you want cookie / localStorage persistence
  (see [theming.md](./theming.md#layout-variant-switching)).
- **`ThemeProvider` already wraps next-themes**: don't nest a separate
  `next-themes` `ThemeProvider`. Use atoms' version.
- **Don't render `Header` and a custom top bar at the same time**: pick
  one. To extend `Header`, use the `actions` slot rather than wrapping it.

---

## Detailed references

- [provider-setup.md](./provider-setup.md) — provider order, why each layer
  matters, relationship with `SidebarProvider`, persistence patterns.
- [theming.md](./theming.md) — `next-themes` integration, view-transition
  customization, font extension, layout persistence.
