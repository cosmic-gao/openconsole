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
 * Props shared by every error page. The five named components below
 * (`Unauthorized`, `Forbidden`, `NotFound`, `ServerError`, `Maintenance`)
 * accept these as a partial — anything you pass overrides the canonical
 * default for that HTTP code.
 */
export interface ErrorPageProps {
  /** Large status code rendered above the title. */
  status?: ReactNode;
  /** Short heading (rendered as `<h1>`). */
  title?: string;
  /** Optional longer explanation rendered as body copy. */
  description?: string;
  /** Icon rendered above the status. */
  icon?: ReactNode;
  /** Action row rendered below the description. */
  actions?: ReactNode;
  /** Wrapper className override. */
  className?: string;
}

/**
 * Shared layout used by every named error component. Centered in the
 * viewport with `min-h-svh`; pass `className` to embed inside a smaller
 * container.
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
 * Default action row — "Go back" (router.back) + "Go home" (Link to `/`).
 * Pre-wired into each named error component; override via `actions`.
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

/**
 * 401 Unauthorized — sign-in required. Default icon `LockKeyhole`.
 */
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

/**
 * 403 Forbidden — authenticated but lacks permission. Default icon `Ban`.
 */
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

/**
 * 404 Not Found — page doesn't exist or was moved. Default icon
 * `FileQuestion`.
 */
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

/**
 * 500 Internal Server Error — generic 5xx. Default icon `ServerCrash`.
 */
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

/**
 * 503 Maintenance — service temporarily unavailable. Default icon
 * `Construction`.
 */
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
