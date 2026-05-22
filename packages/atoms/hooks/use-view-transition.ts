"use client";

import { useCallback, useRef } from "react";
import { useTheme } from "next-themes";

const FALLBACK_MS = 400;

type TransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { finished: Promise<void> };
};

/**
 * Circular reveal theme transition powered by the View Transitions API.
 * Falls back to running the callback immediately when unsupported.
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
      // Use `resolvedTheme` so the first click flips correctly when the user
      // is on System mode.
      const next = resolvedTheme === "dark" ? "light" : "dark";
      startTransition({ x: event.clientX, y: event.clientY }, () => {
        setTheme(next);
      });
    },
    [resolvedTheme, setTheme, startTransition],
  );

  return { startTransition, toggleTheme };
}
