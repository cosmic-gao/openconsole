"use client";

import {
  Ban,
  ChevronLeft,
  Construction,
  FileQuestion,
  Home,
  LockKeyhole,
  ServerCrash,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { Button, cn } from "@openconsole/shadcn";

/**
 * 错误页通用 props。下面五个命名组件（{@link Unauthorized} /
 * {@link Forbidden} / {@link NotFound} / {@link ServerError} /
 * {@link Maintenance}）接收本接口作为 Partial —— 传入的字段会覆盖对应
 * HTTP 状态码的规范默认值。
 */
export interface ErrorPageProps {
  /** 渲染在标题上方的大号状态码。 */
  status?: ReactNode;
  /** 短标题（`<h1>`）。 */
  title?: string;
  /** 标题下方的更长说明。 */
  description?: string;
  /** 状态码上方的图标。 */
  icon?: ReactNode;
  /** 描述下方的操作按钮行。 */
  actions?: ReactNode;
  /** 外层 wrapper 的 className 覆盖。 */
  className?: string;
}

/**
 * 所有命名错误组件共享的版式。
 *
 * 视口居中 + `min-h-svh`；嵌入小容器时通过 `className` 覆盖外层尺寸。
 */
function Page({
  status,
  title,
  description,
  icon,
  actions,
  className,
}: ErrorPageProps) {
  return (
    <div
      className={cn(
        "flex min-h-svh items-center justify-center p-6",
        className,
      )}
    >
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        {icon}
        {status && (
          <div className="text-foreground text-7xl font-bold tracking-tighter">
            {status}
          </div>
        )}
        {title && (
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        )}
        {description && (
          <p className="text-muted-foreground text-balance">{description}</p>
        )}
        {actions && (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 默认操作行 —— "返回上一页"（`router.back()`）+ "回到首页"（`/`）。
 * 已预接到每个命名错误组件；要替换通过 `actions` prop 传入。
 */
function DefaultActions() {
  const router = useRouter();
  return (
    <>
      <Button
        variant="outline"
        onClick={() => router.back()}
        className="cursor-pointer"
      >
        <ChevronLeft />
        Go back
      </Button>
      <Button asChild className="cursor-pointer">
        <Link href="/">
          <Home />
          Go home
        </Link>
      </Button>
    </>
  );
}

/** 401 Unauthorized —— 需要登录才能访问。默认图标 `LockKeyhole`。 */
export function Unauthorized(props: ErrorPageProps = {}) {
  return (
    <Page
      status="401"
      title="Unauthorized"
      description="You need to sign in to access this page."
      icon={<LockKeyhole className="text-muted-foreground size-12" />}
      actions={<DefaultActions />}
      {...props}
    />
  );
}

/** 403 Forbidden —— 已登录但无权限。默认图标 `Ban`。 */
export function Forbidden(props: ErrorPageProps = {}) {
  return (
    <Page
      status="403"
      title="Access denied"
      description="You don't have permission to view this page."
      icon={<Ban className="text-muted-foreground size-12" />}
      actions={<DefaultActions />}
      {...props}
    />
  );
}

/** 404 Not Found —— 页面不存在或已迁移。默认图标 `FileQuestion`。 */
export function NotFound(props: ErrorPageProps = {}) {
  return (
    <Page
      status="404"
      title="Page not found"
      description="The page you're looking for doesn't exist or has moved."
      icon={<FileQuestion className="text-muted-foreground size-12" />}
      actions={<DefaultActions />}
      {...props}
    />
  );
}

/** 500 Internal Server Error —— 通用 5xx。默认图标 `ServerCrash`。 */
export function ServerError(props: ErrorPageProps = {}) {
  return (
    <Page
      status="500"
      title="Something went wrong"
      description="An unexpected error occurred. Please try again later."
      icon={<ServerCrash className="text-muted-foreground size-12" />}
      actions={<DefaultActions />}
      {...props}
    />
  );
}

/** 503 Maintenance —— 服务临时不可用。默认图标 `Construction`。 */
export function Maintenance(props: ErrorPageProps = {}) {
  return (
    <Page
      status="503"
      title="Under maintenance"
      description="We're making improvements. Please check back in a bit."
      icon={<Construction className="text-muted-foreground size-12" />}
      actions={<DefaultActions />}
      {...props}
    />
  );
}
