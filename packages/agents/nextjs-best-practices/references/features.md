# Features —— 加新业务切片

> 模板把业务代码按「领域」组织在 `features/<domain>/`。本文是加一个新 feature 的
> 完整流程。模板里 `auth` 与 `notes` 两个切片就是最好的范本,新功能照抄结构。

---

## 标准目录契约

```
features/<domain>/
├── schemas.ts                 # zod schemas —— 单一事实来源
├── types.ts                   # 类型(可选,纯 TS / 从 schemas 派生)
├── actions.ts                 # "use server" Server Actions
├── _cached.ts                 # "use cache" 读层(可选)
├── components/                # React 组件
├── contexts/                  # 该 feature 的 React Context(可选)
├── hooks/                     # 自定义 hooks(可选)
├── queries/                   # TanStack Query 选项 + key
│   ├── keys.ts
│   └── options.ts
└── server/                    # 服务端工具,**不是** Server Action(可选)
```

**不要建** `index.ts` 桶式导出 actions —— `"use server"` 必须在 import 点可见。

---

## 案例:加 `orders` feature

### 0. 决定要做什么

需求:列订单、查详情、创建、撤销。

数据库:已有 `orders` 表(`lib/db/schema/orders.ts`)。

### 1. `lib/db/schema/orders.ts`(数据库)

```ts
import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
```

```ts
// lib/db/schema/index.ts
export * from "./notes";
export * from "./orders";   // ← 加一行
```

```bash
pnpm db:generate    # 生成迁移
pnpm db:push        # dev 直推
```

### 2. `features/orders/schemas.ts`

```ts
import { z } from "zod";

export const OrderId = z.coerce.number().int().positive();

export const OrderInput = z.object({
  amount: z.coerce.number().int().positive(),
  note: z.string().trim().max(500).optional(),
});

export type OrderInput = z.infer<typeof OrderInput>;
```

### 3. `features/orders/_cached.ts`(可缓存读)

```ts
import "server-only";

import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";

export async function listOrdersCached(userId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`orders:list:${userId}`);

  return db.query.orders.findMany({
    where: eq(orders.userId, userId),
    orderBy: desc(orders.createdAt),
    limit: 100,
  });
}

export async function getOrderCached(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`orders:item:${id}`);

  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row ?? null;
}
```

### 4. `features/orders/actions.ts`(Server Action)

```ts
"use server";

import { eq } from "drizzle-orm";
import { notFound, unauthorized } from "next/navigation";
import { updateTag } from "next/cache";

import { db } from "@/lib/db";
import { orders } from "@/lib/db/schema";
import { getSession } from "@/features/auth/server/session";

import { OrderId, OrderInput } from "./schemas";
import { getOrderCached, listOrdersCached } from "./_cached";

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) unauthorized();
  // 你的 userId 来源 —— 这里假设从某个调用拿到,真实代码可能调 getMe()
  return "current-user-id";
}

export async function listOrders() {
  const userId = await requireUserId();
  return listOrdersCached(userId);
}

export async function getOrder(rawId: unknown) {
  await requireUserId();   // 简单鉴权 —— 实际项目可能要校验是不是 owner
  const id = OrderId.parse(rawId);
  const order = await getOrderCached(id);
  if (!order) notFound();
  return order;
}

export async function createOrder(input: unknown) {
  const userId = await requireUserId();
  const { amount, note } = OrderInput.parse(input);

  const [row] = await db
    .insert(orders)
    .values({ userId, amount, status: "pending" })
    .returning();

  updateTag(`orders:list:${userId}`);
  return row;
}

export async function cancelOrder(rawId: unknown) {
  const userId = await requireUserId();
  const id = OrderId.parse(rawId);

  const [row] = await db
    .update(orders)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(orders.id, id))
    .returning();

  if (!row) notFound();

  updateTag(`orders:list:${userId}`);
  updateTag(`orders:item:${id}`);
  return row;
}
```

### 5. `features/orders/queries/keys.ts`

```ts
export const orderKeys = {
  all: () => ["orders"] as const,
  list: () => [...orderKeys.all(), "list"] as const,
  detail: (id: number) => [...orderKeys.all(), "detail", id] as const,
};
```

### 6. `features/orders/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getOrder, listOrders } from "../actions";
import { orderKeys } from "./keys";

export const orderQueries = {
  list: () =>
    queryOptions({
      queryKey: orderKeys.list(),
      queryFn: () => listOrders(),
      staleTime: 30 * 1000,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: orderKeys.detail(id),
      queryFn: () => getOrder(id),
      staleTime: 30 * 1000,
    }),
};
```

### 7. `features/orders/components/orders-table.tsx`

```tsx
"use client";

