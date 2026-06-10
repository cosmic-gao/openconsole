"use client";

import type { LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type MouseEvent, type ReactNode } from "react";

/** 单条面包屑。 */
export interface Crumb {
  /** React key;省略回退到下标。 */
  id?: string;
  /** 显示内容。 */
  label: ReactNode;
  /** 链接;省略则为不可点击项(当前页 / 分组)。 */
  href?: LinkProps["href"];
  /** 前导图标名(交给 `Icon`)。 */
  icon?: string;
  /** 点击回调;可与 `href` 共存,无 `href` 时渲染为按钮。当前页不触发。 */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** 强制按当前页渲染;缺省时仅末项视为当前页。 */
  current?: boolean;
}

export interface BreadcrumbsOptions {
  /** 按完整路径覆盖文本,如 `{ "/orders/123": "订单 #123" }`。 */
  labels?: Record<string, string>;
  /** 未命中 `labels` 时的 segment 变换;默认首字母大写。 */
  transform?: (segment: string, index: number, segments: string[]) => string;
}

const capitalize = (segment: string) => segment.charAt(0).toUpperCase() + segment.slice(1);

/** 从当前 pathname 推导面包屑链(无头;配合 `<Breadcrumbs>` 或自渲染)。 */
export function useBreadcrumbs(options?: BreadcrumbsOptions): Crumb[] {
  const pathname = usePathname();
  const labels = options?.labels;
  const transform = options?.transform ?? capitalize;
  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join("/")}`;
      return { label: labels?.[href] ?? transform(segment, index, segments), href };
    });
  }, [pathname, labels, transform]);
}
