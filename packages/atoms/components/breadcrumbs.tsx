"use client";

import Link from "next/link";
import { Fragment, type MouseEvent, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
} from "@openconsole/shadcn";

import { useBreadcrumbs, type Crumb } from "../hooks/use-breadcrumbs";

/** crumb 点击回调;`index` 为其在最终链中的下标。 */
export type BreadcrumbClickAction = (crumb: Crumb, index: number, event: MouseEvent<HTMLElement>) => void;

export interface BreadcrumbsProps {
  /** 显式 crumb 链;省略则按 `usePathname()` 自动派生。 */
  items?: Crumb[];
  /** 固定首项,始终可见、不参与折叠(如工作台入口 / 工作区切换器)。 */
  leading?: Crumb;
  /** 自定义分隔符;默认 shadcn 的 ChevronRight。 */
  separator?: ReactNode;
  /** 中间项在 `< md` 屏隐藏以保持紧凑;默认 `true`。 */
  compact?: boolean;
  /** 超过则把中间项折叠进省略号下拉(`>= 2` 生效),首项与当前页始终保留。 */
  maxItems?: number;
  /** 每个可点击 crumb 的全局点击回调(在各自 `onClick` 之后);当前页不触发。 */
  onItemClick?: BreadcrumbClickAction;
  className?: string;
}

type Indexed = { crumb: Crumb; index: number };
type Slot = { kind: "crumb"; crumb: Crumb; index: number } | { kind: "ellipsis"; hidden: Indexed[] };

function CrumbBody({ crumb }: { crumb: Crumb }) {
  return (
    <>
      {crumb.icon && <Icon name={crumb.icon} className="size-3.5 shrink-0" />}
      {crumb.label}
    </>
  );
}

/** 单条 crumb:当前页 → 不可点击;`href` → 链接;`onClick` → 按钮;否则纯标签。 */
function CrumbNode({
  crumb,
  current,
  onClick,
}: {
  crumb: Crumb;
  current: boolean;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
}) {
  const inline = "inline-flex items-center gap-1.5";
  const body = <CrumbBody crumb={crumb} />;
  if (current) return <BreadcrumbPage className={inline}>{body}</BreadcrumbPage>;
  if (crumb.href !== undefined || crumb.onClick) {
    return (
      <BreadcrumbLink asChild>
        {crumb.href !== undefined ? (
          <Link href={crumb.href} onClick={onClick} className={inline}>
            {body}
          </Link>
        ) : (
          <button type="button" onClick={onClick} className={cn(inline, "cursor-pointer")}>
            {body}
          </button>
        )}
      </BreadcrumbLink>
    );
  }
  return <span className={inline}>{body}</span>;
}

/** 被折叠的中间项,收进省略号下拉。 */
function EllipsisMenu({
  hidden,
  handlerFor,
}: {
  hidden: Indexed[];
  handlerFor: (crumb: Crumb, index: number) => ((event: MouseEvent<HTMLElement>) => void) | undefined;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="hover:text-foreground flex items-center gap-1"
        aria-label="Show collapsed breadcrumbs"
      >
        <BreadcrumbEllipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {hidden.map(({ crumb, index }) => {
          const onClick = handlerFor(crumb, index);
          const interactive = crumb.href !== undefined || Boolean(crumb.onClick);
          const body = <CrumbBody crumb={crumb} />;
          return (
            <DropdownMenuItem key={crumb.id ?? `c-${index}`} asChild={interactive} disabled={!interactive}>
              {crumb.href !== undefined ? (
                <Link href={crumb.href} onClick={onClick} className="flex items-center gap-2">
                  {body}
                </Link>
              ) : crumb.onClick ? (
                <button type="button" onClick={onClick} className="flex w-full items-center gap-2">
                  {body}
                </button>
              ) : (
                <span className="flex items-center gap-2">{body}</span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * 面包屑导航。默认按 `usePathname()` 自动派生;传 `items` 渲染自定义链。
 * `leading` 固定首项,`maxItems` 折叠中间项,`onItemClick` 全局接管点击。
 */
export function Breadcrumbs({
  items,
  leading,
  separator,
  compact = true,
  maxItems,
  onItemClick,
  className,
}: BreadcrumbsProps) {
  const derived = useBreadcrumbs();
  const crumbs = leading ? [leading, ...(items ?? derived)] : (items ?? derived);
  if (crumbs.length === 0) return null;

  const last = crumbs.length - 1;
  const isCurrent = (crumb: Crumb, i: number) => crumb.current ?? i === last;
  const handlerFor = (crumb: Crumb, i: number) =>
    crumb.onClick || onItemClick
      ? (event: MouseEvent<HTMLElement>) => {
          crumb.onClick?.(event);
          onItemClick?.(crumb, i, event);
        }
      : undefined;

  // maxItems 折叠:首项 + 末 (maxItems - 1) 项,中间收进省略号。
  const limit = typeof maxItems === "number" && maxItems >= 2 ? maxItems : 0;
  const indexed: Indexed[] = crumbs.map((crumb, index) => ({ crumb, index }));
  const collapse = limit > 0 && indexed.length > limit;
  const slots: Slot[] = [];
  if (collapse) {
    const head = indexed[0];
    if (head) slots.push({ kind: "crumb", ...head });
    slots.push({ kind: "ellipsis", hidden: indexed.slice(1, indexed.length - (limit - 1)) });
    for (const item of indexed.slice(indexed.length - (limit - 1))) slots.push({ kind: "crumb", ...item });
  } else {
    for (const item of indexed) slots.push({ kind: "crumb", ...item });
  }

  // 紧凑模式(非折叠):移动端隐藏中间项,首 / 末始终可见。
  const mobileHidden = (i: number) =>
    compact && !collapse && i !== 0 && i !== last ? "hidden md:block" : undefined;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {slots.map((slot, i) => {
          // 分隔符随其后一项的可见性,保证移动端首 / 末之间只留一个。
          const next = slots[i + 1];
          const sepClass = next?.kind === "crumb" ? mobileHidden(next.index) : undefined;
          const sep = i < slots.length - 1 && (
            <BreadcrumbSeparator className={sepClass}>{separator}</BreadcrumbSeparator>
          );
          if (slot.kind === "ellipsis") {
            return (
              <Fragment key="ellipsis">
                <BreadcrumbItem>
                  <EllipsisMenu hidden={slot.hidden} handlerFor={handlerFor} />
                </BreadcrumbItem>
                {sep}
              </Fragment>
            );
          }
          return (
            <Fragment key={slot.crumb.id ?? `crumb-${slot.index}`}>
              <BreadcrumbItem className={mobileHidden(slot.index)}>
                <CrumbNode
                  crumb={slot.crumb}
                  current={isCurrent(slot.crumb, slot.index)}
                  onClick={handlerFor(slot.crumb, slot.index)}
                />
              </BreadcrumbItem>
              {sep}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
