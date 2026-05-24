# 图标

## Button 内图标使用 data-icon 属性

在图标上添加 `data-icon="inline-start"`（前缀）或 `data-icon="inline-end"`（后缀）。图标不加尺寸类。

**错误：**

```tsx
<Button>
  <SearchIcon className="mr-2 size-4" />
  搜索
</Button>
```

**正确：**

```tsx
<Button>
  <SearchIcon data-icon="inline-start"/>
  搜索
</Button>

<Button>
  下一步
  <ArrowRightIcon data-icon="inline-end"/>
</Button>
```

---

## 组件内图标不加尺寸类

组件通过 CSS 处理图标尺寸。不要在 `Button`、`DropdownMenuItem`、`Alert`、`Sidebar*` 等内部的图标添加 `size-4`、`w-4 h-4` 或其他尺寸类。

**错误：**

```tsx
<Button>
  <SearchIcon className="size-4" data-icon="inline-start" />
  搜索
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  设置
</DropdownMenuItem>
```

**正确：**

```tsx
<Button>
  <SearchIcon data-icon="inline-start" />
  搜索
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  设置
</DropdownMenuItem>
```

---

## 图标作为组件对象传递

使用 `icon={CheckIcon}`，不是字符串键的查找表。

**错误：**

```tsx
const iconMap = {
  check: CheckIcon,
  alert: AlertIcon
}

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon]
  return <Icon />
}

<StatusBadge icon="check" />
```

**正确：**

```tsx
import { CheckIcon } from 'lucide-react'

function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />
}

<StatusBadge icon={CheckIcon} />
```

---

## Sidebar 图标

`Sidebar` 的 `brand.logo` 和 `menu.items[].icon` 使用字符串名称，不是导入的组件：

```tsx
const data = {
  brand: {
    name: "Acme",
    logo: "Command",  // lucide 图标名称
  },
  menu: [
    {
      label: "仪表盘",
      icon: "LayoutDashboard",  // 字符串名称
      href: "/",
    },
  ],
}
```
