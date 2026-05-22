# Theming & customization

Components reference semantic CSS variables. Change the variables, and you
change every component.

## Contents

- Setup (one @import covers it)
- How it works (CSS variables → Tailwind utilities → components)
- Color variables and OKLCH format
- Dark mode setup
- Switching themes (override default tokens or paste CSS)
- Adding custom colors (Tailwind v4)
- Border radius `--radius`
- View-transition variables (circular reveal theme switch)
- Customization boundary (only from the outside)

---

## Setup

In the app's global CSS (usually `app/globals.css`), `@import` this package's
styles.css:

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";  /* when using atoms */
```

`@openconsole/shadcn/styles.css` ships with:

- `@source` directives registering its own sources (Tailwind picks up every utility used by every component automatically)
- Full `:root` / `.dark` default values for theme tokens
- `@theme inline` mapping (turns tokens into utilities like `bg-primary` / `text-muted-foreground`)
- `@custom-variant dark`
- `tw-animate-css` animation utilities
- Base-layer resets

**Consumers don't need to redeclare tokens or hand-write `@source`.** To
override tokens, redeclare the same variable names after the `@import` (see
[Switching themes](#switching-themes) below).

---

## How it works

1. CSS variables are defined in `:root` (light) and `.dark` (dark) — the
   defaults live in `@openconsole/shadcn/styles.css`.
2. Tailwind v4 maps them into utilities: `bg-primary`, `text-muted-foreground`, etc.
3. Components use these utilities — **change one variable and every component
   referencing it follows**.

---

## Color variables

Every color follows the `name` / `name-foreground` convention. The base
variable is for backgrounds; `-foreground` is for text / icons on top of that
background.

| Variable | Purpose |
|---|---|
| `--background` / `--foreground` | Page background and default text |
| `--card` / `--card-foreground` | Card surface |
| `--primary` / `--primary-foreground` | Primary buttons and primary actions |
| `--secondary` / `--secondary-foreground` | Secondary actions |
| `--muted` / `--muted-foreground` | Muted / disabled states |
| `--accent` / `--accent-foreground` | Hover and accents |
| `--destructive` / `--destructive-foreground` | Errors and destructive actions |
| `--border` | Default border |
| `--input` | Form input border |
| `--ring` | Focus ring |
| `--chart-1` through `--chart-5` | Charts / visualizations |
| `--sidebar-*` | Sidebar-specific colors |
| `--surface` / `--surface-foreground` | Secondary surface |

Colors use **OKLCH**: `--primary: oklch(0.205 0 0)`. The three values are
lightness (0–1), chroma (0 means gray), and hue (0–360).

---

## Dark mode

Toggled via a `.dark` class on the root element. Wrap the root with
`next-themes`'s `ThemeProvider`:

```tsx
"use client";
import { ThemeProvider } from "next-themes";

// app/layout.tsx or similar root layout
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {children}
</ThemeProvider>
```

Write your own toggle button using `useTheme()`:

```tsx
"use client";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@openconsole/shadcn";

export function ThemeToggle() {
  // Use resolvedTheme so System mode still flips correctly.
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
```

---

## Switching themes

### Override default tokens

In the app's global CSS, **after** `@import "@openconsole/shadcn/styles.css"`,
redeclare the same variable names. Only list the ones you want to change; the
rest stay at shadcn defaults:

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";

:root {
  --primary: oklch(0.6 0.18 250);    /* override default black with blue */
  --radius: 0.5rem;                   /* override default radius */
}
.dark {
  --primary: oklch(0.7 0.18 250);
}
```

### Paste a CSS theme

`:root { … } .dark { … }` blocks copied from <https://ui.shadcn.com/themes>
or <https://tweakcn.com> work the same way — paste them after the `@import`.
Later CSS rules win, so the default tokens get replaced wholesale.

---

## Adding custom colors

Add to the app's global CSS (after the `@import`; no new CSS file needed).

```css
/* 1. Define in your global CSS file. */
:root {
  --warning: oklch(0.84 0.16 84);
  --warning-foreground: oklch(0.28 0.07 46);
}
.dark {
  --warning: oklch(0.41 0.11 46);
  --warning-foreground: oklch(0.99 0.02 95);
}

/* 2. Register as utilities via Tailwind v4's @theme inline. */
@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

```tsx
// 3. Use it in components.
<div className="bg-warning text-warning-foreground">Warning</div>
```

---

## Border radius

`--radius` controls border-radius globally. Components derive from it:

| Utility | Equivalent |
|---|---|
| `rounded-lg` | `var(--radius)` |
| `rounded-md` | `calc(var(--radius) - 2px)` |
| `rounded-sm` | `calc(var(--radius) - 4px)` |

To adjust radius at runtime: `document.documentElement.style.setProperty("--radius", "0.75rem")`.

---

## View-transition variables (circular reveal theme switch)

To get a circular reveal animation from the click position when switching
themes, use the View Transitions API + CSS variables. Add to your global CSS:

```css
@supports (view-transition-name: root) {
  ::view-transition-new(root) {
    clip-path: circle(0% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%));
    animation: vt-circle-in 350ms ease-out forwards;
  }
  @keyframes vt-circle-in {
    to { clip-path: circle(150% at var(--vt-origin-x, 50%) var(--vt-origin-y, 50%)); }
  }
}
```

In the toggle button, set the origin variables on click and start the transition:

```tsx
"use client";
import { useTheme } from "next-themes";
import { Button } from "@openconsole/shadcn";

type TransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { finished: Promise<void> };
};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const onToggle = (e: React.MouseEvent) => {
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

  return <Button variant="outline" size="icon" onClick={onToggle}>…</Button>;
}
```

> Use `--vt-origin-x` / `--vt-origin-y` rather than `--x` / `--y` — overly
> generic names clash with other libraries' scratch variables.

---

## Customization boundary

`@openconsole/shadcn` is a read-only consumption package — you **cannot**
modify component source to add variants, fork files, or patch. What you can
do, from the outside:

### 1. Built-in variants (preferred)

```tsx
<Button variant="outline" size="sm">Click</Button>
```

`Button` variants: `default` / `secondary` / `outline` / `ghost` /
`destructive` / `link`. `Badge` variants: `default` / `secondary` /
`destructive` / `outline`. For other primitives, hover for IDE hints.

### 2. `className` with Tailwind utilities (layout only)

```tsx
<Card className="mx-auto max-w-md">…</Card>
```

**Don't** use `className` to override colors or typography — change theme
variables instead.

### 3. CSS variables (colors / radius / fonts)

See [Adding custom colors](#adding-custom-colors) and
[Border radius](#border-radius) above.

### 4. Wrapper components (app-layer abstractions)

For composite shapes like `ConfirmDialog`, `PageHeader`, `Toolbar`, compose
them in your own application code:

```tsx
// In your application code
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent,
  AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@openconsole/shadcn";

export function ConfirmDialog({ title, description, onConfirm, children }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```
