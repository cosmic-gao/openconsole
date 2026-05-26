---
name: redis-development
description: |
  公司内部 Next.js 项目的 Redis 使用规范,自包含完整定义。统一骨架有 **两个独立的 Redis 角色**:(1) **应用层 ioredis 单例**(`lib/redis/`)用于 rate limiting / pub-sub / 临时状态 / 计数器 / 分布式锁;(2) **Next cache backend**(`cache-handler.mjs` + `@neshca/cache-handler` + `redis@4`),让所有 Next 实例**共享** `'use cache'` / `revalidateTag` / `updateTag` 的失效广播。两个连接独立(虽然指向同一个 `REDIS_URL`),不要 cross-use。

  必须在以下场景触发,即使用户没说出 skill 名:用 Redis / 加 Redis / `lib/redis/` / ioredis / `redis.set` / `redis.get` / `redis.incr` / `redis.expire` / `redis.publish` / `redis.subscribe` / 加 rate limit / 加限流 / 加 captcha / 加临时状态 / 加分布式锁 / pub-sub / `cache-handler.mjs` / `@neshca/cache-handler` / Next 缓存后端 / 多实例共享缓存 / `updateTag` 在另一个实例不生效 / Redis 单例 / lazyConnect / retryStrategy / Redis URL / REDIS_URL / 数据结构选 hash 还是 string / TTL / `SETEX` / `EXPIRE` / Redis 事务 / `MULTI` / `EXEC` / pipelining / Redis 安全 / Redis ACL / `KEYS *` 慢 / `SCAN` / `HGETALL` 大 hash / 多 key 操作 / 集群 hash tag。

  **禁止**:在业务代码里 import `redis@4`(那是 cache backend 内部用的) / 创建多个 ioredis 实例 / 在 client 组件里 import `@/lib/redis` / 用 `KEYS *` 在生产 / 拿 Redis 当主存(永远是辅存或缓存)。

  全局架构约束见同目录 `AGENTS.md`;数据层全景见 `nextjs-best-practices/references/data-layer.md`;ORM(Postgres 主存)走 `drizzle-orm` skill。
---

# Redis —— 统一骨架的 Redis 规范

> 统一骨架把 Redis 用在两个**完全独立的角色**上。两个角色都很重要,但用法 / 库 / 调优思路不同 —— 不要混淆。

| 角色 | 客户端 | 文件 | 何时连 | 谁读写 |
| --- | --- | --- | --- | --- |
| 应用层 | `ioredis@^5` | `lib/redis/client.ts` | `lazyConnect: true`,首次用时 | 业务代码(rate limit / pub-sub / 临时状态) |
| Next cache backend | `redis@^4`(via `@neshca/cache-handler@^1.9`) | `cache-handler.mjs` | 进程启动 `CacheHandler.onCreation` | Next.js 自己(`'use cache'` / `revalidateTag` / `updateTag`) |

涉及的骨架文件:

- `lib/redis/client.ts` —— ioredis 单例
- `lib/redis/index.ts` —— 业务唯一入口
- `cache-handler.mjs` —— Next cache backend(@neshca + redis@4)
- `env.ts` —— `REDIS_URL` 校验
- `next.config.ts` —— `cacheHandler: path.resolve(process.cwd(), "cache-handler.mjs")`

---

## 1. 应用层(ioredis,业务代码读写)

### 客户端单例(`lib/redis/client.ts`,**已预置,一般不改**)

```ts
import "server-only";

import Redis from "ioredis";

import { env } from "@/env";

const globalForRedis = globalThis as unknown as {
  __redisClient?: Redis;
};

export const redis =
  globalForRedis.__redisClient ??
  new Redis(env.REDIS_URL, {
    lazyConnect: true,           // 首次用才建连接,启动时不连
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      if (times > 10) return null;     // 10 次后放弃
      return Math.min(times * 200, 5000);   // 指数退避,封顶 5s
    },
    reconnectOnError(error) {
      return error.message.includes("READONLY");   // 主从切换时 READONLY 错误自动重连
    },
  });

if (process.env.NODE_ENV !== "production") globalForRedis.__redisClient = redis;

export type RedisClient = typeof redis;
```

