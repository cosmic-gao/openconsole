# Styling & customization

For theming / CSS variables / custom colors, see
[customization.md](../customization.md). This file is all Incorrect / Correct
pairs to make violations easy to spot and fix.

## Contents

- Semantic colors
- No raw values for status colors
- Built-in variants first
- `className` is for layout only
- No `space-x-*` / `space-y-*`
- Equal width/height: `size-*`
- `truncate` shorthand
- Don't hand-write `dark:` color overrides
- `cn()` for conditional classes
- No hand-written z-index on overlays

---

## Semantic colors

**Incorrect:**

```tsx
<div className="bg-blue-500 text-white">
  <p className="text-gray-600">Secondary text</p>
</div>
```

**Correct:**

```tsx
<div className="bg-primary text-primary-foreground">
  <p className="text-muted-foreground">Secondary text</p>
</div>
```

---

## No raw values for status colors

Positive, negative, and status indicators should use a `Badge` variant, a
semantic token (`text-destructive`, etc.), or a custom CSS variable —
**never** raw Tailwind palette values.

**Incorrect:**

```tsx
<span className="text-emerald-600">+20.1%</span>
<span className="text-green-500">Active</span>
<span className="text-red-600">-3.2%</span>
```

**Correct:**

```tsx
<Badge variant="secondary">+20.1%</Badge>
<Badge>Active</Badge>
<span className="text-destructive">-3.2%</span>
```

Need a success / positive color but no matching semantic token exists? Use a
`Badge` variant, or add a `--success` variable as described in
[customization.md — Adding custom colors](../customization.md#adding-custom-colors).

---

## Built-in variants first

**Incorrect:**

```tsx
<Button className="border border-input bg-transparent hover:bg-accent">
  Click me
</Button>
```

**Correct:**

```tsx
<Button variant="outline">Click me</Button>
```

`Button` variants: `default` / `secondary` / `outline` / `ghost` /
`destructive` / `link`. `Badge` variants: `default` / `secondary` /
`destructive` / `outline`. Check source for other primitives.

---

## `className` is for layout only

`className` is for layout utilities (`max-w-md`, `mx-auto`, `mt-4`) —
**don't** use it to override component colors or typography. For colors, use
semantic tokens, built-in variants, or CSS variables.

**Incorrect:**

```tsx
<Card className="bg-blue-100 text-blue-900 font-bold">
  <CardContent>Dashboard</CardContent>
</Card>
```

**Correct:**

```tsx
<Card className="max-w-md mx-auto">
  <CardContent>Dashboard</CardContent>
</Card>
```

Customization order:
1. **Built-in variants** — `variant="outline"`, `variant="destructive"`…
2. **Semantic tokens** — `bg-primary`, `text-muted-foreground`.
3. **CSS variables** — add to global CSS (see
   [customization.md](../customization.md)).

---

## No `space-x-*` / `space-y-*`

Use `gap-*` instead. `space-y-4` → `flex flex-col gap-4`. `space-x-2` → `flex gap-2`.

```tsx
<div className="flex flex-col gap-4">
  <Input />
  <Input />
  <Button>Submit</Button>
</div>
```

---

## Equal width/height: `size-*`

`size-10`, not `w-10 h-10`. Applies to icons, avatars, skeletons, buttons,
etc.

---

## `truncate` shorthand

`truncate`, not `overflow-hidden text-ellipsis whitespace-nowrap`.

---

## Don't hand-write `dark:` color overrides

Semantic tokens handle light / dark automatically via CSS variables —
`bg-background text-foreground`, not `bg-white dark:bg-gray-950`.

---

## `cn()` for conditional classes

Import `cn()` from `@openconsole/shadcn` to compose conditional or merged
classes. **Don't** hand-write template-literal ternaries inside `className`
strings.

**Incorrect:**

```tsx
<div className={`flex items-center ${isActive ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
```

**Correct:**

```tsx
import { cn } from "@openconsole/shadcn";

<div className={cn("flex items-center", isActive ? "bg-primary text-primary-foreground" : "bg-muted")}>
```

> The import path is `@openconsole/shadcn`, not `@/lib/utils`.

---

## No hand-written z-index on overlays

`Dialog`, `Sheet`, `Drawer`, `AlertDialog`, `DropdownMenu`, `Popover`,
`Tooltip`, `HoverCard` **manage their own stacking**. Never add `z-50` or
`z-[999]` — it breaks the stacking order with `Toaster`.
