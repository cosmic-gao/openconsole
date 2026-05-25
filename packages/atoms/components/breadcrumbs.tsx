"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@openconsole/shadcn";

import { type Crumb, useBreadcrumbs } from "../hooks/use-breadcrumbs";

/** {@link Breadcrumbs} 的 props。 */
export interface BreadcrumbsProps {
  /**
   * 手写的 crumb 链。设置后 `labels` 被忽略，也不再调用 hook 推导。
   * 适用于非 pathname 派生的场景（向导步骤、模态流程等）。
   */
  items?: Crumb[];
  /**
   * 按路径覆盖文本；只在未传 `items` 时生效，会转发给 `useBreadcrumbs`。
   * 详见 {@link UseBreadcrumbsOptions.labels}。
   */
  labels?: Record<string, string>;
  /**
   * 自定义分隔符内容（渲染在 `BreadcrumbSeparator` 内部）。
   * 默认是 shadcn 内置的 `ChevronRight` 图标。
   */
  separator?: ReactNode;
  /**
   * 默认情况下中间 crumb（除首/尾外）在 `< md` 屏幕下隐藏，保持顶栏紧凑。
   * 设为 `true` 让它们在所有尺寸下都可见。
   */
  showAllOnMobile?: boolean;
}

/**
 * 自动从 pathname 派生的面包屑导航。常作为 `<Header breadcrumbs={<Breadcrumbs />} />`
 * 的默认导航插槽。
 *
 * 读取 `usePathname()`，每个 segment 渲染一条 crumb：尾项是当前页，渲染
 * 为不可点击的 `BreadcrumbPage`；中间项是 `<Link>`。pathname 为空时返回
 * `null`（不留视觉残影）。
 *
 * 通过 `labels` 自定义文本（按路径覆盖）；非 pathname 场景直接传 `items`；
 * 要无头渲染自己的 UI，请改用 {@link useBreadcrumbs}。
 */
export function Breadcrumbs({
  items: itemsProp,
  labels,
  separator,
  showAllOnMobile = false,
}: BreadcrumbsProps) {
  const derived = useBreadcrumbs({ labels });
  const items = itemsProp ?? derived;

  if (items.length === 0) return null;

  const intermediateClass = showAllOnMobile ? undefined : "hidden md:block";

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.link}-${index}`}>
              <BreadcrumbItem
                className={isLast ? undefined : intermediateClass}
              >
                {isLast ? (
                  <BreadcrumbPage>{item.title}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.link}>{item.title}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && (
                <BreadcrumbSeparator className={intermediateClass}>
                  {separator}
                </BreadcrumbSeparator>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