**为什么这样写**:

| 决定 | 原因 |
| --- | --- |
| `import "server-only"` | 防客户端组件 import |
| `globalThis.__redisClient` | dev HMR 每次重编不重连 —— 否则几秒能打爆 connection limit |
| `lazyConnect: true` | 启动时不连,真正用到才连(适配 Edge / serverless 启动) |
| `maxRetriesPerRequest: 3` | 单条命令最多重试 3 次,避免卡死 |
| `retryStrategy` 指数退避 | 网络抖动友好,封顶 5s 防风暴 |
| `reconnectOnError: READONLY` | Sentinel / Cluster 主从切换时,旧主变 slave 会返 `READONLY`,自动切到新主 |

### 业务调用入口(`lib/redis/index.ts`)

```ts
export { redis, type RedisClient } from "./client";
```

业务代码**只 import 这个**:

```ts
import "server-only";
import { redis } from "@/lib/redis";

// 限流
const count = await redis.incr(`ratelimit:${userId}`);
if (count === 1) await redis.expire(`ratelimit:${userId}`, 60);
if (count > 30) throw new ApiError(429, "Too many requests");

// 临时状态(captcha / 一次性 token)
await redis.set(`captcha:${id}`, code, "EX", 300);
const stored = await redis.get(`captcha:${id}`);
await redis.del(`captcha:${id}`);

// pub/sub
await redis.publish("notifications", JSON.stringify({ userId, type: "new-message" }));

// 分布式锁(简易版,推荐用 redlock 库做正式锁)
const ok = await redis.set(`lock:${jobId}`, "1", "PX", 5000, "NX");
if (!ok) throw new Error("Job already running");
```

### 适合放进应用层 Redis 的数据

| 场景 | 数据结构 | 备注 |
| --- | --- | --- |
| Rate limiting | String(counter)+ TTL | `INCR` + `EXPIRE`(只在 1 时设 TTL) |
| Captcha / OTP | String + TTL | `SETEX key TTL value` 一步原子 |
| Session 临时数据(非主 cookie) | Hash + 字段 TTL(`HEXPIRE`,Redis 7.4+) | 主 session 走 cookie,不要换成 Redis |
| 计数器 / 排行榜 | String 或 ZSet | `INCRBY` / `ZINCRBY` |
| 消息广播 | Pub/Sub | 不持久;真要持久用 Stream |
| 任务队列 / 持久消息 | Stream(`XADD` / `XREADGROUP`) | 有 consumer group |
| 分布式锁 | `SET NX EX` | 复杂场景用 redlock 包 |
| 跨实例 in-memory 共享 | Hash / String | 配合 TTL 防积累 |

### 不适合放 Redis 的数据

- 主业务数据 —— 用 Postgres + Drizzle
- 用户主 session(token / tenant_code) —— 用 httpOnly cookie(模板已经预置)
- 大文件 / 图片 —— 用 OSS / CDN
- 关联查询、聚合 —— Postgres 强

---

## 2. Next cache backend(`cache-handler.mjs`,**已预置,一般不改**)

### 为什么需要它

Next 16 的 Cache Components(`'use cache'` + `cacheTag` + `updateTag`)默认是**进程内**缓存。多实例部署时:

- 实例 A 调 `updateTag("notes:list")` 只失效自己的 LRU
- 实例 B 的旧缓存还在
- 用户被 LB 分到 B,看见旧数据 —— bug

`@neshca/cache-handler` 把 Redis 当中央存储,所有实例共享一份 `cacheTag → entry` 的映射 + `updateTag` 广播。

### 模板的 `cache-handler.mjs`

