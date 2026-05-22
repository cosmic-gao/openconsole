"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Thin wrapper around `next-themes` ThemeProvider with sensible defaults.
 * Pass any prop to override (e.g. `attribute="data-theme"`).
 */
export function ThemeProvider(
  props: React.ComponentProps<typeof NextThemesProvider>,
) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    />
  );
}
