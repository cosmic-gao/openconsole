"use client";

import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

import {
  Button,
  Icon,
  SidebarMenu,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  useSidebar,
} from "@openconsole/shadcn";

import { useLayout, type LayoutConfig } from "../../providers/layout";
import type { Brand as BrandData, BrandLogo } from "./types";

/**
 * 侧边栏顶部品牌区。
 *
 * `brand.logo` 为**字符串**时：渲染在方形品牌框里（lucide / 内联 SVG / 图片
 * 都走 {@link Icon}），明暗与展开 / 折叠共用同一个 —— 原有行为不变。
 *
 * `brand.logo` 为 **{@link BrandLogo} 对象**时：展开显示 `light` / `dark` 全幅
 * logo（适合 wordmark，不套品牌框、按原始比例展示），折叠到图标宽度时显示
 * `collapsed` 方形 mark。主题与折叠态都用纯 CSS 切换，无运行时 hook、无闪烁。
 *
 * `collapsible === "icon"` 且已折叠时：鼠标悬浮在 mark 上会就地（淡入淡出）
 * 换成展开按钮；其余折叠模式（`offcanvas` / `none`）行为不变。
 */
export function Brand({ brand }: { brand: BrandData }) {
  const { toggleSidebar } = useSidebar();
  const { config } = useLayout();

  return (
    <SidebarMenu>
      <SidebarMenuItem className="group/brand flex h-12 items-center gap-2 px-2 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:px-0">
        {typeof brand.logo === "string" ? (
          <BoxedMark
            logo={brand.logo}
            alt={brand.name}
            config={config}
            onToggle={toggleSidebar}
          />
        ) : (
          <ImageLogo
            logo={brand.logo}
            alt={brand.name}
            config={config}
            onToggle={toggleSidebar}
          />
        )}
        {config.collapsible !== "none" && (
          <CollapseButton side={config.side} onClick={toggleSidebar} />
        )}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * 字符串 logo —— 方形品牌框 + 图标，明暗 / 折叠共用同一个（原有行为）。
 */
function BoxedMark({
  logo,
  alt,
  config,
  onToggle,
}: {
  logo: string;
  alt: string;
  config: LayoutConfig;
  onToggle: () => void;
}) {
  return (
    <div className="relative size-8 shrink-0">
      <div className="bg-sidebar-primary text-sidebar-primary-foreground absolute inset-0 flex items-center justify-center rounded-md transition-opacity duration-200 group-data-[collapsible=icon]:group-hover/brand:opacity-0">
        <Icon name={logo} alt={alt} className="size-4" />
      </div>
      {config.collapsible === "icon" && (
        <ExpandButton side={config.side} onClick={onToggle} />
      )}
    </div>
  );
}

/**
 * 对象 logo —— 展开全幅 wordmark（不套品牌框），折叠方形 mark；明暗用
 * `dark:` 切换，展开 / 折叠用 `group-data-[collapsible=icon]:` 切换。
 */
function ImageLogo({
  logo,
  alt,
  config,
  onToggle,
}: {
  logo: BrandLogo;
  alt: string;
  config: LayoutConfig;
  onToggle: () => void;
}) {
  const collapsedLight = logo.collapsed ?? logo.light;
  const collapsedDark = logo.collapsedDark ?? logo.collapsed ?? logo.dark;

  return (
    <>
      {/* 展开态：全幅 logo（wordmark 按原始比例，限制在可用宽度内） */}
      <div className="flex min-w-0 flex-1 items-center group-data-[collapsible=icon]:hidden">
        <ThemedLogo
          light={logo.light}
          dark={logo.dark}
          alt={alt}
          className="h-5 w-auto max-w-full object-contain object-left"
        />
      </div>
      {/* 折叠态：方形 mark，悬浮就地换成展开按钮 */}
      <div className="relative hidden size-8 shrink-0 group-data-[collapsible=icon]:block">
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 group-hover/brand:opacity-0">
          <ThemedLogo
            light={collapsedLight}
            dark={collapsedDark}
            alt={alt}
            className="size-6 object-contain"
          />
        </div>
        {config.collapsible === "icon" && (
          <ExpandButton side={config.side} onClick={onToggle} />
        )}
      </div>
    </>
  );
}

/**
 * 渲染 light / dark 两张图并用 `dark:` 变体切换；无 dark 变体或与 light
 * 同源时只渲染一张。两张都进 DOM、靠 CSS 显隐，因此 SSR 即为最终态。
 */
function ThemedLogo({
  light,
  dark,
  alt,
  className,
}: {
  light: string;
  dark?: string;
  alt: string;
  className?: string;
}) {
  if (!dark || dark === light) {
    return <Icon name={light} alt={alt} className={className} />;
  }
  return (
    <>
      <Icon name={light} alt={alt} className={cn(className, "dark:hidden")} />
      <Icon name={dark} alt={alt} className={cn(className, "hidden dark:block")} />
    </>
  );
}

/**
 * 折叠态悬浮在 mark 上出现的展开按钮 —— 绝对覆盖在 mark 之上，仅
 * `collapsible === "icon"` 折叠时通过 hover 淡入。
 */
function ExpandButton({
  side,
  onClick,
}: {
  side: LayoutConfig["side"];
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-keyshortcuts="Control+B Meta+B"
          className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground absolute inset-0 hidden cursor-pointer opacity-0 transition-opacity duration-200 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:group-hover/brand:opacity-100"
        >
          {side === "right" ? <PanelRightOpen /> : <PanelLeftOpen />}
          <span className="sr-only">Expand sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side === "right" ? "left" : "right"}>
        Expand sidebar
      </TooltipContent>
    </Tooltip>
  );
}

/** 展开态把侧边栏收起的按钮 —— 推到行尾（`side="right"` 时图标镜像）。 */
function CollapseButton({
  side,
  onClick,
}: {
  side: LayoutConfig["side"];
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-keyshortcuts="Control+B Meta+B"
          className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground ml-auto cursor-pointer group-data-[collapsible=icon]:hidden"
        >
          {side === "right" ? <PanelRightClose /> : <PanelLeftClose />}
          <span className="sr-only">Collapse sidebar</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Collapse sidebar</TooltipContent>
    </Tooltip>
  );
}