```js
import { CacheHandler } from "@neshca/cache-handler";
import createLruHandler from "@neshca/cache-handler/local-lru";
import createRedisHandler from "@neshca/cache-handler/redis-strings";
import { createClient } from "redis";

CacheHandler.onCreation(async () => {
  const url = process.env.REDIS_URL;

  // 没配 Redis(dev 本地) —— fall back 到内存 LRU(与 Next 默认一致)
  if (!url) return { handlers: [createLruHandler()] };

  const client = createClient({ url });
  client.on("error", (err) => {
    console.warn("[cache-handler] redis error:", err?.message ?? err);
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn(
      "[cache-handler] redis connect failed, using in-memory LRU:",
      err?.message ?? err,
    );
    return { handlers: [createLruHandler()] };
  }

  const redisHandler = await createRedisHandler({
    client,
    keyPrefix: "<PROJECT_NAME>:cache:",   // 多项目共用 Redis 时,改这里防串数据
    timeoutMs: 1000,                    // 1s 超时,慢缓存不阻塞请求
  });

  // 顺序:redis 优先(权威),LRU 兜底(进程内快读)
  return {
    handlers: [redisHandler, createLruHandler()],
  };
});

export default CacheHandler;
```

`next.config.ts` 里挂上:

```ts
cacheHandler: path.resolve(process.cwd(), "cache-handler.mjs"),
```

### 重要约束(动这个文件前必读)

- **dev 不走 Redis**:`next dev` 总是用进程内 LRU(`createLruHandler()`)。Redis 后端只在 `next start` 生产 build 生效。
- **不要在业务代码里 `import { createClient } from "redis"`**:那是 cache backend 私有依赖,业务用 `ioredis`。
- **`keyPrefix` 一定要按项目改**:`<PROJECT_NAME>:cache:` 中的 `<PROJECT_NAME>` 必须替换为当前项目名,否则多个项目共用同一个 Redis 时 `updateTag` 会跨项目误失效。
- **Redis 挂了不会拖死应用**:`try { await client.connect(); } catch { return LRU }` —— 应用退到 LRU(即失去跨实例失效广播,但不报 500)。
- **handlers 顺序不能调**:`redisHandler` 在前是「权威源」,LRU 在后是「进程内快读」。反过来会让 Redis 失效广播失效。

---

## 3. 两个角色的对比 —— 不要混用

| 关注点 | 应用层(`lib/redis`) | cache backend(`cache-handler.mjs`) |
| --- | --- | --- |
| 客户端库 | `ioredis@^5` | `redis@^4`(via `@neshca/cache-handler`) |
| 谁读写 | 你的业务代码 | Next.js 自己 |
| 入口 | `import { redis } from "@/lib/redis"` | 不 import,Next 自动用 |
| 业务 key 前缀 | 自定义(`ratelimit:` / `captcha:` 等) | `<PROJECT_NAME>:cache:`(配置在 cache-handler) |
| 出错怎么办 | ioredis 重试 + 业务捕获 | 自动 fall back 到 LRU |
| dev 行为 | 跟生产一致(连 `REDIS_URL` 指向的 Redis) | 总是 LRU(忽略 `REDIS_URL`) |

两个连接是独立的 ioredis / redis@4 客户端(虽然 URL 相同),**不要**在业务代码里去 `import` cache-handler 的 client。

---

## 4. HA / Sentinel / Cluster 拓扑(运维向)

模板假设 **REDIS_URL 是一个虚拟端点**(k8s Service / HAProxy-with-sentinel / Sentinel-aware proxy),应用代码**不感知**底层是 single / Sentinel / Cluster:

```bash
# 单机
REDIS_URL=redis://:password@localhost:6379

# Cluster / Sentinel(经代理)
REDIS_URL=redis://:password@redis-proxy.svc.cluster.local:6379
```

如果运维真的把原生 Cluster URL 暴露(`redis-cluster://`):

- ioredis 支持原生 Cluster 模式 —— 改 `lib/redis/client.ts` 用 `new Redis.Cluster(nodes)`
- `@neshca/cache-handler` 也支持 cluster handler —— 改 `cache-handler.mjs` 用 `redis-cluster` package

**模板默认走单端点**,推荐运维做代理屏蔽拓扑变化。

---

## 5. 常见操作速查(应用层)

