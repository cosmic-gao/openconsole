/**
 * 负载均衡策略集合。
 *
 * 每个工厂函数返回一个有状态的 {@link Balancer} 实例 —— 内部计数器 / 游标
 * 是隔离的。如果想让多个消费者共享独立的轮询序列，**不要**复用同一个实例。
 *
 * 约定：`pick()` 每次都用单个服务的实例列表调用。`roundRobin` 内部以
 * `instances[0].service` 作为游标键，跨服务混传一个列表会让游标错乱。
 *
 * @module
 */
import type { Balancer, Hint, Instance, Strategy } from "./types";

/**
 * 轮询策略。
 *
 * 内部维护「服务名 → 游标」的 Map，保证同一服务的连续调用按顺序循环。
 */
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

/** 随机策略，简单且无状态。 */
export function random(): Balancer {
  return {
    name: "random",
    pick(instances) {
      if (instances.length === 0) return null;
      return instances[Math.floor(Math.random() * instances.length)];
    },
  };
}

/**
 * 加权策略，按 `weight`（缺省 1）比例随机命中。
 *
 * 异构集群的首选策略；同质集群退化为等概率随机。
 */
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

/**
 * 黏性策略：同样的 {@link Hint.key} 在实例列表不变时总是命中同一实例。
 *
 * 适合用户/租户级别的请求亲和性。无 key 时退化为「第一个实例」。
 */
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

/**
 * 把 {@link Strategy}（字符串或 Balancer 对象）解析成 Balancer 实例。
 *
 * - `undefined` → `weighted()`（默认）
 * - 字符串 → 对应内置工厂
 * - Balancer 对象 → 原样返回
 *
 * @throws 字符串不在内置列表时抛错
 */
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

/** 过滤出可调用（healthy && enabled）的实例。 */
export function callable(instances: Instance[]): Instance[] {
  return instances.filter((i) => i.healthy && i.enabled);
}
