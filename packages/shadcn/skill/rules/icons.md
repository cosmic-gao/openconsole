# 图标

本包的图标库**固定为 `lucide-react`**。所有图标从那里导入，或者通过
本包导出的 `Icon` 包装按名字动态渲染。

---

## `Button` 里的图标用 `data-icon` 属性

加 `data-icon="inline-start"`（前缀）或 `data-icon="inline-end"`（后缀）
到图标上。**图标上不要加尺寸 class**。

**Incorrect:**

```tsx
<Button>
  <SearchIcon className="mr-2 size-4" />
  Search
</Button>
```

**Correct:**

```tsx
<Button>
  <SearchIcon data-icon="inline-start"/>
  Search
</Button>

<Button>
  Next
  <ArrowRightIcon data-icon="inline-end"/>
</Button>
```

---

## 组件内部图标不要加尺寸 class

`Button`、`DropdownMenuItem`、`Alert`、`Sidebar*` 等组件通过 CSS 自己管
图标尺寸。**不要**手动加 `size-4` / `w-4 h-4`。除非用户明确要求自定义
图标尺寸。

**Incorrect:**

```tsx
<Button>
  <SearchIcon className="size-4" data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon className="mr-2 size-4" />
  Settings
</DropdownMenuItem>
```

**Correct:**

```tsx
<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>

<DropdownMenuItem>
  <SettingsIcon />
  Settings
</DropdownMenuItem>
```

---

## 图标当组件对象传，不要当字符串 key

用 `icon={CheckIcon}`，不要用字符串 key 去查表。

**Incorrect:**

```tsx
const iconMap = {
  check: CheckIcon,
  alert: AlertIcon,
};

function StatusBadge({ icon }: { icon: string }) {
  const Icon = iconMap[icon];
  return <Icon />;
}

<StatusBadge icon="check" />
```

**Correct:**

```tsx
import { CheckIcon } from "lucide-react";

function StatusBadge({ icon: Icon }: { icon: React.ComponentType }) {
  return <Icon />;
}

<StatusBadge icon={CheckIcon} />
```

---

## 按名字动态渲染用 `Icon`

当图标名字来自数据（菜单配置、主题预设、CMS 内容）而不是代码里写死的
import 时，用本包导出的 `Icon`:

```tsx
import { Icon } from "@opendesign/shadcn";

// 数据
const menu = [
  { label: "Dashboard", icon: "LayoutDashboard", href: "/" },
  { label: "Settings", icon: "Settings", href: "/settings" },
];

// 渲染
{menu.map((item) => (
  <a key={item.href} href={item.href}>
    <Icon name={item.icon} />
    {item.label}
  </a>
))}
```

`Icon name="…"` 接受 `lucide-react` 里**任何**图标的 PascalCase 名字
（`LayoutDashboard`、`ChevronRight`、`Settings` 等）。找不到名字时
渲染为 `null`（不抛错）。

> 编译期能确定的图标用普通 import —— `<SearchIcon />` 在 tree-shaking
> 下比 `<Icon name="Search" />` 更省 bundle。
