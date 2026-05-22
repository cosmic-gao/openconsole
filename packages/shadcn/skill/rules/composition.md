# Component composition

## Contents

- Items always live inside their Group
- Use `Alert` for alerts
- Use `Empty` for empty states
- Use sonner for toasts
- Picking between overlays
- `Dialog` / `Sheet` / `Drawer` must have a Title
- `Card` uses the full composition
- `Button` has no `isPending` / `isLoading` prop
- `TabsTrigger` must be inside `TabsList`
- `Avatar` must have `AvatarFallback`
- Use components, not raw tags

---

## Items always live inside their Group

**Never** render Items directly inside a content container.

**Incorrect:**

```tsx
<SelectContent>
  <SelectItem value="apple">Apple</SelectItem>
  <SelectItem value="banana">Banana</SelectItem>
</SelectContent>
```

**Correct:**

```tsx
<SelectContent>
  <SelectGroup>
    <SelectItem value="apple">Apple</SelectItem>
    <SelectItem value="banana">Banana</SelectItem>
  </SelectGroup>
</SelectContent>
```

Applies to every group-based component:

| Item | Group |
|---|---|
| `SelectItem`, `SelectLabel` | `SelectGroup` |
| `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSub` | `DropdownMenuGroup` |
| `MenubarItem` | `MenubarGroup` |
| `ContextMenuItem` | `ContextMenuGroup` |
| `CommandItem` | `CommandGroup` |

---

## Use `Alert` for alerts

```tsx
import { Alert, AlertTitle, AlertDescription } from "@openconsole/shadcn";

<Alert>
  <AlertTitle>Warning</AlertTitle>
  <AlertDescription>Something needs attention.</AlertDescription>
</Alert>
```

---

## Use `Empty` for empty states

```tsx
import {
  Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent,
  Button,
} from "@openconsole/shadcn";

<Empty>
  <EmptyHeader>
    <EmptyMedia variant="icon"><FolderIcon /></EmptyMedia>
    <EmptyTitle>No projects yet</EmptyTitle>
    <EmptyDescription>Get started by creating a new project.</EmptyDescription>
  </EmptyHeader>
  <EmptyContent>
    <Button>Create Project</Button>
  </EmptyContent>
</Empty>
```

---

## Use sonner for toasts

Import `toast()` directly from sonner — it's not in this package:

```tsx
import { toast } from "sonner";

toast.success("Changes saved.");
toast.error("Something went wrong.");
toast("File deleted.", {
  action: { label: "Undo", onClick: () => undoDelete() },
});
```

Mount this package's `<Toaster />` once at the app root:

```tsx
import { Toaster } from "@openconsole/shadcn";

// app/layout.tsx
<body>
  {children}
  <Toaster />
</body>
```

`Toaster` comes with the five status icons (success / info / warning / error
/ loading) and theme-aware colors by default — no need to pass `theme` or
`icons`.

---

## Picking between overlays

| Use case | Use what |
|---|---|
| Focused task that needs input | `Dialog` |
| Confirmation for a destructive action | `AlertDialog` |
| Side panel with details or filters | `Sheet` |
| Mobile-first bottom panel | `Drawer` |
| Quick info on hover | `HoverCard` |
| Click-triggered small contextual content | `Popover` |

---

## `Dialog` / `Sheet` / `Drawer` must have a Title

`DialogTitle`, `SheetTitle`, `DrawerTitle` are required for screen readers.
To hide visually, use `className="sr-only"`.

```tsx
<DialogContent>
  <DialogHeader>
    <DialogTitle>Edit Profile</DialogTitle>
    <DialogDescription>Update your profile.</DialogDescription>
  </DialogHeader>
  ...
</DialogContent>
```

Even when you don't want a visible header:

```tsx
<DialogContent>
  <DialogTitle className="sr-only">Settings</DialogTitle>
  {/* … */}
</DialogContent>
```

---

## `Card` uses the full composition

**Never** stuff everything into `CardContent`:

```tsx
<Card>
  <CardHeader>
    <CardTitle>Team Members</CardTitle>
    <CardDescription>Manage your team.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>
    <Button>Invite</Button>
  </CardFooter>
</Card>
```

---

## `Button` has no `isPending` / `isLoading` prop

Compose with `Spinner` + `data-icon` + `disabled`:

```tsx
import { Button, Spinner } from "@openconsole/shadcn";

<Button disabled>
  <Spinner data-icon="inline-start" />
  Saving...
</Button>
```

With a mutation hook:

```tsx
<Button disabled={mutation.isPending}>
  {mutation.isPending && <Spinner data-icon="inline-start" />}
  Save
</Button>
```

---

## `TabsTrigger` must be inside `TabsList`

**Never** render `TabsTrigger` directly inside `Tabs` — always wrap it in
`TabsList`:

```tsx
<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account">Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">...</TabsContent>
</Tabs>
```

---

## `Avatar` must have `AvatarFallback`

A fallback when the image fails to load — it's required:

```tsx
<Avatar>
  <AvatarImage src="/avatar.png" alt="User" />
  <AvatarFallback>JD</AvatarFallback>
</Avatar>
```

---

## Use components, not raw tags

| Don't | Use |
|---|---|
| `<hr>` or `<div className="border-t">` | `<Separator />` |
| Styled `<div className="animate-pulse">` | `<Skeleton className="h-4 w-3/4" />` |
| `<span className="rounded-full bg-green-100 …">` | `<Badge variant="secondary">` |
| Hand-rolled CSS spinner | `<Spinner />` |
| Hand-styled `<kbd>` | `<Kbd>` |
