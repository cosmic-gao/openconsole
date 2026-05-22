"use client";

import { Moon, Sun } from "lucide-react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@opendesign/shadcn";

import { useViewTransition } from "../hooks/use-view-transition";

export function ThemeSwitch() {
  const { toggleTheme } = useViewTransition();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="group/toggle size-8"
          onClick={toggleTheme}
        >
          <Sun className="size-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle theme</TooltipContent>
    </Tooltip>
  );
}
