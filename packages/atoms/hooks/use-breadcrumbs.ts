"use client";

import type { LinkProps } from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type MouseEvent, type ReactNode } from "react";

/** 单条面包屑。 */
export type Crumb = {
  /** 显示内容；字符串或任意节点（如图标 + 文本）。 */
  label: ReactNode;
  /** 跳转地址；省略则渲染为不可点击项（当前页 / 中间分组 / 纯回调项）。 */
  href?: LinkProps["href"];
  /** 可选前导图标（lucide 名 / 内联 SVG / 图片地址），交给 `Icon` 渲染。 */
  icon?: string;
  /**
   * 自定义点击逻辑。可与 `href` 共存：有 `href` 时附加到 `<Link>`
   * （可 `event.preventDefault()` 拦截默认跳转，接管路由 / 打开弹层）；
   * 无 `href` 时本项渲染为 `<button>`。当前页（末项 / `current`）不触发。
   */
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  /**
   * 强制按「当前页」渲染（不可点击、`aria-current="page"`）。
   * 缺省时仅最后一项视为当前页。
   */
  current?: boolean;
};

/** {@link useBreadcrumbs} 的可选参数。 */
export interface UseBreadcrumbsOptions {
  /**
   * 按完整路径覆盖显示文本。key 是完整 path（如 `/dashboard/orders`），
   * value 是显示文本。适合无法直接从 segment 还原的标签（UUID、slug、动态 id）。
   *
   * @example { "/dashboard": "概览", "/dashboard/orders/123": "订单 #123" }
   */
  labels?: Record<string, string>;
  /**
   * 当 `labels` 命中不到时对每个 segment 应用的变换函数。
   * 默认把首字母转大写（`employee` → `Employee`）。
   */
  transform?: (segment: string, index: number, segments: string[]) => string;
}

const defaultTransform = (segment: string) =>
  segment.charAt(0).toUpperCase() + segment.slice(1);

/**
 * 从当前 pathname 推导出面包屑链。
 *
 * 每个 path segment 变成一条 crumb，`href` 是累计到该层的完整路径。
 * 例如 `/dashboard/orders/123` →
 *
 * ```
 * [
 *   { label: "Dashboard", href: "/dashboard" },
 *   { label: "Orders",    href: "/dashboard/orders" },
 *   { label: "123",       href: "/dashboard/orders/123" },
 * ]
 * ```
 *
 * 通过 `labels`（按路径覆盖）或 `transform`（默认 segment → 标题规则）
 * 自定义文本。本 hook 是无头的 —— 配合 `<Breadcrumbs>` 使用默认 UI，
 * 或自行渲染。末项是否当前页、首项 / 折叠等展示策略交给 `<Breadcrumbs>`。
 */
export function useBreadcrumbs(options?: UseBreadcrumbsOptions): Crumb[] {
  const pathname = usePathname();
  const labels = options?.labels;
  const transform = options?.transform ?? defaultTransform;

  return useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    return segments.map((segment, index) => {
      const link = `/${segments.slice(0, index + 1).join("/")}`;
      const override = labels?.[link];
      return {
        label: override ?? transform(segment, index, segments),
        href: link,
      };
    });
  }, [pathname, labels, transform]);
}
