/**
 * Load balancer strategies.
 *
 * Each factory returns a stateful balancer — counters/cursors are isolated.
 * Don't share an instance across unrelated consumers if you want independent
 * round-robin sequences.
 *
 * Contract: `pick()` is always called with instances from a single service.
 * `roundRobin` keys its cursor on `instances[0].service`; mixing services in
 * one call would silently share the cursor across them.
 */
import type { Balancer, Hint, Instance, Strategy } from "./types";

export function roundRobin(): Balancer {
  const cursors = new Map<string, number>();
  return {
    name: "round-robin",
    pick(instances) {
      if (instances.length === 0) return null;
      const key = instances[0].service;
      const n = (cursors.get(key) ?? -1) + 1;
      cursors.set(key, n);
      return instances[n % instances.length];
    },
  };
}

export function random(): Balancer {
  return {
    name: "random",
    pick(instances) {
      if (instances.length === 0) return null;
      return instances[Math.floor(Math.random() * instances.length)];
    },
  };
}

/** Pick proportional to `weight` (default 1). Best for heterogeneous fleets. */
export function weighted(): Balancer {
  return {
    name: "weighted",
    pick(instances) {
      if (instances.length === 0) return null;
      const total = instances.reduce((s, i) => s + (i.weight ?? 1), 0);
      let roll = Math.random() * total;
      for (const ins of instances) {
        roll -= ins.weight ?? 1;
        if (roll <= 0) return ins;
      }
      return instances[instances.length - 1];
    },
  };
}

/** Same hint key → same instance while the list shape is stable. */
export function sticky(): Balancer {
  return {
    name: "sticky",
    pick(instances, hint?: Hint) {
      if (instances.length === 0) return null;
      if (!hint?.key) return instances[0];
      let h = 0;
      for (let i = 0; i < hint.key.length; i++) {
        h = (h * 31 + hint.key.charCodeAt(i)) | 0;
      }
      return instances[Math.abs(h) % instances.length];
    },
  };
}

export function resolve(strategy: Strategy | undefined): Balancer {
  if (!strategy) return weighted();
  if (typeof strategy !== "string") return strategy;
  switch (strategy) {
    case "round-robin":
      return roundRobin();
    case "random":
      return random();
    case "weighted":
      return weighted();
    case "sticky":
      return sticky();
    default:
      throw new Error(`[nacos] unknown balancer strategy: ${strategy as string}`);
  }
}

export function callable(instances: Instance[]): Instance[] {
  return instances.filter((i) => i.healthy && i.enabled);
}
