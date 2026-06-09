"use client";

import { icons as lucideIcons, type LucideProps } from "lucide-react";

import { cn } from "../../lib/utils";

interface IconProps extends LucideProps {
  /**
   * 图标来源，按形态自动判别（三选一）：
   * - lucide-react 图标名，PascalCase（例如 `"LayoutDashboard"`）；
   * - 内联 SVG 源码（以 `<svg` 开头）；
   * - 图片地址：http(s) URL、绝对/相对路径、`data:image/` 或以图片
   *   后缀（png/jpg/svg/webp…）结尾的字符串。
   */
  name?: string;
  /** `name` 为图片时的 `alt`；其余形态忽略。默认空串（按装饰性处理）。 */
  alt?: string;
}

/** 起始前缀或图片后缀任一命中即视为图片地址。 */
const IMAGE_SOURCE =
  /^(https?:\/\/|\/|\.\.?\/|data:image\/)|\.(png|jpe?g|gif|webp|avif|svg|ico|bmp)(\?.*)?$/i;

/**
 * 渲染一个图标。`name` 可以是 lucide 图标名、内联 SVG 源码或图片地址，
 * 组件按形态自动选择渲染方式，三者共享同一个 `className`（尺寸/颜色）。
 *
 * Sidebar 等数据把图标存成可序列化的纯字符串，以跨 RSC / Client 边界传递，
 * 真正的查表 / 渲染发生在这里（客户端）。
 *
 * 注意：内联 SVG 经 `dangerouslySetInnerHTML` 注入，仅供可信来源（应用
 * 自身配置）使用，切勿把用户输入直接传入。
 */
export function Icon({ name, alt = "", className, ...props }: IconProps) {
  if (!name) return null;

  if (name.trimStart().startsWith("<svg")) {
    return (
      <span
        className={cn("inline-flex [&>svg]:size-full", className)}
        dangerouslySetInnerHTML={{ __html: name }}
      />
    );
  }

  if (IMAGE_SOURCE.test(name)) {
    // 基础原语，刻意用原生 <img> 而非 next/image，避免 shadcn 层耦合框架。
    return (
      <img src={name} alt={alt} className={cn("object-contain", className)} />
    );
  }

  const LucideIcon = lucideIcons[name as keyof typeof lucideIcons];
  return LucideIcon ? <LucideIcon className={className} {...props} /> : null;
}
