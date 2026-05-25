# 项目初始化 — 公司内部项目骨架模板

## 文件清单

按下面顺序创建（顺序不影响功能，但按层次创建便于核对）。每个 `###` 标题下的代码块就是该路径的完整内容。

scaffold 输出**只包含 APP 本身的工作文件**：

```
<project-root>/
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
├── pnpm-workspace.yaml
├── .gitignore
├── .env.example
├── env.ts
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── dashboard/
│       ├── layout.tsx
│       └── page.tsx
├── config/
│   └── sidebar.ts
└── public/
    └── .gitkeep
```

**不生成**：`STRUCTURE.md`、`AGENTS.md`、`features/README.md`、`lib/README.md`、`docker-compose.nacos.yml`、`skills/` 等元文档/测试设施——它们是本 skill 仓库自己的开发设施，**不属于** scaffold 出来的应用。`features/` 和 `lib/` 目录在用户第一次加 feature / 基建时再创建。

---

### 根目录配置

#### `package.json`

> `package.json` 的 `"name"` 字段已由用户在 Step 1 填写，以下保持默认。

```json
{
  "name": "<项目名占位符，实际为用户在 Step 1 填写的项目名>",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "format": "prettier --write ."
  },
  "dependencies": {
    "@hookform/resolvers": "^5.2.2",
    "@openconsole/atoms": "0.0.8",
    "@openconsole/nacos": "^0.0.1",
    "@openconsole/shadcn": "0.0.1",
    "@t3-oss/env-nextjs": "^0.13.11",
    "@tanstack/react-table": "^8.21.3",
    "cmdk": "^1.1.1",
    "date-fns": "^4.2.1",
    "embla-carousel-react": "^8.6.0",
    "input-otp": "^1.4.2",
    "lucide-react": "^1.16.0",
    "nacos": "^2.6.0",
    "next": "16.2.6",
    "next-themes": "^0.4.6",
    "nextjs-toploader": "^3.9.17",
    "nuqs": "^2.8.9",
    "radix-ui": "latest",
    "react": "19.2.6",
    "react-day-picker": "^9.14.0",
    "react-dom": "19.2.6",
    "react-hook-form": "^7.76.0",
    "react-resizable-panels": "^4.11.1",
    "recharts": "3.8.0",
    "server-only": "^0.0.1",
    "sonner": "^2.0.7",
    "tw-animate-css": "^1.4.0",
    "vaul": "^1.1.2",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@types/node": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "eslint": "^10.4.0",
    "eslint-config-next": "16.2.6",
    "prettier": "^3.8.3",
    "tailwindcss": "^4.3.0",
    "typescript": "^6.0.3"
  },
  "packageManager": "pnpm@9.0.0"
}
```

#### `next.config.ts`

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 单二进制部署：node .next/standalone/server.js
  output: "standalone",

  // @openconsole/* 是源码包，必须 transpile
  transpilePackages: [
    "@openconsole/shadcn",
    "@openconsole/atoms",
    "@openconsole/nacos",
  ],

  // nacos 客户端是 Node-only（用了 net/dgram），不能让 Next 尝试 bundle
  serverExternalPackages: ["nacos"],

  // 外部图片域白名单——加 next/image 远程图源时在这里加
  images: {
    remotePatterns: [
      // { protocol: "https", hostname: "cdn.example.com" },
    ],
  },

  // React 19 Compiler：未开启
  // experimental: { reactCompiler: true },

  // 'use cache' 范式：未启用
  // experimental: { cacheComponents: true },
};

export default nextConfig;
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### `postcss.config.mjs`

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

#### `pnpm-workspace.yaml`

```yaml
# pnpm 9 默认会拦截发布不足 7 天的包。@openconsole/* 是 0.x 私有包，
# 经常打新版本——这里把它们加白名单。
minimumReleaseAge: 0
minimumReleaseAgeExclude:
  - "@openconsole/*"

# 默认禁止包跑 install/postinstall 脚本——这里给 next 开权限
# （swc 二进制要靠 postinstall 装）
allowBuild:
  - next
  - "@tailwindcss/oxide"
  - sharp
```

