"use client";

import * as React from "react";

import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  Sidebar as SidebarPrimitive,
  SidebarRail,
} from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout";
import { Account } from "./account";
import { Brand } from "./brand";
import { Menu } from "./menu";
import type { Brand as BrandData, MenuData, User } from "./types";

export type {
  AccountMenuItem,
  Brand,
  BrandLogo,
  MatchMode,
  MatchStrategy,
  MenuData,
  MenuGroup,
  MenuItem,
  User,
} from "./types";

/**
 * {@link Sidebar} 的 props。
 *
 * `brand` / `menu` / `account` 决定渲染出的视觉结构；其余 prop 透传给
 * 底层的 shadcn `Sidebar` 原语（例如 `className`、`side` / `variant` /
 * `collapsible` 的覆盖）。
 */
export interface SidebarProps extends React.ComponentProps<
  typeof SidebarPrimitive
> {
  /** 顶部品牌区；不传则不渲染 header。 */
  brand?: BrandData;
  /** 菜单数据:分组列表,或扁平项列表(自动包成单个匿名分组);见 {@link MenuData}。 */
  menu: MenuData;
  /** 底部账号卡片；不传则不渲染 footer。 */
  account?: User;
}

/**
 * 三段式侧边栏（brand / menu / account），通过 atoms 的
 * {@link LayoutProvider} 读取变体配置。
 *
 * - `brand`（可选）渲染在 `SidebarHeader` 内。
 * - `menu` 渲染在 `SidebarContent` 内；通过 `MenuItem.children` 支持
 *   一层嵌套。
 * - `account`（可选）渲染在 `SidebarFooter` 内；`account.menu` 非空时
 *   卡片变成下拉触发器。
 *
 * 必须包在 shadcn 的 `SidebarProvider` 内部（atoms 不重复打包它）。
 */
export function Sidebar({ brand, menu, account, ...props }: SidebarProps) {
  const { config } = useLayout();

  return (
    <SidebarPrimitive
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
      {...props}
    >
      {brand && (
        <SidebarHeader className="group-data-[collapsible=icon]:pt-4">
          <Brand brand={brand} />
        </SidebarHeader>
      )}
      <SidebarContent className="overflow-x-hidden">
        <Menu items={menu} />
      </SidebarContent>
      {account && (
        <SidebarFooter>
          <Account user={account} />
        </SidebarFooter>
      )}
      <SidebarRail />
    </SidebarPrimitive>
  );
}
