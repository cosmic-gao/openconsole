/**
 * Next.js 16 Cache Components 兼容层。
 *
 * 背景:Next.js 16 启用 `cacheComponents` 后,Server Components 渲染期间任何
 * `Date.now()` / `Math.random()` / `new Date()` 在**没有先读 dynamic data**
 * (`cookies()` / `headers()` / `connection()` / `searchParams`)的情况下都
 * 会触发错误:
 *
 * > Route "/x" used `Date.now()` before accessing either uncached data
 * > (e.g. `fetch()`) or Request data (e.g. `cookies()`, `headers()`,
 * > `connection()`, and `searchParams`).
 *
 * 本包内部因为通用必需操作而调用了这些 API:
 * - {@link Http.fetch} 用 `Date.now()` 记请求开始时间(给 logger 插件算耗时)
 * - {@link Discovery.list} 用 `Date.now()` 判定 TTL
 * - 默认 `weighted()` 负载均衡用 `Math.random()` 抽实例
 * - `logger` 插件 `onResponse` / `onError` 用 `Date.now()` 算耗时
 *
 * `markDynamic()` 在所有用户调用路径的入口处先 `await connection()`,把
 * 当前路由显式标记为动态 —— Next.js 不再尝试 prerender,后续所有
 * 非确定性操作就都被允许。
 *
 * @module
 */

type ConnectionFn = () => Promise<void> | void;

// 缓存解析结果:undefined = 未探测,null = 不可用(非 Next 环境或导入失败),
// 函数 = 已就绪。
let cached: ConnectionFn | null | undefined;

/**
 * 在 Next.js Server Component 渲染上下文中调用 `connection()`,把当前路由
 * 标记为动态(让 `cacheComponents` 模式接受后续的 `Date.now()` 等调用)。
 *
 * 安全降级:
 * - 不在 Next.js Node Runtime(`NEXT_RUNTIME !== "nodejs"`) → 直接 no-op
 * - 不在请求作用域(instrumentation / 后台 worker / 测试 / CLI) → 静默吞掉
 *   `connection()` 抛出的 "called outside request scope" 异常
 * - `next/server` 不可导入(老版本 Next 或非 Next 环境) → 缓存 null,
 *   下次直接 no-op
 *
 * 幂等:`connection()` 本身可多次调用,只会在第一次真正生效,后续就是
 * 一个 resolved Promise。
 *
 * 性能:解析结果缓存在模块作用域;稳定路径下只是一次 await(已就绪 Promise)。
 */
export async function markDynamic(): Promise<void> {
  // 非 Next.js 环境快速 bail(CLI 脚本、Node worker、测试)。
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  if (cached === undefined) {
    try {
      // 动态 import 让本包在非 Next 环境也能 require/build 通过。
      const mod = (await import("next/server")) as {
        connection?: ConnectionFn;
      };
      cached = typeof mod.connection === "function" ? mod.connection : null;
    } catch {
      // 没装 next 或者旧版没有 connection 导出 —— 永久 no-op。
      cached = null;
    }
  }

  if (!cached) return;

  try {
    await cached();
  } catch {
    // 在请求作用域之外调用 connection() 会抛错(instrumentation / 后台
    // 任务 / cron 等)—— 静默忽略,因为这些场景下也没有 prerender 在跑,
    // 不需要标记 dynamic。
  }
}

/**
 * 仅用于测试:重置缓存的解析结果,让下次 {@link markDynamic} 重新探测。
 *
 * 业务代码**不应该**调用本函数 —— 缓存只为性能,不存在需要 reset 的合法用例。
 */
export function __resetMarkDynamicCacheForTests(): void {
  cached = undefined;
}