import { Button, Empty, EmptyHeader, EmptyTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@openconsole/shadcn";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";

import type { Order } from "@/lib/db/schema";

import { orderQueries } from "../queries/options";
import { OrderFormDialog } from "./order-form";

export function OrdersTable({ initialData }: { initialData: Order[] }) {
  const { data: orders } = useSuspenseQuery({ ...orderQueries.list(), initialData });
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Orders</h2>
        <Button onClick={() => setCreating(true)}>
          <Plus /> New order
        </Button>
      </div>

      {orders.length === 0 ? (
        <Empty>
          <EmptyHeader><EmptyTitle>No orders yet</EmptyTitle></EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.id}</TableCell>
                <TableCell>{order.amount}</TableCell>
                <TableCell>{order.status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <OrderFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
```

### 8. `features/orders/components/order-form.tsx`

照抄 `features/notes/components/note-form.tsx` 的结构,改 schema / action 即可。

### 9. `app/(dashboard)/orders/page.tsx`(路由)

```tsx
import { Suspense } from "react";

import { listOrders } from "@/features/orders/actions";
import { OrdersTable } from "@/features/orders/components/orders-table";

export const metadata = { title: "Orders" };

export default function OrdersPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header><h1 className="text-2xl font-bold">Orders</h1></header>
      <Suspense fallback={<div className="bg-muted h-64 animate-pulse rounded-md" />}>
        <OrdersShell />
      </Suspense>
    </div>
  );
}

async function OrdersShell() {
  const data = await listOrders();
  return <OrdersTable initialData={data} />;
}
```

### 10. `config/sidebar.ts`(菜单)

```ts
menu: [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Notes", href: "/notes", icon: "NotebookPen" },
      { label: "Orders", href: "/orders", icon: "ShoppingCart" },   // ← 加这条
    ],
  },
]
```

完成。

---

## 规则归纳

### 命名

| 实体 | 命名 |
| --- | --- |
| Feature 目录 | 单数小写,如 `orders` / `users` / `billing` |
| Schema | PascalCase 类(`OrderInput` / `OrderId`)和与 schema 同名的 type |
| Action 函数 | 动词开头 + 实体单数(`getOrder` / `createOrder` / `cancelOrder` / `listOrders`) |
| Cached 函数 | `<action>Cached` 后缀(`getOrderCached` / `listOrdersCached`) |
| Query key | `<entity>Keys.all()` / `.list()` / `.detail(id)` —— 永远 函数 |
| Query options | `<entity>Queries.list()` / `.detail(id)` —— 永远 函数 |
| Cache tag | `<entity>:list:[scope]` / `<entity>:item:<id>` |

### 文件大小

每个文件应当 **< 300 行**。超过就拆:

- `components/` 拆多个组件文件
- `actions.ts` 把大段业务挪到 `server/<verb>.ts` 然后从 action 里调

### 跨 feature 复用

| 想做 | 怎么做 |
| --- | --- |
| feature A 要用 feature B 的数据 | 调 B 的 Server Action(`@/features/B/actions`) |
| 多个 feature 都需要某个工具 | 提到 `lib/<name>/` |
| 一个组件被两个 feature 用 | 看是否真有 generic value,有则进 `@openconsole/atoms`,没则各自一份(允许少量重复) |

### 不允许

- ❌ `features/<domain>/index.ts` 里 `export * from "./actions"` —— `"use server"` directive 必须可见
- ❌ 跨 feature 直接 import `_cached.ts` —— 走 Server Action
- ❌ 跨 feature 直接 import `db.query` —— 走 Server Action
- ❌ Server Action 文件用 `default export` —— Next 16 要求命名导出
- ❌ 在 Server Action 里 `console.log` —— 用 `scoped("...")` 的 logger
- ❌ 在 `_cached.ts` 里读 cookies / Date.now / Math.random

---

## 加新 feature 速查清单

```
[ ] lib/db/schema/<entity>.ts                 + schema/index.ts re-export
[ ] pnpm db:generate && pnpm db:push
[ ] features/<entity>/schemas.ts              zod
[ ] features/<entity>/_cached.ts              'use cache' 读
[ ] features/<entity>/actions.ts              'use server' CRUD + updateTag
[ ] features/<entity>/queries/keys.ts
[ ] features/<entity>/queries/options.ts
[ ] features/<entity>/components/<entity>-table.tsx
[ ] features/<entity>/components/<entity>-form.tsx
[ ] features/<entity>/components/<entity>-delete-dialog.tsx (如果有删除)
[ ] app/(dashboard)/<entity>/page.tsx         路由
[ ] app/(dashboard)/<entity>/[id]/page.tsx    详情(如果有)
[ ] config/sidebar.ts 加菜单项
```

完成后 `pnpm dev`,在 sidebar 看到新菜单,点进去能列、能加、能改、能删。
