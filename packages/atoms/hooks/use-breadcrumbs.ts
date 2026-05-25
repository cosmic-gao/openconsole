"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

/** 单条面包屑：显示文本 + 跳转链接。 */
export type Crumb = {
  title: string;
  link: string;
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
 * 每个 path segment 变成一条 crumb，`link` 是累计到该层的完整路径。
 * 例如 `/dashboard/orders/123` →
 *
 * ```
 * [
 *   { title: "Dashboard", link: "/dashboard" },
 *   { title: "Orders",    link: "/dashboard/orders" },
 *   { title: "123",       link: "/dashboard/orders/123" },
 * ]
 * ```
 *
 * 通过 `labels`（按路径覆盖）或 `transform`（默认 segment → 标题规则）
 * 自定义文本。本 hook 是无头的 —— 配合 `<Breadcrumbs>` 使用默认 UI，
 * 或自行渲染。
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
        title: override ?? transform(segment, index, segments),
        link,
      };
    });
  }, [pathname, labels, transform]);
}
