import type { LinkProps } from "next/link";

/**
 * Top-of-sider brand mark — logo, name, and an optional subtitle.
 */
export interface Brand {
  name: string;
  /** lucide-react icon name in PascalCase (e.g. "Command"). */
  logo: string;
  /** Subtitle below the name (e.g. plan, workspace tier). */
  description?: string;
}

/**
 * An action shown inside the account dropdown (profile, billing, sign-out…).
 *
 * Provide either `href` (renders a `<Link>`) or `onSelect` (renders a button).
 * Set `separator: true` to draw a divider **before** the item — handy for
 * visually grouping (e.g. account actions vs. sign-out).
 */
export interface AccountMenuItem {
  label: string;
  /** lucide-react icon name (e.g. "Settings"). */
  icon?: string;
  href?: LinkProps["href"];
  onSelect?: () => void;
  /** Draw a `DropdownMenuSeparator` immediately above this item. */
  separator?: boolean;
  /** Apply destructive (red) styling — typical for "Sign out", "Delete". */
  destructive?: boolean;
}

/**
 * Bottom-of-sider account card.
 *
 * Without `menu`: renders as a static card.
 * With `menu`: the card becomes a dropdown trigger.
 */
export interface User {
  name: string;
  email: string;
  /** Image URL. Falls back to initials when missing. */
  avatar?: string;
  /** When provided (non-empty), the account block becomes a dropdown trigger. */
  menu?: AccountMenuItem[];
}

/**
 * Recursive menu item. Use `href` for a leaf link, `children` for a parent.
 * A parent with `children` and no `href` acts as a collapsible group.
 */
export interface MenuItem {
  label: string;
  /** lucide-react icon name (e.g. "LayoutDashboard"). */
  icon?: string;
  /** Route. Omit when this item has `children` and is a parent. */
  href?: LinkProps["href"];
  /** Nested items (one level deep is rendered; deeper nesting is ignored). */
  children?: MenuItem[];
  /** Small pill rendered after the label. */
  badge?: string;
  badgeColor?: "violet" | "green";
}

/**
 * A labeled section of menu items. Omit `label` for an unlabeled section.
 */
export interface MenuGroup {
  label?: string;
  items: MenuItem[];
}
