# Scaffold —— `app/` 路由

> App Router 目录:全局样式 + 根布局 + SSO 落点 + 错误页 + Dashboard 路由组 + (errors) 路由组 + API health。

文件清单:

| # | 文件 | 用途 |
| --- | --- | --- |
| 13 | `app/globals.css` | Tailwind v4 入口 + 字体 token |
| 14 | `app/layout.tsx` | 根布局,全局 Provider 链 |
| 15 | `app/page.tsx` | `<SsoCallback />` 接收 token |
| 15b | `app/loading.tsx` | 全局 Suspense fallback(Lottie) |
| 16 | `app/error.tsx` | segment error boundary |
| 17 | `app/global-error.tsx` | root layout 崩了的兜底 |
| 18 | `app/not-found.tsx` | 404 |
| 19 | `app/unauthorized.tsx` | 401 |
| 20 | `app/forbidden.tsx` | 403 |
| 21 | `app/(dashboard)/layout.tsx` | Dashboard 骨架(Sidebar + Header) |
| 22 | `app/(dashboard)/dashboard/page.tsx` | 首页 |
| 23 | `app/(dashboard)/notes/page.tsx` | Notes 示范页 |
| 24-28 | `app/(errors)/*/page.tsx` | 直接可访问的错误页 |
| 29 | `app/api/health/route.ts` | k8s 健康检查 |

---

## [13] `app/globals.css`

```css
@import "tailwindcss";
@import "@openconsole/shadcn/styles.css";
@import "@openconsole/atoms/styles.css";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-inter: var(--font-inter);
  --font-manrope: var(--font-manrope);
}
```

## [14] `app/layout.tsx`

```tsx
import "./globals.css";

import { FontProvider, ThemeProvider } from "@openconsole/atoms";
import { Toaster } from "@openconsole/shadcn";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Manrope } from "next/font/google";
import NextToploader from "nextjs-toploader";
import { NuqsAdapter } from "nuqs/adapters/next/app";

import { siteConfig } from "@/config/site";
import { QueryProvider } from "@/lib/query";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: siteConfig.name,
  description: siteConfig.description,
  icons: { icon: "/favicon.png" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="font-inter" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var font = localStorage.getItem('openconsole-font');
                  if (font && ['inter', 'manrope', 'system'].includes(font)) {
                    document.documentElement.classList.remove('font-inter');
                    document.documentElement.classList.add('font-' + font);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${manrope.variable} antialiased`}
      >
        <NuqsAdapter>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <FontProvider>
              <QueryProvider>
                <NextToploader color="var(--primary)" showSpinner={false} />
                {children}
                <Toaster />
              </QueryProvider>
            </FontProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
```

## [15] `app/page.tsx`

```tsx
import { SsoCallback } from "@/features/auth/components/sso-callback";

export default function Home() {
  return <SsoCallback />;
}
```

## [15b] `app/loading.tsx`

> 全局 Suspense fallback —— 任何 route 流式渲染时显示这个 Lottie 动画。

```tsx
"use client";

import { DotLottieReact } from "@lottiefiles/dotlottie-react";

// Root-level loading UI — Next.js renders this as the Suspense fallback
// whenever any route in app/ is streaming. The player is "use client" by
// necessity (canvas / DOM), but that's fine: loading.tsx is purely a
// fallback, not a streaming surface itself.
//
// Animation source: public/loading.json (Lottie JSON format). To swap, drop
// a new file into public/ and update `src` (DotLottieReact accepts both
// `.lottie` and `.json`).
export default function Loading() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center">
      <DotLottieReact
        src="/loading.json"
        loop
        autoplay
        className="size-48"
      />
    </div>
  );
}
```

## [16] `app/error.tsx`

```tsx
"use client";

import { ServerError } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:error]", error);
  }, [error]);

  return (
    <ServerError
      description={
        error.message ||
        "An unexpected error occurred. Please try again later."
      }
      actions={
        <Button onClick={reset} className="cursor-pointer">
          <RotateCcw />
          Try again
        </Button>
      }
    />
  );
}
```

## [17] `app/global-error.tsx`

```tsx
"use client";

import { ServerError } from "@openconsole/atoms";
import { Button } from "@openconsole/shadcn";
import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app:global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <ServerError
          description={
            error.message ||
            "An unexpected error occurred. Please try again later."
          }
          actions={
            <Button onClick={reset} className="cursor-pointer">
              <RotateCcw />
              Try again
            </Button>
          }
        />
      </body>
    </html>
  );
}
```

## [18] `app/not-found.tsx`

```tsx
import { NotFound } from "@openconsole/atoms";

export default function NotFoundPage() {
  return <NotFound />;
}
```

## [19] `app/unauthorized.tsx`

```tsx
import { Unauthorized } from "@openconsole/atoms";

