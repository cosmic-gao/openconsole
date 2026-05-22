# Icons

This package's icon library is **fixed to `lucide-react`**. Import all icons
from there, or use this package's `Icon` wrapper to render dynamically by
name.

---

## Icons in `Button` use the `data-icon` attribute

Add `data-icon="inline-start"` (prefix) or `data-icon="inline-end"` (suffix)
to the icon. **Don't add size classes to icons.**

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

## No size classes on icons inside components

`Button`, `DropdownMenuItem`, `Alert`, `Sidebar*`, etc. manage icon sizing
themselves via CSS. **Don't** add `size-4` / `w-4 h-4` by hand. Unless the
user explicitly asks for a custom icon size.

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

## Pass icons as component objects, not string keys

Use `icon={CheckIcon}`, not a string key looked up in a map.

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

## Render dynamically by name with `Icon`

When the icon name comes from data (menu config, theme presets, CMS content)
rather than a hard-coded import, use this package's `Icon`:

```tsx
import { Icon } from "@openconsole/shadcn";

// Data
const menu = [
  { label: "Dashboard", icon: "LayoutDashboard", href: "/" },
  { label: "Settings", icon: "Settings", href: "/settings" },
];

// Render
{menu.map((item) => (
  <a key={item.href} href={item.href}>
    <Icon name={item.icon} />
    {item.label}
  </a>
))}
```

`Icon name="…"` accepts **any** icon's PascalCase name from `lucide-react`
(`LayoutDashboard`, `ChevronRight`, `Settings`, etc.). If the name isn't
found, it renders as `null` (doesn't throw).

> For compile-time-known icons, use a regular import — `<SearchIcon />` is
> more tree-shakable than `<Icon name="Search" />`.
