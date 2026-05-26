---
name: opentemplate
description: |
  企业内部 **AI 标准化开发模板** —— Next.js 16.2.6 + React 19.2.6 + Cache Components +
  Drizzle + Postgres + Redis + Nacos + SSO。本 skill 控制两件事：
  (a) **从零搭出与 `opentemplate` 一致的项目骨架**;(b) **后续开发严格遵守模板约定**
  —— 目录结构、依赖清单、UI 库白名单(只允许 `@openconsole/{atoms,shadcn}`)、登录
  跳转流程、错误页面、主题颜色 `#17b3a3`、Cache Components 数据层、Nacos 服务注册、
  Docker 本地依赖、env 校验。
  触发场景:用户说"做一个 X 项目 / 新建一个内部 APP / 从零搭骨架 / 初始化模板 /
  按模板开发 / 加一个 feature / 加一条路由 / 写 Server Action / 加错误页 / 改
  sidebar / 改主题色 / 接登录 / 加 BFF 调用 / 添加 DB 表",或在 review 时检查
  模板合规。涵盖通用 Next.js 写法时优先查 [`nextjs-best-practices`](../nextjs-best-practices/SKILL.md);
  涉及 SSO callback 实现细节查 [`nextjs-auth-callback`](../nextjs-auth-callback/SKILL.md)。
---

# Opentemplate — 企业内部 AI 标准化开发模板

## 这个 skill 干什么

