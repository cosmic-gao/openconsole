# 本包 API 速查

本包导出的组件有几处 prop 形状容易写错，这份文件作为速查清单。
照下面的写法用就对了。

## 目录

- 自定义触发器: `asChild`
- `Select`
- `ToggleGroup`
- `Slider`
- `Accordion`

---

## 自定义触发器: `asChild`

要让 trigger / close 渲染成自定义元素或别的组件（最常见的是 `Button`），
用 `asChild` 替换默认元素。**不要**用多余的元素包裹 trigger。

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

要把 trigger 渲染成 `<a>` 这种非 button 元素，同样直接 `asChild`:

```tsx
<Button asChild>
  <a href="/docs">Read the docs</a>
</Button>
```

适用于所有 trigger / close 组件: `DialogTrigger`、`SheetTrigger`、
`AlertDialogTrigger`、`DropdownMenuTrigger`、`PopoverTrigger`、
`TooltipTrigger`、`CollapsibleTrigger`、`DialogClose`、`SheetClose`、
`NavigationMenuLink`、`BreadcrumbLink`、`SidebarMenuButton`。

---

## `Select`

inline `<SelectItem>`，**不要**通过 `items` 数组传入。

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

要点:
- **Placeholder**: 写在 `<SelectValue placeholder="…" />` 上。
- **定位**: `<SelectContent position="popper">`。
- **value 类型**: 必须是字符串。

> 需要 multi-select 或对象 value: 本包的 `Select` 不支持。在应用层
> 用 `Command` + `Popover` + `Checkbox` 自己拼。

---

## `ToggleGroup`

必须显式 `type="single"` 或 `type="multiple"`:

```tsx
// 单选, defaultValue 是字符串
<ToggleGroup type="single" defaultValue="daily" spacing={2}>
  <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
  <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
</ToggleGroup>

// 多选, defaultValue 是字符串数组
<ToggleGroup type="multiple">
  <ToggleGroupItem value="bold">Bold</ToggleGroupItem>
  <ToggleGroupItem value="italic">Italic</ToggleGroupItem>
</ToggleGroup>
```

受控单选:

```tsx
const [value, setValue] = React.useState("normal");
<ToggleGroup type="single" value={value} onValueChange={setValue}>
  …
</ToggleGroup>
```

---

## `Slider`

`defaultValue` / `value` **总是数组**:

```tsx
// 单滑块
<Slider defaultValue={[50]} max={100} step={1} />

// 区间
<Slider defaultValue={[20, 80]} max={100} step={1} />
```

受控:

```tsx
const [value, setValue] = React.useState([0.3, 0.7]);
<Slider value={value} onValueChange={setValue} />
```

---

## `Accordion`

必须显式 `type="single"` 或 `type="multiple"`。单选支持 `collapsible`，
`defaultValue` 是字符串:

```tsx
// 单选, 可折叠
<Accordion type="single" collapsible defaultValue="item-1">
  <AccordionItem value="item-1">…</AccordionItem>
</Accordion>

// 多选, defaultValue 是字符串数组
<Accordion type="multiple" defaultValue={["item-1", "item-2"]}>
  <AccordionItem value="item-1">…</AccordionItem>
  <AccordionItem value="item-2">…</AccordionItem>
</Accordion>
```

---

## 错写形态速查

下面这些 prop 形态**不是本包的 API**，写出来跑不通 —— 按右列改:

| 错写形态 | 正确形态 |
|---|---|
| `<XTrigger render={<Button />} />` | `<XTrigger asChild><Button /></XTrigger>` |
| `nativeButton={false}` | 不需要，`asChild` 自动处理 |
| `<Select items={[…]}>` + `<SelectValue>{(v) => …}</SelectValue>` | inline `<SelectItem>`，placeholder 在 `<SelectValue>` |
| `<SelectContent alignItemWithTrigger={false}>` | `<SelectContent position="popper">` |
| `itemToStringValue` | 不支持 —— 用 `Command` + `Popover` + `Checkbox` 自己拼 |
| `<ToggleGroup multiple>` | `<ToggleGroup type="multiple">` |
| 单选 `<ToggleGroup defaultValue={["x"]}>` | `<ToggleGroup type="single" defaultValue="x">` |
| `<Slider defaultValue={50} />` | `<Slider defaultValue={[50]} />` |
| `<Accordion>` 没有 `type` | 加 `type="single"` 或 `type="multiple"` |
| 单选 `<Accordion defaultValue={["x"]}>` | `<Accordion type="single" defaultValue="x">` |
