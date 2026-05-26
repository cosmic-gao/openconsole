# Redis 通用规则集(索引)

本目录的 `rules/*.md` 是 [Redis Inc. agents-rules](https://github.com/redis/agents-rules) 规则集的本地副本。原仓库提供 29 条规则,**本骨架已裁掉 16 条不适用条目**(RQE / RedisVL / LangCache / 集群多 key / RESP3 客户端缓存 / Redis JSON 部分更新),保留 **18 条直接相关规则**。

> 本文件是索引,**没有正文** —— 找具体规则按下表直接进 `rules/` 对应文件。代码示例多以 Python(redis-py)/ Java(Jedis)给出,**本骨架用 Node.js + ioredis**,概念一致,API 名按 ioredis 翻译(命令名小写就是方法名:`HSET → redis.hset()`、`INCR → redis.incr()` 等)。

骨架本身的 Redis 使用规范见 [`./SKILL.md`](./SKILL.md);ioredis 操作速查在 SKILL.md 第 5 节。

---

## 现存规则(按主题)

### 数据结构与 key(5 条)—— ESSENTIAL

| 规则 | 文件 |
| --- | --- |
| 选对数据结构(String / Hash / List / Set / ZSet / Stream) | [`rules/data-choose-structure.md`](./rules/data-choose-structure.md) |
| key 命名规范(冒号分层,简短) | [`rules/data-key-naming.md`](./rules/data-key-naming.md) |
| Hash 字段级 TTL(Redis 7.4+) | [`rules/data-hash-field-expiry.md`](./rules/data-hash-field-expiry.md) |
| `INCR` / `INCRBY` 原子计数 | [`rules/data-incr.md`](./rules/data-incr.md) |
| `MULTI` / `EXEC` 事务 | [`rules/data-transactions.md`](./rules/data-transactions.md) |

### 内存与过期(2 条)—— ESSENTIAL

| 规则 | 文件 |
| --- | --- |
| `maxmemory` + eviction 策略 | [`rules/ram-limits.md`](./rules/ram-limits.md) |
| 所有 cache key 必须设 TTL | [`rules/ram-ttl.md`](./rules/ram-ttl.md) |

### 连接与性能(4 条)—— ESSENTIAL

| 规则 | 文件 |
| --- | --- |
| 避免生产用 `KEYS *` / 大 `HGETALL`,改用 `SCAN` / `HSCAN` | [`rules/conn-blocking.md`](./rules/conn-blocking.md) |
| 批量命令用 pipelining,降低 RTT | [`rules/conn-pipelining.md`](./rules/conn-pipelining.md) |
| 连接池 / 多路复用 | [`rules/conn-pooling.md`](./rules/conn-pooling.md) |
| 配置连接 / 读写超时 | [`rules/conn-timeouts.md`](./rules/conn-timeouts.md) |

### JSON(1 条)—— USEFUL

| 规则 | 文件 |
| --- | --- |
| JSON vs Hash vs String 选择 | [`rules/json-vs-hash.md`](./rules/json-vs-hash.md) |

### 安全(3 条)—— ESSENTIAL

| 规则 | 文件 |
| --- | --- |
| 生产强制密码 + TLS | [`rules/security-auth.md`](./rules/security-auth.md) |
| 网络访问限制(bind / 防火墙) | [`rules/security-network.md`](./rules/security-network.md) |
| ACL 细粒度权限 | [`rules/security-acls.md`](./rules/security-acls.md) |

### 观测(2 条)—— USEFUL

| 规则 | 文件 |
| --- | --- |
| `SLOWLOG` / `INFO` / `MEMORY DOCTOR` / `CLIENT LIST` | [`rules/observe-commands.md`](./rules/observe-commands.md) |
| 关键指标(内存 / 连接 / 命中率) | [`rules/observe-metrics.md`](./rules/observe-metrics.md) |

### 流(1 条)—— USEFUL

| 规则 | 文件 |
| --- | --- |
| Streams vs Pub/Sub 选择 | [`rules/stream-choosing-pattern.md`](./rules/stream-choosing-pattern.md) |

---

## 已移除的规则(不适用本骨架)

下面这些规则在原始 Redis Inc. 规则集里存在,**本骨架已删除**。如果项目将来引入相关功能,先在 PR 里讨论:

| 主题 | 为什么不用 |
| --- | --- |
| RQE / `FT.CREATE` / `FT.SEARCH` / `FT.AGGREGATE`(6 条) | 骨架不做全文检索 / 二级索引 |
| 向量搜索 / RedisVL / HNSW / FLAT(4 条) | 骨架不做向量检索 / RAG |
| 语义缓存 / LangCache(2 条) | LangCache 是 Redis Cloud 预览特性,骨架不依赖 |
| Cluster hash tags / Cluster 读副本(2 条) | 骨架走单虚拟端点(k8s Service / 代理),应用不感知拓扑 |
| RESP3 客户端缓存(1 条) | ioredis 对 RESP3 client-side caching 支持有限 |
| Redis JSON 部分更新(1 条) | Node 生态下用 Hash 更自然,骨架不引入 RedisJSON 模块 |

要恢复任何一条,在 PR 描述里写明引入原因 + 影响面,再从原仓库拷文件回来。

---

## 与骨架 Redis 规范的关系

| 主题 | 看哪 |
| --- | --- |
| `lib/redis/client.ts` ioredis 单例怎么写 | [`./SKILL.md`](./SKILL.md) 第 1 节 |
| `cache-handler.mjs` Next cache 后端怎么配 | [`./SKILL.md`](./SKILL.md) 第 2 节 |
| 应用层 vs cache 后端两个角色的边界 | [`./SKILL.md`](./SKILL.md) 第 3 节 |
| ioredis API 速查(set / get / incr / hset / pipeline / multi) | [`./SKILL.md`](./SKILL.md) 第 5 节 |
| Cache Components(`'use cache'` / `cacheTag` / `updateTag`)整体姿势 | [`../nextjs-best-practices/references/data-layer.md`](../nextjs-best-practices/references/data-layer.md) |
