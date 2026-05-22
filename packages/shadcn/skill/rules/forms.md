# Forms & inputs

## Contents

- Forms use `FieldGroup` + `Field`
- `InputGroup` requires `InputGroupInput` / `InputGroupTextarea`
- Buttons inside inputs: `InputGroup` + `InputGroupAddon`
- 2–7 options: `ToggleGroup`
- `FieldSet` + `FieldLegend` to group related fields
- Validation and disabled states
- react-hook-form integration

---

## Forms use `FieldGroup` + `Field`

Always use `FieldGroup` + `Field` — **never** `<div className="space-y-*">`:

```tsx
import {
  FieldGroup, Field, FieldLabel, Input,
} from "@openconsole/shadcn";

<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">Email</FieldLabel>
    <Input id="email" type="email" />
  </Field>
  <Field>
    <FieldLabel htmlFor="password">Password</FieldLabel>
    <Input id="password" type="password" />
  </Field>
</FieldGroup>
```

For settings pages, use `Field orientation="horizontal"`. To hide a label
visually, use `FieldLabel className="sr-only"`.

**How to pick a form control:**

| Use case | Use what |
|---|---|
| Plain text input | `Input` |
| Dropdown with predefined options | `Select` |
| Searchable dropdown | `Popover` + `Command` (`CommandInput` + `CommandList` + `CommandGroup` + `CommandItem`) |
| Native HTML select (no JS) | `NativeSelect` |
| Boolean toggle | `Switch` (settings) or `Checkbox` (forms) |
| Single choice among a few options | `RadioGroup` |
| Switch between 2–5 options | `ToggleGroup` + `ToggleGroupItem` |
| OTP / verification code | `InputOTP` |
| Multi-line text | `Textarea` |

---

## `InputGroup` requires `InputGroupInput` / `InputGroupTextarea`

**Never** put a raw `Input` or `Textarea` inside `InputGroup`.

**Incorrect:**

```tsx
<InputGroup>
  <Input placeholder="Search..." />
</InputGroup>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput } from "@openconsole/shadcn";

<InputGroup>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

## Buttons inside inputs: `InputGroup` + `InputGroupAddon`

**Never** use `position: relative` + `position: absolute` to overlay a button
onto an `Input`.

**Incorrect:**

```tsx
<div className="relative">
  <Input placeholder="Search..." className="pr-10" />
  <Button className="absolute right-0 top-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

**Correct:**

```tsx
import {
  InputGroup, InputGroupInput, InputGroupAddon, Button,
} from "@openconsole/shadcn";

<InputGroup>
  <InputGroupInput placeholder="Search..." />
  <InputGroupAddon>
    <Button size="icon">
      <SearchIcon data-icon="inline-start" />
    </Button>
  </InputGroupAddon>
</InputGroup>
```

---

## 2–7 options: `ToggleGroup`

Don't loop over `Button`s and manage active state by hand.

**Incorrect:**

```tsx
const [selected, setSelected] = useState("daily")

<div className="flex gap-2">
  {["daily", "weekly", "monthly"].map((option) => (
    <Button
      key={option}
      variant={selected === option ? "default" : "outline"}
      onClick={() => setSelected(option)}
    >
      {option}
    </Button>
  ))}
</div>
```

**Correct:**

```tsx
import { ToggleGroup, ToggleGroupItem } from "@openconsole/shadcn";

<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
  <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
</ToggleGroup>
```

> This package uses the **radix** style, so it's `type="single"` /
> `type="multiple"` and `defaultValue` is a string. If you copied base-style
> `<ToggleGroup multiple defaultValue={["daily"]}>` from ui.shadcn.com, you
> need to rewrite — see
> [base-vs-radix.md — ToggleGroup](./base-vs-radix.md#togglegroup).

Toggle group with a label:

```tsx
<Field orientation="horizontal">
  <FieldTitle id="theme-label">Theme</FieldTitle>
  <ToggleGroup type="single" aria-labelledby="theme-label" spacing={2}>
    <ToggleGroupItem value="light">Light</ToggleGroupItem>
    <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
    <ToggleGroupItem value="system">System</ToggleGroupItem>
  </ToggleGroup>
</Field>
```

---

## `FieldSet` + `FieldLegend` to group related fields

For related checkbox / radio / switch groups, use `FieldSet` + `FieldLegend`
— not a `div` with a heading:

```tsx
<FieldSet>
  <FieldLegend variant="label">Preferences</FieldLegend>
  <FieldDescription>Select all that apply.</FieldDescription>
  <FieldGroup className="gap-3">
    <Field orientation="horizontal">
      <Checkbox id="dark" />
      <FieldLabel htmlFor="dark" className="font-normal">Dark mode</FieldLabel>
    </Field>
  </FieldGroup>
</FieldSet>
```

---

## Validation and disabled states

Mark both sides. `data-invalid` / `data-disabled` styles the `Field`
surroundings (label, description); `aria-invalid` / `disabled` styles the
control itself.

```tsx
// Invalid
<Field data-invalid>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" aria-invalid />
  <FieldDescription>Invalid email address.</FieldDescription>
</Field>

// Disabled
<Field data-disabled>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" disabled />
</Field>
```

Applies to all controls: `Input`, `Textarea`, `Select`, `Checkbox`,
`RadioGroupItem`, `Switch`, `Slider`, `NativeSelect`, `InputOTP`.

---

## react-hook-form integration

This package provides a thin wrapper that wires react-hook-form into the
`Field` system:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Form, FormField, FormItem, FormLabel, FormControl,
  FormDescription, FormMessage,
  Input, Button,
} from "@openconsole/shadcn";

const schema = z.object({
  email: z.string().email(),
});

export function EmailForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => console.log(v))}>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>We'll never share your email.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  );
}
```

To read form state inside a custom control, use `useFormField()`:

```tsx
const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
```

> `useFormField()` must be used inside `<FormItem>` — otherwise it throws.
