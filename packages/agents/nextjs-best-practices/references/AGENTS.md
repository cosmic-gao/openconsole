# React + Next.js 性能 / 模式参考(索引)

本目录的 12 个子目录是 [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `vercel-react-best-practices` 规则集的本地副本,**按主题已经拆好**。本文是索引,**没有正文** —— 找具体规则按下面表格直接进对应子目录。

> 不要把这里的规则当 SOP 死扣 —— React 19 Compiler 已经自动处理大量手动 memo / useMemo。**Profiling 看到具体瓶颈再来翻这里**,不要预先优化。

---

## 主题目录

| 主题 | 子目录 | 何时翻 |
| --- | --- | --- |
| 包体积 / 加载策略 | [`bundle/`](./bundle/) | 加 chart / editor / 富文本等重组件;barrel imports;第三方脚本延迟 |
| 异步 / 数据 | [`data/`](./data/) | RSC 里 fetch 形态(`Promise.all` / `Suspense` / `_cached.ts`);LocalStorage 类型化 |
| 服务端 | [`server/`](./server/) | Server Action 鉴权;`after()` 非阻塞;静态 IO 提到模块级 |
| RSC 边界 | [`rsc/`](./rsc/) | `'use client'` / `'use server'` / `'use cache'` 三种 directive;hydration mismatch;Suspense boundary 选位 |
| 路由 | [`routing/`](./routing/) | file conventions(注:Next 16 是 `proxy.ts`,不是 `middleware.ts`);route handlers;并行路由;Edge vs Node runtime |
| Client 端事件 | [`client/`](./client/) | 全局事件监听去重;passive listeners |
| 重渲染优化 | [`rerender/`](./rerender/) | 派生状态 / memo / `useTransition` / `useDeferredValue` / 拆 hook |
| 渲染表现 | [`rendering/`](./rendering/) | hydration 防闪烁;`content-visibility`;`Activity`;hoist 静态 JSX |
| JS 微优化 | [`js/`](./js/) | profiling 看到具体热点再用:`Set/Map` 替 `.includes`、循环里 hoist length、`toSorted` 等 |
| UI 资源 | [`ui/`](./ui/) | `next/font`、`next/image`、`Metadata`、`<Script>` |
| 高级模式 | [`advanced/`](./advanced/) | event handler ref;`useEffectEvent`;一次性 init |
| 运维 | [`ops/`](./ops/) | debug tricks;self-hosting |

---

## 与本骨架的强约束(差异要点)

本骨架对上游规则集有**几条覆盖**,如果上游规则与下表冲突,**以下表为准**:

| 主题 | 上游规则 | 本骨架要求 |
| --- | --- | --- |
| 客户端缓存库 | 鼓励 SWR | **禁用 SWR,强制 TanStack Query**(详见 [`tanstack-query`](../../tanstack-query/SKILL.md)) |
| 表单库 | 提及 TanStack Form | **强制 react-hook-form + zodResolver + shadcn `<Form>`**(详见 [`react-hook-form`](../../react-hook-form/SKILL.md)) |
| Postgres 驱动 | 通用示例 `pg` / `node-postgres` | **强制 `postgres-js` + `postgres@^3`,`prepare: false`** —— `DATABASE_URL` 由用户提供,同时兼容直连 5432 / pgbouncer 6432(详见 [`drizzle-orm`](../../drizzle-orm/SKILL.md)) |
| Edge middleware | 称为 `middleware.ts` | Next 16 改名 **`proxy.ts`**(不可改回) |
| Cache 后端 | 提及 unstable_cache / Data Cache | **`cache-handler.mjs` + `@neshca/cache-handler@^1.9` + `redis@^4`**(详见 [`redis-development`](../../redis-development/SKILL.md)) |

---

## 高 ROI 子集(先看这些)

如果时间有限,只看下面 10 条:

1. [`rerender/rerender-no-inline-components.md`](./rerender/rerender-no-inline-components.md) —— 不在组件里定义内嵌组件
2. [`rerender/rerender-derived-state-no-effect.md`](./rerender/rerender-derived-state-no-effect.md) —— 派生状态在 render 里算
3. [`data/async-parallel.md`](./data/async-parallel.md) —— 多个独立 await 用 `Promise.all`
4. [`data/async-suspense-boundaries.md`](./data/async-suspense-boundaries.md) —— 慢内容用 Suspense 包,不阻塞快内容
5. [`rsc/rsc-boundaries.md`](./rsc/rsc-boundaries.md) —— Server / Client 边界判断
6. [`rsc/hydration-error.md`](./rsc/hydration-error.md) —— 排查 hydration mismatch
7. [`bundle/bundle-dynamic-imports.md`](./bundle/bundle-dynamic-imports.md) —— 大组件用 `next/dynamic` 切码
8. [`server/server-auth-actions.md`](./server/server-auth-actions.md) —— Server Action 第一行调 session 守卫
9. [`ui/font.md`](./ui/font.md) —— 用 `next/font/google`,不用 `<link rel="stylesheet">`
10. [`ui/image.md`](./ui/image.md) —— 用 `next/image`,不用裸 `<img>`

更项目相关的精选见 [`../performance.md`](./performance.md)。

---

## 与其它索引的关系

| 索引 | 内容 |
| --- | --- |
| [`../SKILL.md`](../SKILL.md) | nextjs-best-practices 入口,五条硬规则 + 项目专用范式 |
| [`./scaffold.md`](./scaffold.md) | 67 个骨架文件的索引 |
| [`./directory-structure.md`](./directory-structure.md) | 每个目录能放 / 不能放什么 |
| [`./data-layer.md`](./data-layer.md) | 数据层全图(Drizzle + BFF + Redis + Nacos) |
| [`./configs.md`](./configs.md) | 每个根级配置文件的字段语义 |
| [`./features.md`](./features.md) | 加新 feature 切片的流程 |
| [`./error-pages.md`](./error-pages.md) | 5 个 special files + `(errors)/*` 路由组 |
| [`./performance.md`](./performance.md) | 本项目相关的高 ROI 性能优化 |
| [`./checklist.md`](./checklist.md) | pre-commit / review / 部署 / 排障四套清单 |
