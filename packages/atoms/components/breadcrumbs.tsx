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

/** 全局 crumb 点击回调签名。`index` 是该 crumb 在最终链（含 `leading`）中的下标。 */
export type CrumbClickHandler = (
  crumb: Crumb,
  index: number,
  event: MouseEvent<HTMLElement>,
) => void;

/** {@link Breadcrumbs} 的 props。 */
export interface BreadcrumbsProps {
  /** 显式 crumb 链;省略则按 `usePathname()` 自动派生。 */
  items?: Crumb[];
  /**
   * 自定义「第一项」,固定展示在最前;`items` / 自动派生的**真实页面**面包屑
   * 接在它之后。始终可见,不参与移动端 / `limit` 折叠。
   *
   * 常用于固定入口(工作台 / 模块根 / 首页)。因 `Crumb.label` 是 `ReactNode`,
   * 首项也可放任意节点(如工作区切换器):`leading={{ label: <WorkspaceSwitcher /> }}`。
   */
  leading?: Crumb;
  /** 自定义分隔符内容;默认是 shadcn 内置的 `ChevronRight` 图标。 */
  separator?: ReactNode;
  /** 紧凑模式:中间项在 `< md` 屏幕隐藏(首项与当前页始终可见);默认 `true`,设为 `false` 则全部可见。 */
  compact?: boolean;
  /**
   * 限制可见项数量:超过则把**中间**项折叠进省略号下拉,始终保留首项(`leading`)
   * 与末项(当前页)。需 `>= 2` 才生效;缺省 / `0` 不折叠。适合深层级详情页。
   */
  limit?: number;
  /**
   * 全局点击回调,作用于每个可点击 crumb(在该 crumb 自身 `onClick` **之后**触发)。
   * 适合统一接管路由 / 埋点;在回调里 `event.preventDefault()` 可拦截默认
   * `<Link>` 跳转。当前页(末项 / `current`)不触发。
   */
  onItemClick?: CrumbClickHandler;
  /** 透传给根 `Breadcrumb` 的类名。 */
  className?: string;
}

/** 图标 + 文本内容,链接 / 按钮 / 当前页 / 下拉项共用。 */
function CrumbContent({ crumb }: { crumb: Crumb }) {
  return (
    <>
      {crumb.icon && <Icon name={crumb.icon} className="size-3.5 shrink-0" />}
      {crumb.label}
    </>
  );
}

/**
 * 渲染单条 crumb,按其形态选择元素:
 * - 当前页(`current`) → 不可点击的 `BreadcrumbPage`(`aria-current="page"`);
 * - 有 `href` → `<Link>`(可叠加自定义 `onClick`);
 * - 无 `href` 但有 `onClick` → `<button>`;
 * - 其余(纯分组标签) → 不可点击的 `<span>`。
 */
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
  const content = <CrumbContent crumb={crumb} />;

  if (current) {
    return <BreadcrumbPage className={inline}>{content}</BreadcrumbPage>;
  }
  if (crumb.href !== undefined) {
    return (
      <BreadcrumbLink asChild>
        <Link href={crumb.href} onClick={onClick} className={inline}>
          {content}
        </Link>
      </BreadcrumbLink>
    );
  }
  if (crumb.onClick) {
    return (
      <BreadcrumbLink asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(inline, "cursor-pointer")}
        >
          {content}
        </button>
      </BreadcrumbLink>
    );
  }
  return <span className={inline}>{content}</span>;
}