**唯一目标**:让每个用 AI 生成的内部 APP 长得跟 [`oepntemplate`](https://github.com/your-org/oepntemplate) 一模一样。任何偏离都需要在 review 时退回。

两条作用线:

1. **从零生成**:用户说"做一个 X 项目"时,按 [`references/scaffold.md`](./references/scaffold.md) 逐文件 Write 出完整骨架。
2. **持续约束**:用户写新代码 / review 代码时,识别违反模板的写法并指出怎么改。

## 立刻先记住的 5 条硬规则

> 这 5 条放在最前面是因为 90% 的违规都集中在这。

1. **UI 库白名单**:只允许从 `@openconsole/atoms` 与 `@openconsole/shadcn` 导入组件。**禁止**直接 `pnpm add shadcn-ui` 或 `npx shadcn add` 或拷贝 shadcn 源码到 `components/ui/`。详见 [`references/ui-rules.md`](./references/ui-rules.md)。
2. **目录约定**:`app/` 只放路由,业务代码全部进 `features/<domain>/`。`lib/` 是基建(db / redis / query / request / logger)。**没有** `src/` / `shared/` / `components/`。详见 [`references/directory-structure.md`](./references/directory-structure.md)。
3. **登录流向固定**:未带 token 访问受保护路由 → `proxy.ts` 重定向到外部 SSO → SSO 把 token 拼到 hash 回 `/` → `<SsoCallback />` 调 `setSession` server action 写 cookie → `window.location.replace(next)` 跳转。**禁止**自己写 `getServerSession` / 手动读 cookie / 自实现 token 校验。详见 [`references/auth-flow.md`](./references/auth-flow.md)。
4. **数据层用 Cache Components**:`'use cache'` + `cacheTag` 在 `features/<domain>/_cached.ts`,Server Action 在 `features/<domain>/actions.ts` 里调 `updateTag(...)` 失效。`'use cache'` 函数里**禁用** cookies/headers/Date.now()/Math.random()。详见 [`references/data-layer.md`](./references/data-layer.md)。
5. **主题色 `#17b3a3`(oklch teal)**:已经写进 `@openconsole/shadcn/styles.css`,**不要**在项目里二次覆盖 `--primary`。要换品牌色就修 `@openconsole/shadcn`(影响所有项目)或在自己项目 `globals.css` 里通过 `@theme inline` 覆盖,绝不能写散落的 `style="color: ..."`。详见 [`references/theme.md`](./references/theme.md)。

## 从零初始化(空目录搭骨架)

### Step 1:用 AskUserQuestion 收集 3 个参数

```jsonc
{
  "questions": [
    {
      "question": "项目叫什么?写进 package.json 的 name 字段。",
      "header": "项目名",
      "options": [
        { "label": "opentemplate", "description": "默认值;直接克隆模板时用" },
        { "label": "my-app", "description": "示例,换成你的项目名" }
      ],
      "multiSelect": false
    },
    {
      "question": "项目对外的 service 名(注册到 Nacos / 出现在日志 tag)?",
      "header": "Service",
      "options": [
        { "label": "<项目名>", "description": "与 package.json name 一致;最常见" },
        { "label": "自定义", "description": "和项目名解耦,如 `my-app-bff`" }
      ],
      "multiSelect": false
    },
    {
      "question": "默认登录后跳哪里?写进 config/site.ts 的 defaultRedirect。",
      "header": "登录后页",
      "options": [
        { "label": "/dashboard", "description": "默认,与模板一致" },
        { "label": "自定义", "description": "比如 `/notes` / `/home`" }
      ],
      "multiSelect": false
    }
  ]
}
```

### Step 2:确认目录是空的

```bash
ls -la
```

允许的内容:`.git`、`.gitignore`、`README.md`。其它非空就停下来问用户。

### Step 3:按 [`references/scaffold.md`](./references/scaffold.md) 全文件 Write

**严格按片段内容**——只允许替换:

- `package.json` 的 `name` 字段 → Step 1 项目名
- `config/site.ts` 的 `name` / `defaultRedirect` → Step 1 + Step 3
- `.env.local` 的 `NACOS_PROVIDER_SERVICE` → Step 2
- `docker/docker-compose.yaml` 的 `container_name` → 用 `<项目名>-pgbouncer` / `<项目名>-nacos`
- `cache-handler.mjs` 的 `keyPrefix` → `<项目名>:cache:`

其它内容**一字不改**。每个文件的存在意义见 [`references/configs.md`](./references/configs.md) 与 [`references/directory-structure.md`](./references/directory-structure.md)。

### Step 4:本地依赖 + 装包 + 起服务

```bash
# 1. 拉起本地 Postgres + Redis + Nacos
docker compose -f docker/docker-compose.yaml up -d

# 2. 装包
pnpm install

# 3. 跑 Drizzle 迁移
pnpm db:push

# 4. 起开发服
pnpm dev
```

`pnpm install` 失败 90% 是 Node < 22.11 — 提示升级。
`db:push` 失败 90% 是 pgbouncer 没起来 — `docker compose logs pgbouncer` 看下。

### Step 5:验证骨架 + 报告

打开 `http://localhost:3000/dashboard` 应能看到:

- 顶栏 + 侧边栏(brand "Shadcn Admin"、菜单 Dashboard + Notes)
- 主题色是青绿色 `#17b3a3`(按钮、focus ring)
- 未登录会被 `proxy.ts` 重定向到 `NEXT_PUBLIC_AUTH_URL/login`

报告:

- 端口:3000
- 重要页面:`/dashboard` `/notes`
- 接下来怎么加 feature → [`references/features.md`](./references/features.md)

> ⚠️ **永远不要**用 `npx create-next-app` —— 它生成的目录约定跟本模板完全冲突。

## 持续开发约束(写新代码时)

| 想做 | 必读 |
| --- | --- |
| 加路由 / 加页面 | [`references/directory-structure.md`](./references/directory-structure.md) 的 `app/` 段 |
| 加业务模块(feature slice) | [`references/features.md`](./references/features.md) |
| 加数据库表 | [`references/data-layer.md`](./references/data-layer.md) 的 Drizzle 段 |
| 调 BFF / 外部 HTTP | [`references/data-layer.md`](./references/data-layer.md) 的 request envelope 段 |
| 加 Server Action / `'use cache'` | [`references/data-layer.md`](./references/data-layer.md) 的 Cache Components 段 |
| 加错误页 / 自定义 401/403/404/500 | [`references/error-pages.md`](./references/error-pages.md) |
| 改主题色 / 字体 / sidebar 配色 | [`references/theme.md`](./references/theme.md) |
| 改 sidebar 菜单 / brand | `config/sidebar.ts` —— 见 [`references/directory-structure.md`](./references/directory-structure.md) 的 `config/` 段 |
| 加新环境变量 | `env.ts` —— 见 [`references/configs.md`](./references/configs.md) 的 env 段 |
| 让外部服务能调本服务 | `.env.local` 的 `NACOS_PROVIDER_*` 段 —— 见 [`references/configs.md`](./references/configs.md) |
| 用 `client()` 调其他内部服务 | [`@openconsole/nacos`](https://npmjs.com/package/@openconsole/nacos) README |

## Code review 触发检查(对每个 PR 都过一遍)

- [ ] 没有从 `@radix-ui/*` / `shadcn-ui` / 拷贝出的 `components/ui/` 直接导入(只允许通过 `@openconsole/{atoms,shadcn}` 间接使用)
- [ ] `app/<route>/` 里没有业务逻辑 —— 业务全在 `features/<domain>/`
- [ ] Server Action 文件首行 `"use server"`;`'use cache'` 函数不读 cookies/headers/Date.now/Math.random
- [ ] Server Action 中操作用户数据前没漏 `protect()` / session 检查
- [ ] 新加的 `env` 变量在 `env.ts` 双写(schema + runtimeEnv 映射,client 端变量必须有)
- [ ] form 用 react-hook-form + zod,**两端**(client + Server Action)都校验
- [ ] 图片用 `next/image`,新增外部 host 加进 `next.config.ts` 的 `images.remotePatterns`
- [ ] icon 用 `lucide-react`(组件代码直接 import,配置文件传 PascalCase 字符串)
- [ ] table / list / filter 用 nuqs 走 URL,不是 `useState`
- [ ] 客户端缓存只用 `@tanstack/react-query`,**禁止** SWR
- [ ] `'use client'` 文件不导 `async function`
- [ ] 错误页用 `@openconsole/atoms` 的 `<Unauthorized/Forbidden/NotFound/ServerError/Maintenance>`,不要自己画

## 完整索引

| 文件 | 何时查 |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | 想一次性看完所有约束 / 给 AI 建立全局上下文 |
| [`references/scaffold.md`](./references/scaffold.md) | 初始化时逐文件 Write 的蓝本 |
| [`references/directory-structure.md`](./references/directory-structure.md) | 每个目录干什么、能放什么、不能放什么 |
| [`references/configs.md`](./references/configs.md) | `env.ts` / `next.config.ts` / `proxy.ts` / `instrumentation.ts` / `cache-handler.mjs` / `drizzle.config.ts` / `tsconfig.json` / `postcss.config.mjs` / `.env.local` 每一项的作用 |
| [`references/ui-rules.md`](./references/ui-rules.md) | UI 库白名单、组件导入约定、不准做什么 |
| [`references/theme.md`](./references/theme.md) | 品牌色、字体、布局、明暗主题、防闪烁 |
| [`references/auth-flow.md`](./references/auth-flow.md) | proxy → SSO → callback → setSession 完整链路 |
| [`references/data-layer.md`](./references/data-layer.md) | DB / Redis / request envelope / Cache Components / TanStack Query |
| [`references/error-pages.md`](./references/error-pages.md) | 5 个错误页 + Next 16 auth interrupts |
| [`references/features.md`](./references/features.md) | 加新 feature slice 的标准目录 + 文件 |
| [`references/checklist.md`](./references/checklist.md) | 提交 / review 前自检 |

## 跨 skill 协作

| 场景 | 跳到 |
| --- | --- |
| 一般 Next.js 写法(Suspense / Promise.all / nuqs / form) | [`nextjs-best-practices`](../nextjs-best-practices/SKILL.md) |
| SSO callback 内部实现细节 | [`nextjs-auth-callback`](../nextjs-auth-callback/SKILL.md) |
| TanStack Query 标准结构 | [`tanstack-query`](../tanstack-query/SKILL.md) |
| 改 `@openconsole/atoms` / `@openconsole/shadcn` 源码 | 对应包的 README(`packages/atoms/README.md` / `packages/shadcn/README.md`) |
| 写新 UI 组件(没法用现有原语拼出来) | [`ui`](../ui/SKILL.md) + [`web-design-guidelines`](../web-design-guidelines/SKILL.md) |
| React 组合 / 性能 / 重渲优化 | [`vercel-composition-patterns`](../vercel-composition-patterns/SKILL.md) + `nextjs-best-practices/references/` |
