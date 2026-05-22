"use client";

import * as React from "react";

import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@openconsole/shadcn";

import { useLayout } from "../../providers/layout-provider";

import { Account } from "./account";
import { Brand } from "./brand";
import { Menu } from "./menu";
import type { Brand as BrandData, MenuGroup, User } from "./types";

export type {
  AccountMenuItem,
  Brand,
  MenuGroup,
  MenuItem,
  User,
} from "./types";

/**
 * Sidebar props. `brand`/`menu`/`account` shape the rendered chrome; the rest
 * pass through to the underlying Sidebar primitive (e.g. `className`,
 * `side`/`variant`/`collapsible` overrides).
 */
export interface SidebarProps
  extends React.ComponentProps<typeof SidebarPrimitive> {
  /** Top brand block. Omit to hide the header. */
  brand?: BrandData;
  /** Sectioned menu groups. */
  menu: MenuGroup[];
  /** Bottom account card. Omit to hide the footer. */
  account?: User;
}

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
        <Menu groups={menu} />
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
