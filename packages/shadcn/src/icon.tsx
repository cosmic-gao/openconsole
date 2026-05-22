"use client";

import { icons as lucideIcons, type LucideProps } from "lucide-react";

interface IconProps extends LucideProps {
  /** lucide-react icon name in PascalCase (e.g. "LayoutDashboard"). */
  name?: string;
}

/**
 * Render a lucide-react icon by name.
 *
 * Sider data keeps icon references as plain strings so it stays serializable
 * across the React Server / Client boundary. The actual component lookup
 * happens here, inside the client.
 */
export function Icon({ name, ...props }: IconProps) {
  if (!name) return null;
  const LucideIcon = lucideIcons[name as keyof typeof lucideIcons];
  return LucideIcon ? <LucideIcon {...props} /> : null;
}
