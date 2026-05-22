# This package's API quick reference

A few prop shapes on this package's exported components are easy to get
wrong. This file is the quick-reference checklist. Follow the patterns below
and you're fine.

## Contents

- Custom triggers: `asChild`
- `Select`
- `ToggleGroup`
- `Slider`
- `Accordion`

---

## Custom triggers: `asChild`

To render the trigger / close as a custom element or another component (most
commonly `Button`), use `asChild` to replace the default element. **Don't**
wrap the trigger in an extra element.

**Incorrect:**

```tsx
<DialogTrigger>
  <div>
    <Button>Open</Button>
  </div>
</DialogTrigger>
```

**Correct:**

```tsx
<DialogTrigger asChild>
  <Button>Open</Button>
</DialogTrigger>
```

To render the trigger as a non-button element like `<a>`, use `asChild` the
same way:

```tsx
<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```

Applies to every trigger / close component: `DialogTrigger`, `SheetTrigger`,
`AlertDialogTrigger`, `DropdownMenuTrigger`, `PopoverTrigger`,
`TooltipTrigger`, `CollapsibleTrigger`, `DialogClose`, `SheetClose`,
`NavigationMenuLink`, `BreadcrumbLink`, `SidebarMenuButton`.

---

## `Select`

inline `<SelectItem>` — **don't** pass items via an `items` array.

```tsx
<Select>
  <SelectTrigger>
    <SelectValue placeholder="Select a fruit" />
  </SelectTrigger>
  <SelectContent>
    <SelectGroup>
      <SelectItem value="apple">Apple</SelectItem>
      <SelectItem value="banana">Banana</SelectItem>
    </SelectGroup>
  </SelectContent>
</Select>
```

Notes:
- **Placeholder**: lives on `<SelectValue placeholder="…" />`.
- **Positioning**: `<SelectContent position="popper">`.
- **Value type**: must be a string.

> Need multi-select or object values: this package's `Select` doesn't
> support it. Compose with `Command` + `Popover` + `Checkbox` in app code.

---

## `ToggleGroup`

Must explicitly set `type="single"` or `type="multiple"`:

```tsx
// single, defaultValue is a string
<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
</ToggleGroup>

// multiple, defaultValue is a string array
<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
  <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
</ToggleGroup>
```

Controlled single:

```tsx
const [value, setValue] = React.useState("normal");
<ToggleGroup type="single" value={value} onValueChange={setValue}>
  …
</ToggleGroup>
```

---

## `Slider`

`defaultValue` / `value` is **always an array**:

```tsx
// single slider
<Slider defaultValue={[50]} max={100} step={1} />

// range
<Slider defaultValue={[20, 80]} max={100} step={1} />
```

Controlled:

```tsx
const [value, setValue] = React.useState([0.3, 0.7]);
<Slider value={value} onValueChange={setValue} />
```

---

## `Accordion`

Must explicitly set `type="single"` or `type="multiple"`. Single supports
`collapsible`; `defaultValue` is a string:

```tsx
// single, collapsible
<Accordion type="single" collapsible defaultValue="item-1">
  <AccordionItem value="item-1">…</AccordionItem>
</Accordion>

// multiple, defaultValue is a string array
<Accordion type="multiple" defaultValue={["item-1", "item-2"]}>
  <AccordionItem value="item-1">…</AccordionItem>
  <AccordionItem value="item-2">…</AccordionItem>
</Accordion>
```

---

## Wrong-shape quick reference

These prop shapes **are not this package's API** — they don't work. Use the
right column instead:

| Wrong shape | Right shape |
|---|---|
| `<XTrigger render={<Button />} />` | `<XTrigger asChild><Button /></XTrigger>` |
| `nativeButton={false}` | Not needed; `asChild` handles it |
| `<Select items={[…]}>` + `<SelectValue>{(v) => …}</SelectValue>` | inline `<SelectItem>`, placeholder on `<SelectValue>` |
| `<SelectContent alignItemWithTrigger={false}>` | `<SelectContent position="popper">` |
| `itemToStringValue` | Not supported — compose with `Command` + `Popover` + `Checkbox` |
| `<ToggleGroup multiple>` | `<ToggleGroup type="multiple">` |
| Single `<ToggleGroup defaultValue={["x"]}>` | `<ToggleGroup type="single" defaultValue="x">` |
| `<Slider defaultValue={50} />` | `<Slider defaultValue={[50]} />` |
| `<Accordion>` without `type` | Add `type="single"` or `type="multiple"` |
| Single `<Accordion defaultValue={["x"]}>` | `<Accordion type="single" defaultValue="x">` |
