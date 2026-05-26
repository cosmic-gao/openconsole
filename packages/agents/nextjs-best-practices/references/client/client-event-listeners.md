---
title: Deduplicate Global Event Listeners
impact: LOW
impactDescription: single listener for N components
tags: client, event-listeners, subscription
---

## Deduplicate Global Event Listeners

When several component instances all register the same global listener (window keydown, scroll, online/offline, intersection observer), you end up with N listeners doing N times the work. Move the listener to module scope and let each hook register a callback into a shared registry — one DOM listener, many callbacks.

The template forbids SWR; this is a plain module-level singleton pattern, no extra dependency.

**Incorrect (N instances = N listeners):**

```tsx
function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === key) {
        callback();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [key, callback]);
}
```

Each consumer of `useKeyboardShortcut` registers its own listener.

**Correct (N instances = 1 listener):**

```tsx
"use client";

import { useEffect } from "react";

// Module-level singleton: one DOM listener regardless of consumer count.
const callbacks = new Map<string, Set<() => void>>();
let attached = false;

function rootHandler(event: KeyboardEvent) {
  if (!event.metaKey) return;
  const set = callbacks.get(event.key);
  if (set) for (const cb of set) cb();
}

function attachOnce() {
  if (attached) return;
  attached = true;
  window.addEventListener("keydown", rootHandler);
}

function detachIfEmpty() {
  if (callbacks.size > 0) return;
  attached = false;
  window.removeEventListener("keydown", rootHandler);
}

export function useKeyboardShortcut(key: string, callback: () => void) {
  useEffect(() => {
    attachOnce();
    let set = callbacks.get(key);
    if (!set) {
      set = new Set();
      callbacks.set(key, set);
    }
    set.add(callback);

    return () => {
      set!.delete(callback);
      if (set!.size === 0) callbacks.delete(key);
      detachIfEmpty();
    };
  }, [key, callback]);
}

function Profile() {
  // Multiple shortcuts share one DOM listener
  useKeyboardShortcut("p", () => { /* … */ });
  useKeyboardShortcut("k", () => { /* … */ });
}
```

The same pattern works for `scroll`, `online`/`offline`, `visibilitychange`, `resize`, or any `IntersectionObserver` — keep one observer at module scope and let hooks subscribe via a `Map` / `Set`.
