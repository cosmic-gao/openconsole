# `DataTable` 用法

`DataTable` 是 `@tanstack/react-table` 的薄封装，提供排序、列筛选、
分页和基本无障碍。这份文件记下常见 column 模式 + 跟 shadcn 原语的协作。

```tsx
import { DataTable } from "@openconsole/atoms";
import type { ColumnDef } from "@tanstack/react-table";

<DataTable columns={columns} data={rows} pageSize={10} pagination />
```

## Props

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `columns` | `ColumnDef<TData, TValue>[]` | — | tanstack-table 的列定义 |
| `data` | `TData[]` | — | 行数据 |
| `pageSize` | `number` | `10` | 初始 page size |
| `pagination` | `boolean` | `true` | 是否显示分页控件 |
| `emptyText` | `string` | `"No results."` | 空数据文案 |

---

## 常见 column 定义

### 基础列

```tsx
{ accessorKey: "id", header: "ID" }
```

### 带排序的列

`enableSorting: true` 默认开启，header 用 `Button` 加排序图标即可触发:

```tsx
import { Button } from "@openconsole/shadcn";
import { ArrowUpDown } from "lucide-react";

{
  accessorKey: "name",
  header: ({ column }) => (
    <Button
      variant="ghost"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      名称
      <ArrowUpDown data-icon="inline-end" />
    </Button>
  ),
}
```

### 自定义 cell（状态徽章）

```tsx
import { Badge } from "@openconsole/shadcn";

{
  accessorKey: "status",
  header: "状态",
  cell: ({ row }) => {
    const status = row.original.status;
    return (
      <Badge variant={status === "active" ? "default" : "secondary"}>
        {status === "active" ? "活跃" : "归档"}
      </Badge>
    );
  },
}
```

### 自定义 cell（金额 / 数字）

```tsx
{
  accessorKey: "amount",
  header: () => <div className="text-right">金额</div>,
  cell: ({ row }) => {
    const amount = parseFloat(row.getValue("amount"));
    const formatted = new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
    }).format(amount);
    return <div className="text-right font-medium">{formatted}</div>;
  },
}
```

### 操作列（菜单触发）

```tsx
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@openconsole/shadcn";
import { MoreHorizontal } from "lucide-react";

{
  id: "actions",
  enableHiding: false,
  cell: ({ row }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="size-8 p-0">
          <span className="sr-only">打开菜单</span>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(row.original.id)}>
          复制 ID
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEdit(row.original)}>编辑</DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(row.original)}
        >
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
}
```

### 选择列（checkbox）

```tsx
import { Checkbox } from "@openconsole/shadcn";

{
  id: "select",
  header: ({ table }) => (
    <Checkbox
      checked={
        table.getIsAllPageRowsSelected() ||
        (table.getIsSomePageRowsSelected() && "indeterminate")
      }
      onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
      aria-label="全选"
    />
  ),
  cell: ({ row }) => (
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value) => row.toggleSelected(!!value)}
      aria-label="选择行"
    />
  ),
  enableSorting: false,
  enableHiding: false,
}
```

> **注意**: 选择行需要在 `useReactTable` 配置里开 `enableRowSelection`，
> 但 `DataTable` 当前**没暴露**这个配置入口。要选择 / 多选场景请直接
> 用 shadcn 的 `Table` + 自己接 tanstack-table。

---

## 完整例子

```tsx
"use client";
import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge, Button } from "@openconsole/shadcn";
import { DataTable } from "@openconsole/atoms";
import { ArrowUpDown } from "lucide-react";

type Project = {
  id: string;
  name: string;
  status: "active" | "archived";
  owner: string;
  updatedAt: string;
};

const columns: ColumnDef<Project>[] = [
  { accessorKey: "id", header: "ID" },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        名称
        <ArrowUpDown data-icon="inline-end" />
      </Button>
    ),
  },
  {
    accessorKey: "status",
    header: "状态",
    cell: ({ row }) => (
      <Badge variant={row.original.status === "active" ? "default" : "secondary"}>
        {row.original.status === "active" ? "活跃" : "归档"}
      </Badge>
    ),
  },
  { accessorKey: "owner", header: "负责人" },
  { accessorKey: "updatedAt", header: "更新时间" },
];

export function ProjectsTable({ data }: { data: Project[] }) {
  return <DataTable columns={columns} data={data} pageSize={20} />;
}
```

---

## 何时不用 `DataTable`

- **只是展示数据，不需要排序 / 筛选 / 分页**: 用 shadcn 的 `Table` +
  `TableHeader` / `TableRow` / `TableCell` 手拼，更轻量。
- **需要行选择、可拖拽列、虚拟滚动**: `DataTable` 当前没暴露这些
  入口。直接用 shadcn 的 `Table` + `useReactTable` 自己接。
- **服务端分页 / 筛选**: `DataTable` 现在做的是客户端分页 / 排序 /
  筛选。要服务端逻辑同样直接用 `Table` + 自己接 tanstack-table。

---

## 常见坑

- **`cell` 里返回 ReactNode**: 不要返回字符串拼 JSX —— 用真正的
  `<Badge>` / `<Button>` 之类的 shadcn 组件，跟视觉系统一致。
- **状态色用 `Badge variant` 或 `text-destructive`**: 不要 `text-red-500`、
  `text-green-600` 这种裸 Tailwind 色。
- **header 字符串 vs 函数**: 简单文本用字符串；带交互（排序按钮、
  全选 checkbox）用 `({ column }) => ...`。
- **不要在 cell 里调 `useState`**: cell 渲染频繁，state 会丢。要 cell
  内交互（比如 inline edit）把 state 提到行外。