export default function UnauthorizedPage() {
  return <Unauthorized />;
}
```

## [20] `app/forbidden.tsx`

```tsx
import { Forbidden } from "@openconsole/atoms";

export default function ForbiddenPage() {
  return <Forbidden />;
}
```

## [21] `app/(dashboard)/layout.tsx`

```tsx
import {
  Header,
  LayoutProvider,
  Sidebar,
  SidebarProvider,
} from "@openconsole/atoms";
import { SidebarInset } from "@openconsole/shadcn";
import { Suspense } from "react";

import { siderConfig } from "@/config/sidebar";
import { AuthProvider } from "@/features/auth/contexts/auth-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LayoutProvider>
        <SidebarProvider>
          <Sidebar brand={siderConfig.brand} menu={siderConfig.menu} />
          <SidebarInset>
            <Suspense>
              <Header />
            </Suspense>
            <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </LayoutProvider>
    </AuthProvider>
  );
}
```

## [22] `app/(dashboard)/dashboard/page.tsx`

```tsx
"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openconsole/shadcn";
import { Database, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { useAuth } from "@/features/auth/hooks/use-auth";

export default function DashboardPage() {
  const { user } = useAuth();
  const name = user?.realName || user?.username || "there";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-4">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {name}.
        </h1>
        <p className="text-muted-foreground text-base">{siteConfig.description}</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/notes"
          icon={<NotebookPen className="size-5" />}
          title="Notes"
          description="CRUD demo backed by Drizzle + Postgres, cached with updateTag invalidation."
        />
        <QuickLink
          href="https://nextjs.org/docs/app/getting-started/caching-and-revalidating"
          icon={<Sparkles className="size-5" />}
          title="Cache Components"
          description="See how 'use cache', cacheTag, and cacheLife shape the data layer."
          external
        />
        <QuickLink
          href="https://orm.drizzle.team/docs/overview"
          icon={<Database className="size-5" />}
          title="Drizzle ORM"
          description="Schema, migrations, and typed queries — the source of truth for the DB."
          external
        />
      </section>
    </div>
  );
}

type QuickLinkProps = {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  external?: boolean;
};

function QuickLink({ href, icon, title, description, external }: QuickLinkProps) {
  const linkProps = external ? { target: "_blank", rel: "noreferrer" as const } : {};
  return (
    <Link href={href} {...linkProps} className="group">
      <Card className="hover:border-primary/40 h-full transition-colors">
        <CardHeader>
          <div className="text-muted-foreground group-hover:text-foreground bg-muted flex size-9 items-center justify-center rounded-md transition-colors">
            {icon}
          </div>
          <CardTitle className="mt-3">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </Link>
  );
}
```

## [23] `app/(dashboard)/notes/page.tsx`

```tsx
import { Suspense } from "react";

import { listNotes } from "@/features/notes/actions";
import { NotesTable } from "@/features/notes/components/notes-table";

export const metadata = {
  title: "Notes",
};

export default function NotesPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Notes</h1>
        <p className="text-muted-foreground text-sm">
          Create, edit, and remove notes — persisted in Postgres via Drizzle.
        </p>
      </header>

      <Suspense fallback={<NotesSkeleton />}>
        <NotesShell />
      </Suspense>
    </div>
  );
}

async function NotesShell() {
  const data = await listNotes();
  return (
    <div className="space-y-4">
      <NotesTable initialData={data} />
    </div>
  );
}

function NotesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-muted h-10 animate-pulse rounded-md" />
      <div className="bg-muted h-64 animate-pulse rounded-md" />
    </div>
  );
}
```

## [24-28] `app/(errors)/*/page.tsx`

```tsx
// app/(errors)/error/page.tsx
import { ServerError } from "@openconsole/atoms";
export const metadata = { title: "500 — Internal Server Error" };
export default function ServerErrorPage() { return <ServerError />; }

// app/(errors)/forbidden/page.tsx
import { Forbidden } from "@openconsole/atoms";
export const metadata = { title: "403 — Forbidden" };
export default function ForbiddenPage() { return <Forbidden />; }

// app/(errors)/maintenance/page.tsx
import { Maintenance } from "@openconsole/atoms";
export const metadata = { title: "503 — Maintenance" };
export default function MaintenancePage() { return <Maintenance />; }

// app/(errors)/not-found/page.tsx
import { NotFound } from "@openconsole/atoms";
export const metadata = { title: "404 — Not Found" };
export default function NotFoundPage() { return <NotFound />; }

// app/(errors)/unauthorized/page.tsx
import { Unauthorized } from "@openconsole/atoms";
export const metadata = { title: "401 — Unauthorized" };
export default function UnauthorizedPage() { return <Unauthorized />; }
```

## [29] `app/api/health/route.ts`

```ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}
```

---

下一步:[`config.md`](./config.md) —— 静态配置(site / sidebar)
