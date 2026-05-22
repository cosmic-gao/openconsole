# 表单 & 输入

> 来源对比: <https://github.com/shadcn-ui/ui/blob/main/skills/shadcn/rules/forms.md>

## 目录

- 表单用 `FieldGroup` + `Field`
- `InputGroup` 要求 `InputGroupInput` / `InputGroupTextarea`
- 输入框里的按钮用 `InputGroup` + `InputGroupAddon`
- 2–7 个选项用 `ToggleGroup`
- `FieldSet` + `FieldLegend` 给相关字段分组
- 校验和禁用状态
- react-hook-form 整合

---

## 表单用 `FieldGroup` + `Field`

总是用 `FieldGroup` + `Field` —— **从不**用 `<div className="space-y-*">`:

```tsx
import {
  FieldGroup, Field, FieldLabel, Input,
} from "@opendesign/shadcn";

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

设置页用 `Field orientation="horizontal"`。视觉上隐藏 label 用
`FieldLabel className="sr-only"`。

**怎么选表单控件:**

| 场景 | 用什么 |
|---|---|
| 简单文本输入 | `Input` |
| 预定义选项下拉 | `Select` |
| 可搜索下拉 | atoms 的 `Combobox` |
| 原生 HTML select（无 JS） | `NativeSelect` |
| 布尔切换 | `Switch`（设置）或 `Checkbox`（表单） |
| 几个选项里单选 | `RadioGroup` |
| 2–5 个选项切换 | `ToggleGroup` + `ToggleGroupItem` |
| OTP / 验证码 | `InputOTP` |
| 多行文本 | `Textarea` |

---

## `InputGroup` 要求 `InputGroupInput` / `InputGroupTextarea`

**永远不要**在 `InputGroup` 里塞裸 `Input` 或 `Textarea`。

**Incorrect:**

```tsx
<InputGroup>
  <Input placeholder="Search..." />
</InputGroup>
```

**Correct:**

```tsx
import { InputGroup, InputGroupInput } from "@opendesign/shadcn";

<InputGroup>
  <InputGroupInput placeholder="Search..." />
</InputGroup>
```

---

## 输入框里的按钮用 `InputGroup` + `InputGroupAddon`

**永远不要**用 `position: relative` + `position: absolute` 把按钮
塞到 `Input` 上。

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
} from "@opendesign/shadcn";

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

## 2–7 个选项用 `ToggleGroup`

不要循环 `Button` 然后自己管 active 状态。

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
import { ToggleGroup, ToggleGroupItem } from "@opendesign/shadcn";

<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
  <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
</ToggleGroup>
```

> 本包用 **radix** 风格，所以是 `type="single"` / `type="multiple"`，
> `defaultValue` 是字符串。如果你从 ui.shadcn.com 复制了 base 风格的
> `<ToggleGroup multiple defaultValue={["daily"]}>`，需要改写 ——
> 见 [base-vs-radix.md —— ToggleGroup](./base-vs-radix.md#togglegroup)。

带 label 的 toggle group:

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

## `FieldSet` + `FieldLegend` 给相关字段分组

相关的 checkbox / radio / switch 用 `FieldSet` + `FieldLegend` —— 不是
`div` 加标题:

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

## 校验和禁用状态

两套属性都要标。`data-invalid` / `data-disabled` 控制 `Field` 周围
（label、description）的样式；`aria-invalid` / `disabled` 控制 control
本身的样式。

```tsx
// 无效
<Field data-invalid>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" aria-invalid />
  <FieldDescription>Invalid email address.</FieldDescription>
</Field>

// 禁用
<Field data-disabled>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input id="email" disabled />
</Field>
```

适用于所有 control: `Input`、`Textarea`、`Select`、`Checkbox`、
`RadioGroupItem`、`Switch`、`Slider`、`NativeSelect`、`InputOTP`。

---

## react-hook-form 整合

本包提供了一套薄包装把 react-hook-form 跟 `Field` 体系串起来:

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import {
  Form, FormField, FormItem, FormLabel, FormControl,
  FormDescription, FormMessage,
  Input, Button,
} from "@opendesign/shadcn";

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

要在自定义控件里读 form 状态用 `useFormField()`:

```tsx
const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
```

> `useFormField()` 必须用在 `<FormItem>` 内部 —— 否则抛错。
