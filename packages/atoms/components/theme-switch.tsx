"use client";

import { Moon, Sun } from "lucide-react";

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openconsole/shadcn";

import { useViewTransition } from "../hooks/use-view-transition";

/**
 * 零参数的明暗主题切换按钮。
 *
 * 渲染一个 Sun/Moon 按钮，在 `next-themes` 的 `light` / `dark` 之间翻转
 * （读 `resolvedTheme`，因此即使在 System 模式下也能正确切换）。
 * 每次点击通过 View Transitions API 从鼠标位置触发圆形 reveal 动画；
 * 浏览器不支持时回退为即时切换。
 *
 * 直接丢进导航、侧边栏或顶栏角落即可使用。
 */
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