#### `.gitignore`

```
# dependencies
node_modules/
.pnp
.pnp.*
.yarn/*
!.yarn/patches
!.yarn/plugins
!.yarn/releases
!.yarn/versions

# testing
coverage/

# next.js
.next/
out/

# production
build/

# misc
.DS_Store
*.pem

# debug
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*

# env files (keep .env.example, ignore real envs)
.env
.env.local
.env.*.local

# vercel
.vercel

# typescript
*.tsbuildinfo
next-env.d.ts
```

#### `.env.example`

```
# 装登录回调（nextjs-auth-callback skill）后，这两个变量会变成必填：
# NEXT_PUBLIC_AUTH_URL=https://your-idp.example.com
# NEXT_PUBLIC_APP_URL=http://localhost:3000

# CI 跳过 env 校验（不建议本地用）
# SKIP_ENV_VALIDATION=1
```

#### `env.ts`

```ts
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * 运行时环境变量校验。新增变量必须双写：
 *   1. 在对应 server/client schema 里加 zod 字段
 *   2. 在 runtimeEnv 里加 process.env 映射
 * 少一边就静默失效。
 *
 * NEXT_PUBLIC_* 变量在构建期 inline，需要在 runtimeEnv 显式列出。
 *
 * 装了 nextjs-auth-callback skill 之后会合并 NEXT_PUBLIC_AUTH_URL +
 * NEXT_PUBLIC_APP_URL —— 由那个 skill 负责改这个文件。
 */
export const env = createEnv({
  server: {
    // SERVICE_TOKEN: z.string().min(1),
    // DATABASE_URL: z.url(),
  },
  client: {
    // NEXT_PUBLIC_API_URL: z.url(),
  },
  runtimeEnv: {
    // SERVICE_TOKEN: process.env.SERVICE_TOKEN,
    // DATABASE_URL: process.env.DATABASE_URL,
    // NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  emptyStringAsUndefined: true,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
```

---

### app/ 骨架

#### `app/globals.css`

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";

@theme inline {
  /* next/font 暴露的 CSS 变量 → 给 Tailwind 用 */
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}
```

#### `app/layout.tsx`

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Manrope } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "sonner";

import { FontProvider, ThemeProvider } from "@openconsole/atoms";

import "./globals.css";

/**
 * Root layout 装的 provider 链：
 *   ThemeProvider (next-themes, 控制 light/dark)
 *     └─ FontProvider (@openconsole/atoms, 控制字体切换)
 *         └─ NuqsAdapter (URL state)
 *             └─ NextTopLoader (路由切换顶部进度条)
 *                 └─ <Toaster /> (sonner 全局 toast)
 *
 * 4 个字体先全部载好——FontProvider 通过修改 <html> 的 class 在它们之间切换。
 * 单页不该再载额外字体。
 */

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Shadcn Admin",
  description: "Admin dashboard built with Next.js + shadcn",
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // suppressHydrationWarning：FontProvider boot 脚本在 hydrate 前改 <html> 的 class
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${manrope.variable}`}
    >
      <head>
        {/* React 渲染前读 localStorage 的字体偏好，避免字体闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var f = localStorage.getItem('ui-font');
                if (f) document.documentElement.classList.add('font-' + f);
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <FontProvider>
            <NuqsAdapter>
              <NextTopLoader showSpinner={false} />
              {children}
              <Toaster richColors position="top-right" />
            </NuqsAdapter>
          </FontProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

#### `app/page.tsx`

```tsx
import { redirect } from "next/navigation";

/**
 * 根路径：直接跳 /dashboard。
 *
 * 装 nextjs-auth-callback skill 后，这里会被改造成：
 *   1. 渲染 <Callback /> 接住 fragment 里的 token
 *   2. 用 auth() 判断是否已登录，已登录就 redirect 到 /dashboard
 * 在此之前只是个 redirect。
 */
export default function Home() {
  redirect("/dashboard");
}
```

#### `app/dashboard/layout.tsx`

```tsx
import { Suspense } from "react";

import {
  Header,
  LayoutProvider,
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from "@openconsole/atoms";

import { siderConfig } from "@/config/sidebar";

/**
 * Dashboard layout —— 给所有 /dashboard/* 路由套 sidebar + header。
 *
 * `account` 先用 guest 常量；装 nextjs-auth-callback skill 后会改成
 * `await auth()` 读真实 session。
 *
 * <Header /> 用 useSearchParams，必须包 <Suspense> 否则 Next 16 抛 CSR bailout。
 */

const GUEST_ACCOUNT = {
  name: "Guest User",
  email: "guest@example.com",
};

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <LayoutProvider>
      <SidebarProvider>
        <Sidebar
          brand={siderConfig.brand}
          menu={siderConfig.menu}
          account={GUEST_ACCOUNT}
        />
        <SidebarInset>
          <Suspense>
            <Header />
          </Suspense>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </LayoutProvider>
  );
}
```

#### `app/dashboard/page.tsx`

```tsx
import { LayoutDashboard } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-12">
      <LayoutDashboard className="text-muted-foreground size-12" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold">欢迎进入 Dashboard</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          这是项目骨架的默认欢迎页。在 <code>features/</code> 下新建业务切片，
          在 <code>app/dashboard/&lt;name&gt;/</code> 加路由即可开发。
        </p>
      </div>
    </main>
  );
}
```

---

### config / public

#### `config/sidebar.ts`

```ts
import type { SidebarProps } from "@openconsole/atoms";

