"use client";

import * as React from "react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@opendesign/shadcn";

import { useSidebarConfig } from "../sidebar-config";

import { Account } from "./account";
import { Brand } from "./brand";
import { Menu } from "./menu";
import type {
  Brand as BrandData,
  MenuGroup,
  User,
} from "./types";

export type { Brand, MenuGroup, MenuItem, User } from "./types";

/**
 * Sider props — also the data shape for `siderConfig` (only `brand`/`menu`/
 * `account` are typically populated; the rest pass through to the underlying
 * Sidebar primitive).
 */
export interface SiderProps extends React.ComponentProps<typeof Sidebar> {
  /** Top brand block. Omit to hide the header. */
  brand?: BrandData;
  /** Sectioned menu groups. */
  menu: MenuGroup[];
  /** Bottom account card. Omit to hide the footer. */
  account?: User;
}

export function Sider({ brand, menu, account, ...props }: SiderProps) {
  const { config } = useSidebarConfig();

  return (
    <Sidebar
      variant={config.variant}
      collapsible={config.collapsible}
      side={config.side}
      {...props}
    >
      {brand && (
        <SidebarHeader>
          <Brand brand={brand} />
        </SidebarHeader>
      )}
      <SidebarContent>
        <Menu groups={menu} />
      </SidebarContent>
      {account && (
        <SidebarFooter>
          <Account user={account} />
        </SidebarFooter>
      )}
      <SidebarRail />
    </Sidebar>
  );
}
