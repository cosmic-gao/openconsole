# AGENTS.md — AI Coding Agent Reference

本文件给 AI 编码 agent 提供项目级事实信息：目录结构、依赖清单、构建命令、环境变量。是这个项目的**单一信息源（single source of truth）**——agent 进入项目第一件事就是读它。

---

## 项目概览

**shadcn-admin** —— 生产级管理后台模板：

- **框架**：Next.js 16+（App Router）
- **语言**：TypeScript 6+，strict mode
- **样式**：Tailwind CSS v4（`@import "tailwindcss"`）
- **UI 套件**：`shadcn/ui` 或 `@openconsole/shadcn`（原语）+ `@openconsole/atoms`（高阶组件）
- **包管理器**：pnpm

---

## 技术栈细节

### 核心运行时

| 用途 | 包 | 版本 |
| --- | --- | --- |
| 框架 | `next` | `16.2.6` |
| React | `react` / `react-dom` | `19.2.6` |
| TS | `typescript` | `^6.0.3` |
| Node target | (tsconfig) | `ES2017` |

### 样式 & UI

| 用途 | 包 | 版本 |
| --- | --- | --- |
| Tailwind | `tailwindcss` | `^4.3.0` |
| PostCSS plugin | `@tailwindcss/postcss` | `^4.3.0` |
| 动画扩展 | `tw-animate-css` | `^1.4.0` |
| UI 原语 | `@openconsole/shadcn` | `0.0.1` |
| UI 高阶组件 | `@openconsole/atoms` | `0.0.8` |
| Radix 底层 | `radix-ui` + `@radix-ui/react-*` | latest |
| Icons | `lucide-react` | `^1.16.0` |
| 字体 | `next/font/google`（Geist Sans / Mono / Inter / Manrope） | (内置) |
| Loading bar | `nextjs-toploader` | `^3.9.17` |
| 主题切换 | `next-themes` | `^0.4.6` |
| Toast | `sonner` | `^2.0.7` |
| Carousel | `embla-carousel-react` | `^8.6.0` |
| OTP 输入 | `input-otp` | `^1.4.2` |
| 可拖拽面板 | `react-resizable-panels` | `^4.11.1` |
| Command palette | `cmdk` | `^1.1.1` |
| Drawer | `vaul` | `^1.1.2` |

### 数据 / 表单 / 状态

| 用途 | 包 | 版本 |
| --- | --- | --- |
| Schema 校验 | `zod` | `^4.4.3` |
| 表单 | `react-hook-form` + `@hookform/resolvers` | `^7.76.0` / `^5.2.2` |
| 表格 | `@tanstack/react-table` | `^8.21.3` |
| URL state | `nuqs` | `^2.8.9` |
| Date | `date-fns` | `^4.2.1` |
| Day picker | `react-day-picker` | `^9.14.0` |
| Charts | `recharts` | `3.8.0` |

**项目当前没有客户端缓存库**（`@tanstack/react-query` / SWR 等都没引入）。RSC + Server Action 直接 `await` 是默认。加客户端缓存时**只能加 TanStack Query**——生态匹配 `@tanstack/react-table`，不要混入 SWR。

### 开发工具

| 用途 | 包 | 版本 |
| --- | --- | --- |
| Lint | `eslint` + `eslint-config-next` | `^10.4.0` / `16.2.6` |
| Format | `prettier` | `^3.8.3` |
| Types | `@types/node` / `@types/react` / `@types/react-dom` | latest |

---

## 项目结构

```
.
├── app/                       Next.js App Router（routes + special files only）
│   ├── layout.tsx             root layout
│   ├── globals.css            Tailwind v4 入口
│   ├── page.tsx               首页
│   └── dashboard/
│       ├── layout.tsx         仪表盘布局
│       └── page.tsx           欢迎页
│
├── public/                    静态资源
│
├── features/                  业务领域切片
│   └── auth/                  鉴权切片
│       ├── components/
│       └── index.ts           barrel — 只导 UI/types/schemas
│
├── config/                    应用级静态配置
│
├── lib/                       可复用基建（按 concern 分子目录）
│   └── auth/                  session + guards + Server Action
│       ├── cookies.ts
│       ├── session.ts         auth() / bearer()
│       ├── guards.ts          protect()
│       └── authenticate.ts    "use server"
│
├── env.ts                     环境变量校验
├── next.config.ts             Next.js 配置
├── tsconfig.json              strict + "@/*": ["./*"]
├── postcss.config.mjs         Tailwind v4 plugin
├── package.json
└── .env.example
```

### 强制目录约定

| 规则 | 含义 |
| --- | --- |
| **No `src/`** | 根目录平铺；tsconfig 已配 `"@/*": ["./*"]` |
| **No `shared/`** | 用 `lib/` 而不是 `shared/` |
| **No `lib/api/`** | 用 `lib/http/`（避开 `app/api/` 路由命名冲突） |
| **业务在 `features/<domain>/`** | 不在 `app/` 里，`app/` 只放路由 + special files |
| **features 的 server/* 不进 index.ts** | `"use server"` directive 必须在 import 点可见 |

---

## 命令

```bash
pnpm install            # 装依赖
pnpm dev                # 启动开发服 (http://localhost:3000)
pnpm build              # 生产构建
pnpm start              # 跑生产服
pnpm lint               # ESLint
pnpm format             # Prettier --write .
```

---

## 环境变量

**禁止**直接读 `process.env.NEXT_PUBLIC_*`——使用 `@/env` 的 `env` 对象绕过校验。

---

## AI Agent 工作规范

1. **进入项目第一件事**：读完本文件。所有目录约定、依赖版本、命令、环境变量都在这里。
2. **加新业务功能**：在 `features/<domain>/` 起 slice（schemas / server / components / hooks / index.ts）。**不要**把业务塞进 `app/`。
3. **加新基建**：在 `lib/<concern>/` 起子目录。
4. **传 props 给 client 组件**：必须 JSON-serializable。`Date` 转 ISO string，函数除了 Server Action 都不行。
5. **写 Server Action**：`"use server"` + `zod` 校验 + `protect()`——三件缺一不可。
6. **数据获取**：默认 RSC 直接 await；多个独立请求用 `Promise.all`。客户端缓存只能加 TanStack Query。
7. **图片**：永远用 `next/image`；外部域要在 `next.config.ts` 的 `images.remotePatterns` 加白名单。
8. **图标**：只用 `lucide-react`；组件代码里直接 import。
9. **不要**：SWR、`getServerSession()`、自己拼 `Bearer ` header、把 server 函数从 `features/<slice>/index.ts` re-export。

---

## 外部参考

- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [TanStack Table](https://tanstack.com/table/latest)
- [nuqs](https://nuqs.dev/)
- [react-hook-form + zod](https://react-hook-form.com/get-started#SchemaValidation)