/**
 * Sidebar 静态配置 —— brand + menu。
 *
 * ⚠️ `icon` 字段必须是 PascalCase **字符串**（要序列化过 RSC 边界），
 *    不能传 lucide-react 的 React 组件本身。Sidebar 内部会按字符串解析。
 *
 * 改菜单只改这一个文件——别在组件里硬编码。
 */
export const siderConfig: Pick<SidebarProps, "brand" | "menu"> = {
  brand: {
    name: "Shadcn Admin",
    icon: "Command",
    href: "/dashboard",
  },
  menu: [
    {
      label: "工作区",
      items: [
        {
          title: "Dashboard",
          icon: "LayoutDashboard",
          href: "/dashboard",
        },
      ],
    },
  ],
};
```

#### `public/.gitkeep`

空文件，占位用。用户后续会放 `favicon.png` 等——直接 `Write` 一个空内容即可。

---

## 常见问题

**`pnpm install` 报 minimum release age**：确认 `pnpm-workspace.yaml` 里有 `minimumReleaseAgeExclude: ["@openconsole/*"]`。

**Tailwind 样式没出来**：检查三件事——
1. `app/globals.css` 第一行 `@import "tailwindcss";`
2. `postcss.config.mjs` 配了 `@tailwindcss/postcss`
3. `app/layout.tsx` 里 `import "./globals.css";`

**`import "@/..." Cannot find module`**：确认 `tsconfig.json` 有 `"paths": { "@/*": ["./*"] }`。

**想跳过登录直接进 dashboard**：本 skill 不创建 `proxy.ts`——不调 `nextjs-auth-callback` 时所有路径都没鉴权，可直接访问。

---

## 验收清单

搭完跟用户对一遍：

- [ ] `pnpm install` 无报错
- [ ] `pnpm dev` 起在 http://localhost:3000
- [ ] 访问 `/` 自动跳 `/dashboard`
- [ ] dashboard 显示 sidebar + 欢迎页，sidebar 底部 "Guest User"
- [ ] `pnpm build` 能跑通
- [ ] `tsconfig.json` 有 `"paths": { "@/*": ["./*"] }`
- [ ] `next.config.ts` 有 `transpilePackages: ["@openconsole/shadcn", "@openconsole/atoms", "@openconsole/nacos"]`
- [ ] 根目录平铺没有 `src/`