```ts
import { redis } from "@/lib/redis";

// String + TTL(最常用 —— rate limit / captcha)
await redis.set("key", "value");
await redis.set("key", "value", "EX", 60);              // TTL 60s
await redis.setex("key", 60, "value");                  // 同上,旧 API
const v = await redis.get("key");
await redis.del("key");

// 计数(atomic,不会 race)
const n = await redis.incr("counter");                  // returns new value
const m = await redis.incrby("counter", 10);
const f = await redis.decr("counter");

// Hash(字段级访问,不用整个 fetch + parse)
await redis.hset("user:1001", { name: "Alice", email: "alice@example.com" });
const email = await redis.hget("user:1001", "email");
await redis.hexpire("user:1001", 60, "FIELDS", 2, "name", "email");   // 字段级 TTL(Redis 7.4+)

// List(队列)
await redis.lpush("queue", "task-1");
const task = await redis.rpop("queue");
const blocking = await redis.brpop("queue", 5);         // 阻塞 5s 等任务

// Set(去重)
await redis.sadd("tags", "redis", "node", "next");
const isMember = await redis.sismember("tags", "redis");

// Sorted Set(排行榜 / 范围)
await redis.zadd("leaderboard", 100, "alice", 90, "bob");
const top10 = await redis.zrevrange("leaderboard", 0, 9, "WITHSCORES");

// Pipelining(减少 RTT)
const pipe = redis.pipeline();
pipe.set("a", 1);
pipe.set("b", 2);
pipe.get("a");
const results = await pipe.exec();

// 事务(原子)
await redis.multi()
  .set("balance:from", 0)
  .set("balance:to", 100)
  .exec();

// Pub/Sub
await redis.publish("channel", JSON.stringify({ type: "ping" }));

const sub = redis.duplicate();   // pub/sub 必须独立连接
await sub.subscribe("channel");
sub.on("message", (ch, msg) => console.log(ch, msg));
```

**Redis 命令的官方文档**:<https://redis.io/commands/>。ioredis API 与 raw command 一一对应。

---

## 6. 性能 / 安全 —— 通用规则(详见 references)

骨架保留 **16 条通用 Redis 最佳实践**(都与本骨架直接相关 —— 已剔除 RQE / RedisVL / LangCache / 集群 / RESP3 客户端缓存等不适用的规则)。Agent 在做以下事情时务必查阅:

| 主题 | 关键文件 | 何时查 |
| --- | --- | --- |
| 数据结构选 | [`rules/data-choose-structure.md`](./rules/data-choose-structure.md) / [`rules/json-vs-hash.md`](./rules/json-vs-hash.md) | 拿不准用 String / Hash / JSON / ZSet |
| Key 命名 | [`rules/data-key-naming.md`](./rules/data-key-naming.md) | 设计新 key 时 |
| Hash 字段 TTL | [`rules/data-hash-field-expiry.md`](./rules/data-hash-field-expiry.md) | 字段需要独立 TTL |
| 原子计数 | [`rules/data-incr.md`](./rules/data-incr.md) | 计数器 / 限流 |
| 事务 | [`rules/data-transactions.md`](./rules/data-transactions.md) | 多 key 必须一起更 |
| 慢命令(`KEYS *` / `HGETALL` 大 hash) | [`rules/conn-blocking.md`](./rules/conn-blocking.md) | 生产前 review |
| Pipelining | [`rules/conn-pipelining.md`](./rules/conn-pipelining.md) | 多 RTT 一次发 |
| 连接池 | [`rules/conn-pooling.md`](./rules/conn-pooling.md) | 高并发 |
| 超时 | [`rules/conn-timeouts.md`](./rules/conn-timeouts.md) | 网络抖动场景 |
| 内存限制 / eviction | [`rules/ram-limits.md`](./rules/ram-limits.md) | 部署调优 |
| TTL 策略 | [`rules/ram-ttl.md`](./rules/ram-ttl.md) | 任何 cache key 必看 |
| 安全 / 网络 / ACL | [`rules/security-auth.md`](./rules/security-auth.md) / [`rules/security-network.md`](./rules/security-network.md) / [`rules/security-acls.md`](./rules/security-acls.md) | 上线前 |
| 观测 | [`rules/observe-commands.md`](./rules/observe-commands.md) / [`rules/observe-metrics.md`](./rules/observe-metrics.md) | 排障 / 监控 |
| Streams vs Pub/Sub | [`rules/stream-choosing-pattern.md`](./rules/stream-choosing-pattern.md) | 任务队列 / 事件流 |

