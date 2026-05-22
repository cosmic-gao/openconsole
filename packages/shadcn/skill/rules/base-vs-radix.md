# Radix API 速查

`@opendesign/shadcn` 导出的组件统一使用 **radix** 风格 API。这份文件
记下几个 prop 形状容易踩坑的地方 —— 这些 prop 跟 `ui.shadcn.com` 上
有些示例（那边叫 base 风格）形态不同，从那边复制代码可能跑不通。
**以本文件的写法为准**。

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

> 看到 `render={…}` / `nativeButton={false}` 这种 prop —— **不是本包
> 的 API**，从别处复制的，全部改成 `asChild` 形式。

---

## `Select`

用 inline `<SelectItem>`，不用 `items` 数组。

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
- **Placeholder**: `<SelectValue placeholder="…" />`，不是 `items` 里一条
  `{ value: null }` 的项。
- **定位**: `<SelectContent position="popper">`，不是 `alignItemWithTrigger`。
- **value 类型**: 必须是字符串 —— 没有 `itemToStringValue` 这种 prop。

> **要 multi-select 或对象 value**: 本包的 `Select` **不支持**。改用
> `@opendesign/atoms` 的 `Combobox`，或者自己拼 `Command` + `Popover` +
> `Checkbox`。

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

> 看到 `<ToggleGroup multiple>`（布尔）或单选时 `defaultValue={["daily"]}`
> （数组）—— 不是本包的 API，从别处复制的。`multiple` 改成
> `type="multiple"`，单选 `defaultValue` 改成字符串。

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

> 看到 `<Slider defaultValue={50} />`（标量）—— 不是本包的 API。包成
> `[50]`。

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

> 看到 `<Accordion>` 没有 `type` 或者单选 `defaultValue={["item-1"]}`
> （数组）—— 不是本包的 API，按上面写法改。

---

## 快速判定

复制代码进来时下面任一特征出现就是**别处的 API**，需要按本文件改写:

| 别处写法 | 本包写法 |
|---|---|
| `render={<Button />}` | `<XTrigger asChild><Button /></XTrigger>` |
| `nativeButton={false}` | 不需要 —— `asChild` 自动处理 |
| `<Select items={[…]}>` + render-function `SelectValue` | inline `<SelectItem>` |
| `<SelectContent alignItemWithTrigger={false}>` | `position="popper"` |
| `itemToStringValue` | 不支持 —— 用 `Combobox`（atoms） |
| `<ToggleGroup multiple>` | `<ToggleGroup type="multiple">` |
| 单选 `<ToggleGroup defaultValue={["x"]}>` | `<ToggleGroup type="single" defaultValue="x">` |
| `<Slider defaultValue={50} />` | `<Slider defaultValue={[50]} />` |
| `<Accordion>` 没有 `type` | 加 `type="single"` 或 `type="multiple"` |
| 单选 `<Accordion defaultValue={["x"]}>` | `<Accordion type="single" defaultValue="x">` |
