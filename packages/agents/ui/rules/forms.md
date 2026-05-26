# 表单与输入

## 目录

- 表单使用 FieldGroup + Field
- InputGroup 需使用 InputGroupInput/InputGroupTextarea
- 输入框内的按钮使用 InputGroup + InputGroupAddon
- 选项集（2-7 个）使用 ToggleGroup
- 相关字段分组使用 FieldSet + FieldLegend
- 字段验证和禁用状态

---

## 表单使用 FieldGroup + Field

始终使用 `FieldGroup` + `Field`，不要用原始 `div` + `space-y-*`：

```tsx
<FieldGroup>
  <Field>
    <FieldLabel htmlFor="email">邮箱</FieldLabel>
    <Input id="email" type="email" />
  </Field>
  <Field>
    <FieldLabel htmlFor="password">密码</FieldLabel>
    <Input id="password" type="password" />
  </Field>
</FieldGroup>
```

设置页使用 `Field orientation="horizontal"`。视觉隐藏标签使用 `FieldLabel className="sr-only"`。

**选择表单控件:**

- 简单文本输入 → `Input`
- 预定义选项下拉 → `Select`
- 可搜索下拉 → **`Popover` + `Command` 组合**(shadcn 没有单独的 `Combobox` 组件,见下方"可搜索下拉"段)
- 原生 HTML select(无 JS) → `NativeSelect`
- 布尔切换 → `Switch`(设置页)或 `Checkbox`(表单)
- 少数选项单选 → `RadioGroup`
- 2-5 个选项切换 → `ToggleGroup` + `ToggleGroupItem`
- OTP / 验证码 → `InputOTP`
- 多行文本 → `Textarea`
- 数字调节 → `Input type="number"` 或 `Slider`

---

## InputGroup 需使用 InputGroupInput/InputGroupTextarea

不要在 `InputGroup` 内直接使用原始 `Input` 或 `Textarea`。

**错误：**

```tsx
<InputGroup>
  <Input placeholder="搜索..." />
</InputGroup>
```

**正确：**

```tsx
import { InputGroup, InputGroupInput } from '@openconsole/shadcn'

<InputGroup>
  <InputGroupInput placeholder="搜索..." />
</InputGroup>
```

---

## 输入框内的按钮使用 InputGroup + InputGroupAddon

不要将 `Button` 直接放在输入框内或用自定义定位。

**错误：**

```tsx
<div className="relative">
  <Input placeholder="搜索..." className="pr-10" />
  <Button className="absolute right-0 top-0" size="icon">
    <SearchIcon />
  </Button>
</div>
```

**正确：**

```tsx
import { InputGroup, InputGroupInput, InputGroupAddon } from '@openconsole/shadcn'

<InputGroup>
  <InputGroupInput placeholder="搜索..." />
  <InputGroupAddon>
    <Button size="icon">
      <SearchIcon data-icon="inline-start" />
    </Button>
  </InputGroupAddon>
</InputGroup>
```

---

## 选项集（2-7 个）使用 ToggleGroup

不要手动循环 `Button` 组件实现 active 状态。

**错误：**

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

**正确：**

```tsx
import { ToggleGroup, ToggleGroupItem } from '@openconsole/shadcn'

<ToggleGroup spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
  <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
</ToggleGroup>
```

配合 `Field` 使用有标签的 ToggleGroup：

```tsx
<Field orientation="horizontal">
  <FieldTitle id="theme-label">主题</FieldTitle>
  <ToggleGroup aria-labelledby="theme-label" spacing={2}>
    <ToggleGroupItem value="light">浅色</ToggleGroupItem>
    <ToggleGroupItem value="dark">深色</ToggleGroupItem>
    <ToggleGroupItem value="system">系统</ToggleGroupItem>
  </ToggleGroup>
</Field>
```

---

## 相关字段分组使用 FieldSet + FieldLegend

相关复选框、单选或开关使用 `FieldSet` + `FieldLegend`，不要用带标题的 `div`：

```tsx
<FieldSet>
  <FieldLegend variant="label">偏好设置</FieldLegend>
  <FieldDescription>选择所有适用的选项。</FieldDescription>
  <FieldGroup className="gap-3">
    <Field orientation="horizontal">
      <Checkbox id="dark" />
      <FieldLabel htmlFor="dark" className="font-normal">
        深色模式
      </FieldLabel>
    </Field>
  </FieldGroup>
</FieldSet>
```

---

## 可搜索下拉(Combobox)—— 用 Popover + Command 组合

> shadcn 没有单独的 `Combobox` 组件,标准做法是用 `Popover` 套 `Command`:

```tsx
import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@openconsole/shadcn";
import { Check, ChevronsUpDown } from "lucide-react";

export function Combobox({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {options.find((o) => o.value === value)?.label ?? "请选择…"}
          <ChevronsUpDown data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <Command>
          <CommandInput placeholder="搜索…" />
          <CommandEmpty>无结果</CommandEmpty>
          <CommandGroup>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                onSelect={() => onChange(o.value)}
              >
                <Check data-icon="inline-start" className={value === o.value ? "" : "invisible"} />
                {o.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

要放进 `react-hook-form` 的 `<FormField>`,把上面 `value` / `onChange` 接到 `field` 即可。

---

## 字段验证和禁用状态

两个属性都需要 — `data-invalid`/`data-disabled` 样式化字段（标签、描述），而 `aria-invalid`/`disabled` 样式化控件。

```tsx
// 无效
<Field data-invalid>
  <FieldLabel htmlFor="email">邮箱</FieldLabel>
  <Input id="email" aria-invalid />
  <FieldDescription>无效的邮箱地址。</FieldDescription>
</Field>

// 禁用
<Field data-disabled>
  <FieldLabel htmlFor="email">邮箱</FieldLabel>
  <Input id="email" disabled />
</Field>
```

适用于所有控件：`Input`、`Textarea`、`Select`、`Checkbox`、`RadioGroupItem`、`Switch`、`Slider`、`NativeSelect`、`InputOTP`。