> ⚠️ 这些 `rules/*.md` 的代码示例以 Python(redis-py)/ Java(Jedis)居多。**骨架用 Node.js + ioredis**,概念一致,API 名称按 ioredis 翻译(基本一一对应:`HSET` / `INCR` / `EXPIRE` 等命令名小写就是 ioredis 方法 —— `redis.hset()` / `redis.incr()` / `redis.expire()`)。本 SKILL.md 第 5 节给出了 ioredis 操作速查。

**关于 RQE / RedisVL / LangCache / vector search / 集群多 key 操作 / RESP3 客户端缓存 / Redis JSON 部分更新**:骨架**不使用**这些功能,相关规则文件已从本目录移除。如果将来项目要做向量检索或迁到 Redis Cluster,先在 PR 里讨论引入决策,不要直接装。

本目录下的 `AGENTS.md` 是历史编译产物,由 `npm run build` 基于 `rules/*.md` 重新生成,**当前可能与上面的列表不同步**(因为新的规则集裁掉了 16 条不适用条目);以 `rules/` 目录里实际存在的文件 + 上表为准。

---

## 7. Red Flags(看到立即停下来重做)

- ❌ 业务代码里 `import { createClient } from "redis"` —— 那是 cache backend 私有,业务用 `ioredis`
- ❌ 在客户端组件 `import { redis } from "@/lib/redis"` —— build 报 server-only
- ❌ `KEYS *` 在生产 —— 用 `SCAN`(`redis.scan(cursor, "MATCH", pattern, "COUNT", 100)`)
- ❌ `HGETALL` 大 hash —— 用 `HSCAN` 或拆 key
- ❌ `LRANGE 0 -1` 大 list —— 分页
- ❌ 计数器用 `GET → +1 → SET` —— 必须 `INCR`(原子)
- ❌ 多 key 操作没用事务(`MULTI/EXEC`)或 Lua —— 中间会被别人插入
- ❌ Cluster 多 key 操作没用 hash tag(`{user:1001}:profile` / `{user:1001}:settings`)—— 跨槽报错
- ❌ 缓存 key 没设 TTL —— 累积到 OOM
- ❌ 没设 `maxmemory` / `maxmemory-policy` —— OOM Killer 杀进程
- ❌ Pub/Sub 用主连接 —— 必须 `redis.duplicate()` 出独立连接
- ❌ 在事务 / pipeline 里调外部 API —— 卡住 pool
- ❌ 改 `cache-handler.mjs` 的 `keyPrefix` 但忘了 prod env 一起改 —— 不同环境互相串
- ❌ 把主 session 从 cookie 迁到 Redis —— 模板的 cookie 设计已经覆盖,迁了反而失去 httpOnly 防 XSS 优势

---

## 8. 命令速查

```bash
# 起本地 Redis(骨架不预置 docker-compose;按需自己起一个本机服务)
docker run -p 6379:6379 redis:7-alpine

# 或装本机 Redis 服务,然后把 .env.local 的 REDIS_URL 指过去

# CLI 连接(按你 REDIS_URL 的形态调整)
redis-cli -u $REDIS_URL ping

# 在 CLI 里看 cache backend 写了啥
KEYS <PROJECT_NAME>:cache:*           # 仅 dev / staging 时用,生产用 SCAN
SCAN 0 MATCH <PROJECT_NAME>:cache:* COUNT 100
```

---

## 9. 跨 skill 链接

- Cache Components 与 Redis cache backend 的关系 → [`nextjs-best-practices/references/data-layer.md`](../nextjs-best-practices/references/data-layer.md) 的 "Redis(双用途)" 段
- `'use cache'` / `cacheTag` / `updateTag` 在数据库层的具体用法 → [`drizzle-orm`](../drizzle-orm/SKILL.md)
- 整体技术栈版本与 `redis@4` / `ioredis@5` / `@neshca/cache-handler@1.9` 锁定 → 同目录 [`AGENTS.md`](../AGENTS.md)
