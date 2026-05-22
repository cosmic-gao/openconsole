---
name: openconsole-shadcn
description: >
  Usage guide for `@openconsole/shadcn`. A complete set of shadcn UI primitives
  (Button, Dialog, Form, Sidebar, Table, Card, Tabs, etc.), plus `cn` /
  `useIsMobile` / `Icon` / `Direction` utilities, and Tailwind v4 semantic
  tokens. Applies to: building pages and forms, picking the right primitive,
  fixing styling issues, composing complex interactions (settings pages, data
  tables, dashboards, command palettes, drawers, confirm dialogs, etc.),
  applying themes and brand colors.
type: ui
library: "@openconsole/shadcn"
runtime:
  react: "^19"
  tailwind: "^4"
peers:
  "lucide-react": "*"
  "next-themes": "*"
  "react-hook-form": "*"
  "zod": "*"
---

# `@openconsole/shadcn` — UI primitive components

An npm package that flat-exports the entire set of shadcn/ui primitives plus
a small set of utilities (`cn`, `useIsMobile`, `Icon`, `Direction`) through a
single entry point: `@openconsole/shadcn`.

This package is **read-only consumption**: the available components are exactly
what `index.ts` exports. No CLI, no source modifications, no extra installs.

This doc covers:

1. How to map a user's natural-language request to the right component
   ([Use-case lookup](#use-case-lookup))
2. Picking the right primitive and the correct composition (Item inside Group,
   Tabs inside TabsList, etc.)
3. Writing styles without breaking the theme (semantic tokens, no raw colors,
   no hand-written `dark:`)
4. Wiring forms with `Form` + `FieldGroup` + `Field`
5. Handling icons (`lucide-react` + `data-icon` slot)
6. The correct prop shapes when calling this package's components
   ([rules/base-vs-radix.md](./rules/base-vs-radix.md))
7. Theming and the boundary of customization
   ([customization.md](./customization.md))

---

## Setup

In the app's global CSS (usually `app/globals.css`), `@import` this package's
styles.css:

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
```

styles.css ships with `@source` directives, the full token set, an
`@theme inline` mapping, `@custom-variant dark`, `tw-animate-css`, and base
layer resets — one `@import` covers it all. No need to redeclare tokens or
write `@source` on the consumer side.

To override tokens, redeclare the same variable names after the `@import`. See
[customization.md — Setup](./customization.md#setup).

---

## Project context

| Field | Value |
|---|---|
| Import path | `@openconsole/shadcn` (single entry) |
| Utilities | `cn`, `useIsMobile`, `Icon`, `Direction`, `Kbd`, `KbdGroup`, `Toaster` |
| Styling | Tailwind v4 + semantic tokens (`--background`, `--primary`, `--muted`…) |
| Icon library | `lucide-react` (also re-exported via `Icon` for dynamic rendering by name) |
| Form stack | `react-hook-form` + `zod` (via `@hookform/resolvers`) |
| API style | Unified: `asChild`, explicit `type="single"`, `Slider` takes arrays, etc. See [rules/base-vs-radix.md](./rules/base-vs-radix.md) |
| Theming | Works with `next-themes` for light/dark; semantic tokens follow automatically |

---

## Use-case lookup

When a user describes a need in natural language, use this table to identify
intent and pick the right component from this package.

| User description (keywords) | Pick this | Key composition |
|---|---|---|
| "Build a login page / signup form / create form" | `Card` + `Form` | Card outer → CardHeader + CardContent → `Form` + `FormField` + `FormItem` + `FormLabel` + `FormControl(Input)` + `FormMessage` |
| "Settings page / preferences / profile" | `Tabs` + `Field` | Tabs to section → each page uses `Field orientation="horizontal"` + `Switch`/`Select`/`Input` |
| "User list / data table / listing" | `Table` | TableHeader / TableRow / TableCell; for sorting/filtering, wire `@tanstack/react-table` in app code |
| "Display-only table" | `Table` | As above |
| "Dashboard / homepage metrics" | `Card` grid + `Chart*` + `Badge` | Card for stat cards → Chart series for viz → Badge for status |
| "User avatar dropdown" | `Avatar` + `DropdownMenu` | DropdownMenuTrigger(asChild) → Avatar + AvatarFallback → DropdownMenuContent → DropdownMenuGroup → DropdownMenuItem |
| "Delete confirmation / second-step confirm" | `AlertDialog` | AlertDialogTrigger + AlertDialogContent + AlertDialogFooter + AlertDialogAction(Button variant="destructive") |
| "Side panel / detail drawer / filter sidebar" | `Sheet` | `<Sheet>` + `<SheetContent side="right">` |
| "Mobile bottom sheet / half-screen" | `Drawer` | Drawer + DrawerContent |
| "App shell / admin chrome" | `SidebarProvider` + `Sidebar` | SidebarProvider wraps root → Sidebar + SidebarMenu + SidebarMenuItem for the sidebar → main area is content |
| "Empty state / no data" | `Empty` | Empty → EmptyHeader → EmptyMedia + EmptyTitle + EmptyDescription → EmptyContent(Button) |
| "Loading skeleton" | `Skeleton` | Grid that matches the real layout |
| "Loading spinner" | `Spinner` | Inside a button with `data-icon` + `disabled` |
| "Command palette / quick switcher / Cmd+K" | `Dialog` + `Command` | Dialog wraps; inside: Command + CommandInput + CommandList + CommandGroup + CommandItem |
| "Dropdown menu (on click)" | `DropdownMenu` | Click trigger |
| "Right-click menu" | `ContextMenu` | Long-press / right-click trigger |
| "App-top menubar" | `Menubar` | macOS-style top menu |
| "Breadcrumbs" | `Breadcrumb` | BreadcrumbList → BreadcrumbItem → BreadcrumbLink |
| "Pagination" | `Pagination` | PaginationContent → PaginationItem → PaginationLink/Previous/Next |
| "Tabs" | `Tabs` | Tabs → TabsList → TabsTrigger → TabsContent |
| "Collapsible section" | `Collapsible` (single) or `Accordion` (multiple groups) | Accordion for FAQ; Collapsible for a single toggle block |
| "Hover tooltip" | `Tooltip` | TooltipTrigger + TooltipContent, optionally with `Kbd` |
| "Hover card / username hover preview" | `HoverCard` | HoverCardTrigger + HoverCardContent |
| "Click-popped small card / color / date" | `Popover` | PopoverTrigger + PopoverContent |
| "Toast / notification / brief feedback" | `toast()` from `sonner` | Mount one `<Toaster />` at the root; call `toast.success(...)` in business code |
| "Progress bar" | `Progress` | Use Progress for known progress; Spinner for unknown |
| "Tag / status badge" | `Badge` | variants: default / secondary / destructive / outline |
| "Searchable dropdown / autocomplete" | `Popover` + `Command` | PopoverTrigger fires → PopoverContent wraps Command + CommandInput + CommandList |
| "Plain dropdown (no search)" | `Select` | inline SelectItem; see [rules/base-vs-radix.md](./rules/base-vs-radix.md) |
| "Date picker" | `Popover` + `Calendar` | PopoverTrigger(Button) → PopoverContent wraps Calendar |
| "Plain calendar view" | `Calendar` | Renders a month grid |
| "Theme toggle button" | `Button` + `next-themes` | See [Complete code examples](#scenario--complete-code-examples) below |
| "Settings drawer (side-pull)" | `Sheet` | Sheet + SheetContent wraps Tabs / Field form |
| "OTP / verification code input" | `InputOTP` | 4–6 segmented digits |
| "Rating slider / volume" | `Slider` | **value must be an array**: `[50]`, not `50` |
| "Resizable panels" | `Resizable` | ResizablePanelGroup + ResizablePanel + ResizableHandle |
| "Long content scroll" | `ScrollArea` | Custom scrollbar styling |
| "Image placeholder (keeps ratio)" | `AspectRatio` | Wraps an image to avoid layout shift |
| "Divider / separator" | `Separator` | Replaces `<hr>` and bordered div |
| "Icon button group" | `ButtonGroup` or `ToggleGroup` | Mutually exclusive: `ToggleGroup type="single"`; parallel actions: `ButtonGroup` |

### Scenario → complete code examples

#### Login form

```tsx
<Card className="mx-auto max-w-sm">
  <CardHeader>
    <CardTitle>Sign in</CardTitle>
    <CardDescription>Sign in with your email and password</CardDescription>
  </CardHeader>
  <CardContent>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl><Input type="password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Spinner data-icon="inline-start" />}
          Sign in
        </Button>
      </form>
    </Form>
  </CardContent>
</Card>
```

#### Delete confirmation

```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete project</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Confirm delete?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. All data under the project will be deleted along with it.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={onConfirm}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### Command palette (Cmd+K)

```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="p-0">
    <DialogTitle className="sr-only">Command palette</DialogTitle>
    <Command>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => router.push("/dashboard")}>
            <LayoutDashboardIcon />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => router.push("/settings")}>
            <SettingsIcon />
            Settings
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  </DialogContent>
</Dialog>
```

#### Dashboard stat cards

```tsx
<div className="grid gap-4 md:grid-cols-3">
  <Card>
    <CardHeader>
      <CardDescription>Total revenue</CardDescription>
      <CardTitle className="text-3xl">$45,231</CardTitle>
    </CardHeader>
    <CardFooter>
      <Badge variant="secondary">+20.1% from last month</Badge>
    </CardFooter>
  </Card>
  <Card>
    <CardHeader>
      <CardDescription>Active users</CardDescription>
      <CardTitle className="text-3xl">2,350</CardTitle>
    </CardHeader>
    <CardFooter>
      <Badge variant="secondary">+18.1% from last month</Badge>
    </CardFooter>
  </Card>
  <Card>
    <CardHeader>
      <CardDescription>Conversion rate</CardDescription>
      <CardTitle className="text-3xl">3.2%</CardTitle>
    </CardHeader>
    <CardFooter>
      <span className="text-destructive text-sm">-2.4% from last month</span>
    </CardFooter>
  </Card>
</div>
```

#### User avatar dropdown

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" className="size-8 rounded-full p-0">
      <Avatar className="size-8">
        <AvatarImage src={user.avatar} alt={user.name} />
        <AvatarFallback>{user.initials}</AvatarFallback>
      </Avatar>
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
    <DropdownMenuSeparator />
    <DropdownMenuGroup>
      <DropdownMenuItem onSelect={() => router.push("/profile")}>
        <UserIcon />
        Profile
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => router.push("/settings")}>
        <SettingsIcon />
        Settings
      </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator />
    <DropdownMenuItem onSelect={signOut}>
      <LogOutIcon />
      Sign out
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

#### Empty state

```tsx
<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Create your first project to get started.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>New project</Button>
  </EmptyContent>
</Empty>
```

#### Settings page (tabbed layout)

```tsx
<Tabs defaultValue="account" className="flex flex-col gap-6">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="notifications">Notifications</TabsTrigger>
    <TabsTrigger value="appearance">Appearance</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <FieldGroup>
      <Field orientation="horizontal">
        <FieldLabel>Name</FieldLabel>
        <Input defaultValue={user.name} />
      </Field>
      <Field orientation="horizontal">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" defaultValue={user.email} />
      </Field>
    </FieldGroup>
  </TabsContent>
  <TabsContent value="notifications">
    <FieldSet>
      <FieldLegend>Email notifications</FieldLegend>
      <FieldGroup>
        <Field orientation="horizontal">
          <Switch id="weekly" />
          <FieldLabel htmlFor="weekly">Weekly digest</FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Switch id="security" />
          <FieldLabel htmlFor="security">Security alerts</FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  </TabsContent>
</Tabs>
```

#### Theme toggle button

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

#### Searchable dropdown

```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" role="combobox" aria-expanded={open} className="w-[200px] justify-between">
      {value ? options.find((o) => o.value === value)?.label : "Select..."}
      <ChevronsUpDownIcon data-icon="inline-end" />
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[200px] p-0">
    <Command>
      <CommandInput placeholder="Search..." />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              onSelect={() => {
                setValue(option.value);
                setOpen(false);
              }}
            >
              <CheckIcon className={cn("mr-2", value === option.value ? "opacity-100" : "opacity-0")} />
              {option.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

#### Date picker

```tsx
<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline" className={cn("justify-start text-left font-normal", !date && "text-muted-foreground")}>
      <CalendarIcon data-icon="inline-start" />
      {date ? format(date, "PPP") : "Pick a date"}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-auto p-0">
    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
  </PopoverContent>
</Popover>
```

---

## Key rules

The rules below are **always enforced**. Fix violations on sight. Each links
to a detail file with Incorrect/Correct code pairs.

### Styling & Tailwind → [rules/styling.md](./rules/styling.md)

- **`className` is for layout only, not styling.** Overriding component colors
  or typography from the outside is wrong.
- **No `space-x-*` / `space-y-*`.** Use `flex … gap-*`.
- **Equal width/height: use `size-*`.** `size-10`, not `w-10 h-10`.
- **`truncate` is the shorthand** — not `overflow-hidden text-ellipsis whitespace-nowrap`.
- **Don't hand-write `dark:` color overrides.** Use semantic tokens.
- **No raw values for status colors.** Use `Badge` variants or `text-destructive`.
- **Conditional className: use `cn()`** (import from `@openconsole/shadcn`).
- **No z-index on overlays** (`Dialog`, `Popover`, `Tooltip`, etc. manage their own stacking).

### Forms → [rules/forms.md](./rules/forms.md)

- **Form layout uses `FieldGroup` + `Field`.** Never `<div className="space-y-*">`.
- **Schema uses `Form` + `FormField` + `FormItem` + `FormControl` + `FormMessage`.**
- **`InputGroup` requires `InputGroupInput` / `InputGroupTextarea`.**
- **Buttons inside inputs: `InputGroup` + `InputGroupAddon`.**
- **2–7 mutually exclusive options: `ToggleGroup`.**
- **Grouped checkbox/radio: `FieldSet` + `FieldLegend`.**
- **Validation states: `data-invalid` on `Field` + `aria-invalid` on the control.**

### Composition → [rules/composition.md](./rules/composition.md)

- **Items always live inside their Group** (`SelectItem` → `SelectGroup`,
  `DropdownMenuItem` → `DropdownMenuGroup`, `CommandItem` → `CommandGroup`,
  `TabsTrigger` → `TabsList`).
- **`Dialog` / `Sheet` / `Drawer` must have a Title** (use `className="sr-only"`
  to hide visually).
- **`Card` uses the full composition**: `CardHeader` / `CardTitle` /
  `CardDescription` / `CardContent` / `CardFooter`.
- **`Avatar` must have an `AvatarFallback`.**
- **`Button` has no `isLoading` prop**: compose with `Spinner` + `data-icon` + `disabled`.
- **Custom triggers use `asChild`.**

### Use components, not raw tags → [rules/composition.md](./rules/composition.md)

- Alerts → `Alert`. Empty states → `Empty`. Toasts → `toast()` from `sonner`.
- `Separator` replaces `<hr>`. `Skeleton` replaces `animate-pulse` divs.
- `Badge` replaces styled spans. `Kbd` for keyboard hints. `Spinner` replaces
  hand-rolled spinners.

### Icons → [rules/icons.md](./rules/icons.md)

- **Icons in buttons: use `data-icon="inline-start"` / `"inline-end"`.**
- **No size classes on icons inside components** (the component handles it).
- **Pass icons as component objects**, not string keys looked up in a map.
- **For dynamic rendering by name, use `Icon`** (this package's `lucide-react` wrapper).

### API shape → [rules/base-vs-radix.md](./rules/base-vs-radix.md)

- Custom triggers use `asChild`.
- `ToggleGroup` / `Accordion` need explicit `type="single"` or `type="multiple"`.
- `Slider`'s `value` is always an array.
- `Select` uses inline `<SelectItem>`; placeholder lives on `<SelectValue>`.

---

## Key patterns

```tsx
// Form layout: FieldGroup + Field (not div + Label)
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" />
  </Field>
</FieldGroup>

// Validation: data-invalid on Field, aria-invalid on the control
<Field data-invalid>
  <FieldLabel>Email</FieldLabel>
  <Input aria-invalid />
  <FieldDescription>Invalid email.</FieldDescription>
</Field>

// Icons inside buttons: data-icon, no size class
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

// Spacing: gap, not space-y / space-x
<div className="flex flex-col gap-4">

// Equal width/height: size-*
<Avatar className="size-10">

// Status colors: Badge variant or semantic token
<Badge variant="secondary">+20.1%</Badge>

// Conditional class: cn()
<div className={cn("flex items-center", isActive && "bg-primary text-primary-foreground")} />

// Invisible-but-a11y Dialog: sr-only title
<Dialog>
  <DialogContent>
    <DialogTitle className="sr-only">Settings</DialogTitle>
  </DialogContent>
</Dialog>

// Loading button: Spinner + data-icon + disabled
<Button disabled={isPending}>
  {isPending && <Spinner data-icon="inline-start" />}
  Save
</Button>
```

---

## Imports

Everything is flat-exported from `@openconsole/shadcn` — **there is only one entry**.

```ts
import {
  // Primitives
  Button, Badge, Avatar, AvatarImage, AvatarFallback,
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
  Dialog, DialogTrigger, DialogContent, DialogTitle,
  Sheet, SheetTrigger, SheetContent, SheetTitle,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Tooltip, TooltipTrigger, TooltipContent,
  Popover, PopoverTrigger, PopoverContent,
  // Forms
  Form, FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage,
  useFormField,
  FieldGroup, Field, FieldLabel, FieldDescription, FieldSet, FieldLegend,
  Input, InputGroup, InputGroupInput, InputGroupAddon,
  Select, SelectTrigger, SelectContent, SelectGroup, SelectItem, SelectValue,
  // Toggles
  Switch, Checkbox, RadioGroup, RadioGroupItem,
  ToggleGroup, ToggleGroupItem,
  // Feedback
  Alert, AlertTitle, AlertDescription,
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
  Skeleton, Spinner, Progress,
  Toaster,            // Mount once at the root, then call toast() from sonner
  // Navigation
  Sidebar, SidebarProvider, SidebarTrigger, SidebarMenu, SidebarMenuItem,
  Breadcrumb, NavigationMenu, Pagination,
  // Overlays
  DropdownMenu, ContextMenu, Menubar, HoverCard,
  Command, CommandInput, CommandList, CommandGroup, CommandItem, CommandEmpty,
  // Date
  Calendar,
  // Utilities
  cn, useIsMobile, Icon, Direction, Kbd, KbdGroup,
} from "@openconsole/shadcn";

import { toast } from "sonner";   // toast() lives in sonner, not in this package
```

If you need a component that this package doesn't export — don't guess import
paths, don't copy source from elsewhere. Compose it in app code from the
existing primitives.

---

## Theming

See [customization.md](./customization.md). Short version:

- Setup: `@import "@openconsole/shadcn/styles.css"` in the app's global CSS —
  default tokens, `@theme inline` mapping, `@source` registration, etc. are
  all included.
- Theme colors are driven by CSS variables — change the variables in `:root`
  / `.dark` and you change every component.
- Colors use OKLCH (`oklch(L C H)`).
- Override default tokens: redeclare the same variable names after the `@import`.
- Add custom colors: same approach — declare `:root` variables and map them
  in `@theme inline` (Tailwind v4).
- Light/dark switching: wrap the root with `next-themes`'s `ThemeProvider`
  and use the `useTheme()` hook in your own toggle button.

---

## Common pitfalls

- **Don't fabricate components this package doesn't have**: imports like
  `import { Calendar2 } from "@openconsole/shadcn"` never work. Check
  [Imports](#imports) or the [Use-case lookup](#use-case-lookup) first.
- **The only entry is `@openconsole/shadcn` root**: subpath imports like
  `@openconsole/shadcn/dialog` or `@openconsole/shadcn/lib/utils` do not
  exist.
- **Wrappers using `useState` / `useEffect` / `onClick` without `"use client"`**:
  each interactive primitive is already marked, but wrappers you write must
  declare it themselves.
- **Adding `z-50` to `DialogContent`**: overlay components stack themselves.
  Hand-written z-index breaks the order with `Tooltip` / `Toaster`.
- **Hand-written `dark:bg-*`**: fights the theme tokens. Use `bg-background`,
  `bg-muted`, `bg-card`, etc.
- **`SelectItem` outside `SelectGroup`**: TS will let it pass, but keyboard
  navigation and screen readers break.
- **`Dialog` without `DialogTitle`**: screen readers report a missing title.
  Hide visually with `<DialogTitle className="sr-only">…</DialogTitle>`.
- **Theme toggle reading `theme` instead of `resolvedTheme`**: in System mode,
  `theme === "system"`, so the naive `theme === "dark" ? "light" : "dark"`
  does nothing on first click. Read `resolvedTheme` to decide where to flip.

---

## Detailed reference

- [rules/styling.md](./rules/styling.md) — semantic colors, variants, `className`, spacing, `size-*`, `truncate`, dark mode, `cn()`, z-index.
- [rules/forms.md](./rules/forms.md) — `FieldGroup`, `Field`, `InputGroup`, `ToggleGroup`, `FieldSet`, validation states, react-hook-form integration.
- [rules/composition.md](./rules/composition.md) — Groups, overlays, `Card`, `Tabs`, `Avatar`, `Alert`, `Empty`, toast, `Separator`, `Skeleton`, `Badge`, button loading state.
- [rules/icons.md](./rules/icons.md) — `data-icon`, icon sizing, passing icons as objects, `Icon` name lookup.
- [rules/base-vs-radix.md](./rules/base-vs-radix.md) — this package's API quick reference (`asChild`, `Select`, `ToggleGroup`, `Slider`, `Accordion`).
- [customization.md](./customization.md) — theming, CSS variables, adding custom colors.
