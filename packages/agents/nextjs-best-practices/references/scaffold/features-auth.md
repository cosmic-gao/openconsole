# Scaffold —— `features/auth/` 鉴权切片(必装)

> 接外部登录回调的完整闭环:写 cookie / 读 session / 客户端拿 user / queryKey 工厂。
> 鉴权链流程图详见 [`../../../nextjs-auth-callback/references/auth-flow.md`](../../../nextjs-auth-callback/references/auth-flow.md)。

| # | 文件 | 用途 |
| --- | --- | --- |
| 44 | `features/auth/actions.ts` | `setSession` + `getMe` Server Actions |
| 45 | `features/auth/schemas.ts` | `Credentials` + `User` zod schemas |
| 46 | `features/auth/types.ts` | `Session` 类型 |
| 47 | `features/auth/components/sso-callback.tsx` | `<SsoCallback />` 客户端组件 |
| 48 | `features/auth/contexts/auth-context.tsx` | `<AuthProvider>` + `useQuery(getMe)` |
| 49 | `features/auth/hooks/use-auth.ts` | `useAuth()` 业务消费 |
| 50 | `features/auth/queries/keys.ts` | `authKeys` 工厂 |
| 51 | `features/auth/queries/options.ts` | `authQueries.me()` |
| 52 | `features/auth/server/session.ts` | `getSession()` + `getSessionHeaders()` |

---

## [44] `features/auth/actions.ts`

```ts
"use server";

import { cookies } from "next/headers";

import { siteConfig } from "@/config/site";
import { env } from "@/env";
import { request, safeUnwrap } from "@/lib/request";

import { Credentials, User } from "./schemas";
import type { User as UserType } from "./types";

function resolve(raw: string | undefined): string {
  if (!raw) return siteConfig.defaultRedirect;
  if (!raw.startsWith("/")) return siteConfig.defaultRedirect;

  if (raw.startsWith("//") || raw.startsWith("/\\")) {
    return siteConfig.defaultRedirect;
  }

  try {
    const parsed = new URL(raw, "http://_sentinel_/");
    if (parsed.host !== "_sentinel_") return siteConfig.defaultRedirect;
  } catch {
    return siteConfig.defaultRedirect;
  }
  return raw;
}

export async function setSession(input: unknown) {
  const { token, tenantCode } = Credentials.parse(input);

  const jar = await cookies();
  const isProd = process.env.NODE_ENV === "production";

  jar.set(env.COOKIE_TOKEN, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.COOKIE_TOKEN_MAX_AGE,
  });

  jar.set(env.COOKIE_TENANT_CODE, tenantCode, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: env.COOKIE_TOKEN_MAX_AGE,
  });

  const next = resolve(jar.get(env.COOKIE_CONTINUE)?.value);
  jar.delete(env.COOKIE_CONTINUE);

  return { next };
}

export async function getMe(): Promise<UserType> {
  return safeUnwrap(User, request("/web/um/sys/user/info"));
}
```

## [45] `features/auth/schemas.ts`

```ts
import { z } from "zod";

export const Credentials = z.object({
  token: z.string().min(20).max(4096),
  tenantCode: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/),
});

export type Credentials = z.infer<typeof Credentials>;

export const Role = z.object({
  id: z.string(),
  name: z.string(),
});

export type Role = z.infer<typeof Role>;

export const User = z.object({
  id: z.string(),
  username: z.string(),
  realName: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  headUrl: z.string().nullable(),
  mobile: z.string().nullable(),
  jobTitle: z.string().nullable(),
  status: z.number(),
  superAdmin: z.union([z.literal(0), z.literal(1)]),
  superTenant: z.union([z.literal(0), z.literal(1)]),
  timezoneId: z.string(),
  timezoneName: z.string(),
  timezoneOffset: z.string(),
  timeFormat: z.string(),
  tenantId: z.string(),
  tenantCode: z.string(),
  tenantName: z.string(),
  shortName: z.string(),
  tenantType: z.number(),
  tenantPackage: z.string(),
  tenantTimezoneId: z.string(),
  tenantTimezoneName: z.string(),
  tenantTimezoneOffset: z.string(),
  roleList: z.array(Role).nullable(),
});

export type User = z.infer<typeof User>;
```

## [46] `features/auth/types.ts`

```ts
export type { Credentials, Role, User } from "./schemas";

export type Session = {
  token: string;
  tenantCode: string;
};
```

## [47] `features/auth/components/sso-callback.tsx`

```tsx
"use client";

import { useEffect, useRef } from "react";

import { siteConfig } from "@/config/site";

import { setSession } from "../actions";

export function SsoCallback() {
  const consumed = useRef(false);

  useEffect(() => {
    if (consumed.current) return;
    consumed.current = true;

    const raw = window.location.hash.slice(1);
    if (!raw) {
      window.location.replace(siteConfig.defaultRedirect);
      return;
    }

    const params = new URLSearchParams(raw);
    const token = params.get("token");
    const tenantCode = params.get("tenant_code");
    if (!token || !tenantCode) {
      window.location.replace(siteConfig.defaultRedirect);
      return;
    }

    setSession({ token, tenantCode })
      .then(({ next }) => {
        history.replaceState(null, "", window.location.pathname);
        window.location.replace(next);
      })
      .catch(() => window.location.replace(siteConfig.defaultRedirect));
  }, []);

  return null;
}
```

## [48] `features/auth/contexts/auth-context.tsx`

```tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { createContext, useMemo, type ReactNode } from "react";

import { authQueries } from "../queries/options";
import type { User } from "../types";

export type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, refetch } = useQuery({
    ...authQueries.me(),
    retry: (failureCount, error) => {
      if (failureCount >= 1) return false;
      const status =
        (error as { status?: number; statusCode?: number })?.status ??
        (error as { statusCode?: number })?.statusCode;
      return status !== 401;
    },
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: data ?? null,
      isAuthenticated: !!data,
      isLoading,
      isError,
      refetch,
    }),
    [data, isLoading, isError, refetch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

## [49] `features/auth/hooks/use-auth.ts`

```ts
"use client";

import { useContext } from "react";

import {
  AuthContext,
  type AuthContextValue,
} from "../contexts/auth-context";

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within <AuthProvider>");
  return context;
}
```

## [50] `features/auth/queries/keys.ts`

```ts
export const authKeys = {
  all: () => ["auth"] as const,
  me: () => [...authKeys.all(), "me"] as const,
};
```

## [51] `features/auth/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getMe } from "../actions";
import { authKeys } from "./keys";

export const authQueries = {
  me: () =>
    queryOptions({
      queryKey: authKeys.me(),
      queryFn: getMe,
      staleTime: 5 * 60 * 1000,
    }),
};
```

## [52] `features/auth/server/session.ts`

```ts
import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { env } from "@/env";

import type { Session } from "../types";

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(env.COOKIE_TOKEN)?.value;
  const tenantCode = jar.get(env.COOKIE_TENANT_CODE)?.value;
  if (!token || !tenantCode) return null;
  return { token, tenantCode };
});

export async function getSessionHeaders(): Promise<Record<string, string>> {
  const session = await getSession();
  if (!session) return {};
  return {
    token: session.token,
    tenant_code: session.tenantCode,
  };
}
```

---

下一步:[`features-notes.md`](./features-notes.md) —— `features/notes/` 示例切片
