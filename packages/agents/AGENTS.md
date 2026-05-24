# Project Agents Reference

本文档是所有 AI 编码 agent 在本项目中的**单一信息源（Single Source of Truth）**。

---

## 技术栈

### 必选依赖

| 类别         | 包                      | 版本      |
| ------------ | ----------------------- | --------- |
| 框架         | `next`                  | `16.2.6`  |
| React        | `react` / `react-dom`   | `19.2.6`  |
| 语言         | `typescript`            | `6.0.3`   |
| 样式         | `tailwindcss`           | `4.3.0`   |
| PostCSS      | `@tailwindcss/postcss`  | `4.3.0`   |
| **UI**       | `@openconsole/shadcn`   | `最新`    |
|              | `@openconsole/atoms`    | `最新`    |
| 图标         | `lucide-react`          | `1.16.0`  |
| 主题         | `next-themes`           | `0.4.6`   |
| Toast        | `sonner`                | `2.0.7`   |
| **数据获取** | `@tanstack/react-query` | `5.90.5`  |
| HTTP 客户端  | `ofetch`                | `1.6.0`   |
| 表格         | `@tanstack/react-table` | `8.21.3`  |
| URL 状态     | `nuqs`                  | `2.8.9`   |
| **表单**     | `zod`                   | `4.4.3`   |
|              | `react-hook-form`       | `7.76.0`  |
|              | `@hookform/resolvers`   | `5.2.2`   |
| **工具**     | `@t3-oss/env-nextjs`    | `0.13.11` |
|              | `server-only`           | `0.0.1`   |
| 包管理器     | `pnpm`                  | -         |

### 可选依赖

| 类别 | 包         | 版本    |
| ---- | ---------- | ------- |
| 日期 | `date-fns` | `4.2.1` |

---

## 目录结构（强制）

```
project/
├── app/                       # App Router（仅路由 + special files）
│   ├── layout.tsx            # 根布局
│   ├── globals.css           # Tailwind v4 入口
│   ├── page.tsx             # 首页
│   └── [route]/             # 路由段
│       ├── page.tsx
│       └── [id]/page.tsx
│
├── public/                   # 静态资源
│
├── features/                 # 业务领域切片
│   └── [domain]/
│       ├── api/             # TanStack Query API 层
│       ├── components/       # UI 组件
│       ├── server/          # Server Actions（"use server"）
│       ├── hooks/           # 自定义 hooks
│       ├── schemas.ts       # Zod schemas
│       └── index.ts         # Barrel 导出（仅 UI + types）
│
├── lib/                      # 可复用基建
│   ├── auth/               # 鉴权
│   ├── http/               # HTTP 客户端（ofetch）
│   ├── query/              # TanStack Query 配置
│   └── utils.ts           # 工具函数（cn 等）
│
├── config/                   # 静态配置
├── env.ts                    # 环境变量校验
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── package.json
```

### 强制规则

| 规则                         | 原因                                    |
| ---------------------------- | --------------------------------------- |
| **No `src/`**                | 根目录平铺                              |
| **No `shared/`**             | 使用 `lib/`                             |
| **No `lib/api/`**            | 使用 `lib/http/` 避免与 `app/api/` 冲突 |
| **业务代码在 `features/`**   | `app/` 仅用于路由                       |
| **Server 函数不在 index.ts** | `"use server"` 必须在 import 点可见     |

---

## TanStack Query 目录结构（强制）

```
lib/
└── query/
    ├── get-query-client.ts   # Per-request QueryClient
    └── provider.tsx          # QueryClientProvider

features/<domain>/api/
├── <domain>.ts    # API 方法 + queryOptions（queryKey + queryFn 内聚）
├── schemas.ts     # Zod schemas
└── index.ts      # barrel
```

详细规范见 [`packages/agents/tanstack-query/SKILL.md`](./tanstack-query/SKILL.md)。

---

## Skill 索引

| 场景                | Skill                   | 路径                               |
| ------------------- | ----------------------- | ---------------------------------- |
| 登录/鉴权/会话      | `nextjs-auth-callback`  | `./nextjs-auth-callback/SKILL.md`  |
| Next.js 代码规范    | `nextjs-best-practices` | `./nextjs-best-practices/SKILL.md` |
| TanStack Query 规范 | `tanstack-query`        | `./tanstack-query/SKILL.md`        |

---

## 命令

```bash
pnpm install    # 安装依赖
pnpm dev        # 启动开发服务器（localhost:3000）
pnpm build      # 生产构建
pnpm start      # 启动生产服务器
pnpm lint       # ESLint
pnpm format     # Prettier
```

---

## 环境变量

**禁止**直接读取 `process.env.NEXT_PUBLIC_*`。使用 `@/env`。

新增变量必须双写：schema 字段 + `runtimeEnv` 映射。

---

## Agent 规则

1. 进入项目首先阅读本文档
2. 严格遵循上述目录结构
3. 登录/鉴权 → 调用 `nextjs-auth-callback` skill
4. 代码规范 → 调用 `nextjs-best-practices` skill
5. 客户端数据获取 → 调用 `tanstack-query` skill
6. 只有 `date-fns` 是可选依赖，其他都是必选
7. 传给 client 组件的 props 必须 JSON-serializable
8. 图片使用 `next/image`；外部域名添加到 `next.config.ts`
9. 仅使用 `lucide-react` 作为图标
10. **禁止**：SWR、`getServerSession()`、手动拼接 `Bearer` header

---

## 外部参考

- [Next.js App Router](https://nextjs.org/docs/app)
- [shadcn/ui](https://ui.shadcn.com/docs)
- [Tailwind CSS v4](https://tailwindcss.com/docs)
- [TanStack Query v5](https://tanstack.com/query/latest)
- [ofetch](https://github.com/unjs/ofetch)
- [nuqs](https://nuqs.dev/)
- [react-hook-form + zod](https://react-hook-form.com/get-started#SchemaValidation)