/** 被 `limit` 折叠的中间项 —— 收进省略号触发的下拉菜单。 */
function CollapsedCrumbs({
  hidden,
  handlerFor,
}: {
  hidden: { crumb: Crumb; index: number }[];
  handlerFor: (
    crumb: Crumb,
    index: number,
  ) => ((event: MouseEvent<HTMLElement>) => void) | undefined;
}) {
  return (
    <BreadcrumbItem>
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
            const interactive =
              crumb.href !== undefined || Boolean(crumb.onClick);
            const content = <CrumbContent crumb={crumb} />;
            return (
              <DropdownMenuItem
                key={`collapsed-${index}`}
                asChild={interactive}
                disabled={!interactive}
              >
                {crumb.href !== undefined ? (
                  <Link
                    href={crumb.href}
                    onClick={onClick}
                    className="flex items-center gap-2"
                  >
                    {content}
                  </Link>
                ) : crumb.onClick ? (
                  <button
                    type="button"
                    onClick={onClick}
                    className="flex w-full items-center gap-2"
                  >
                    {content}
                  </button>
                ) : (
                  <span className="flex items-center gap-2">{content}</span>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </BreadcrumbItem>
  );
}

/** 渲染单元:一条普通 crumb,或一个折叠省略号(携带被隐藏的中间项)。 */
type Entry =
  | { kind: "crumb"; crumb: Crumb; index: number }
  | { kind: "ellipsis"; hidden: { crumb: Crumb; index: number }[] };

/**
 * 面包屑导航。默认按 `usePathname()` 自动派生(常作为 `<Header />` 的导航插槽);
 * 传 `items` 则渲染你给的链(向导步骤、模态流程等非 pathname 场景)。
 *
 * 三项可定制能力:
 * - **自定义首项**:`leading` 固定展示在最前,真实页面面包屑接在其后,且始终可见。
 * - **自定义点击**:每条 `Crumb.onClick`(可与 `href` 共存)或全局 `onItemClick`,
 *   用于接管路由 / 埋点 / 拦截默认跳转。
 * - **长链折叠**:`limit` 把中间项收进省略号下拉,首项与当前页始终保留。
 *
 * 每条 crumb 的渲染形态见 {@link CrumbNode}。无 crumb 时返回 `null`。需要自动
 * 派生 + 自定义文本,可组合 `<Breadcrumbs items={useBreadcrumbs({ labels })} />`。
 */
export function Breadcrumbs({
  items,
  leading,
  separator,
  compact = true,
  limit,
  onItemClick,
  className,
}: BreadcrumbsProps) {
  const derived = useBreadcrumbs();
  const base = items ?? derived;
  const crumbs = leading ? [leading, ...base] : base;

  if (crumbs.length === 0) return null;

  const lastIndex = crumbs.length - 1;
  const isCurrent = (crumb: Crumb, index: number) =>
    crumb.current ?? index === lastIndex;

  // 先触发该 crumb 自身 onClick,再触发全局 onItemClick;两者皆无则返回 undefined
  // (让 <Link> 保持纯导航)。当前页不接 handler。
  const handlerFor = (crumb: Crumb, index: number) =>
    crumb.onClick || onItemClick
      ? (event: MouseEvent<HTMLElement>) => {
          crumb.onClick?.(event);
          onItemClick?.(crumb, index, event);
        }
      : undefined;

  // limit 折叠:保留首项 + 末 (limit - 1) 项,其余中间项收进省略号下拉。
  // 归一成 limited(无效值取 0),后续直接当数字用。
  const limited = typeof limit === "number" && limit >= 2 ? limit : 0;
  const collapse = limited > 0 && crumbs.length > limited;

  const indexed = crumbs.map((crumb, index) => ({ crumb, index }));
  const tailCount = collapse ? limited - 1 : 0;
  const entries: Entry[] = collapse
    ? [
        { kind: "crumb", crumb: indexed[0].crumb, index: 0 },
        {
          kind: "ellipsis",
          hidden: indexed.slice(1, crumbs.length - tailCount),
        },
        ...indexed
          .slice(crumbs.length - tailCount)
          .map(({ crumb, index }): Entry => ({ kind: "crumb", crumb, index })),
      ]
    : indexed.map(
        ({ crumb, index }): Entry => ({ kind: "crumb", crumb, index }),
      );

  // 紧凑模式下移动端隐藏中间项(limit 折叠时不叠加) —— 首项与末项(当前页)始终可见。
  const hideOnMobile = (index: number) =>
    compact && !collapse && index !== 0 && index !== lastIndex
      ? "hidden md:block"
      : undefined;

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        {entries.map((entry, i) => {
          const isLastEntry = i === entries.length - 1;
          // 分隔符跟随其**后一个** entry 的移动端可见性,保证首/末之间恰好留一个。
          const next = entries[i + 1];
          const sepHidden =
            next?.kind === "crumb" ? hideOnMobile(next.index) : undefined;
          const sep = !isLastEntry && (
            <BreadcrumbSeparator className={sepHidden}>
              {separator}
            </BreadcrumbSeparator>
          );

          if (entry.kind === "ellipsis") {
            return (
              <Fragment key={`ellipsis-${i}`}>
                <CollapsedCrumbs
                  hidden={entry.hidden}
                  handlerFor={handlerFor}
                />
                {sep}
              </Fragment>
            );
          }

          const { crumb, index } = entry;
          return (
            <Fragment key={`crumb-${index}`}>
              <BreadcrumbItem className={hideOnMobile(index)}>
                <CrumbNode
                  crumb={crumb}
                  current={isCurrent(crumb, index)}
                  onClick={handlerFor(crumb, index)}
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
