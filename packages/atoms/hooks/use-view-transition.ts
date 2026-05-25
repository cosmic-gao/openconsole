"use client";

import { useCallback, useRef } from "react";
import { useTheme } from "next-themes";

/** View Transitions API 不可用时主题切换的最小持续时长（毫秒）。 */
const FALLBACK_MS = 400;

/** 临时类型扩展：声明 `document.startViewTransition` 的形态。 */
type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/**
 * 内部 Hook —— 基于 View Transitions API 的圆形 reveal 主题切换。
 *
 * 浏览器不支持时直接执行回调并按 {@link FALLBACK_MS} 解锁。
 *
 * 返回：
 * - `startTransition(coords, cb)` 用任意坐标作为动画原点执行 `cb`。
 * - `toggleTheme(event)` 一键切换 light/dark，原点取 `event.clientX/Y`。
 */
export function useViewTransition() {
  const { resolvedTheme, setTheme } = useTheme();
  const transitioningRef = useRef(false);

  const startTransition = useCallback(
    (coords: { x: number; y: number }, callback: () => void) => {
      if (transitioningRef.current) return;
      transitioningRef.current = true;

      const root = document.documentElement;
      root.style.setProperty(
        "--vt-origin-x",
        `${(coords.x / window.innerWidth) * 100}%`,
      );
      root.style.setProperty(
        "--vt-origin-y",
        `${(coords.y / window.innerHeight) * 100}%`,
      );

      const doc = document as TransitionDocument;
      const finish = () => {
        transitioningRef.current = false;
      };
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(callback).finished.finally(finish);
      } else {
        callback();
        setTimeout(finish, FALLBACK_MS);
      }
    },
    [],
  );

  const toggleTheme = useCallback(
    (event: React.MouseEvent) => {
      // 用 `resolvedTheme` 而不是 `theme`：在 System 模式下首次点击也能正确翻转。
      const next = resolvedTheme === "dark" ? "light" : "dark";
      startTransition({ x: event.clientX, y: event.clientY }, () => {
        setTheme(next);
      });
    },
    [resolvedTheme, setTheme, startTransition],
  );

  return { startTransition, toggleTheme };
}
