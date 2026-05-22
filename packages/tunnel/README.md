# @openconsole/tunnel

跨框架路由中间件 - 极致轻量、高性能、框架无关。

## 核心特性

- **零代价热更新 (O(1) HMR)**：基于 FNV-1a 哈希算法的内存路由表，热替换无性能损耗
- **13 个响应函数**：统一 Hono 风格签名 `(data, status?, headers?)`
- **Reply<T> = T | Response**：普通对象兜底 JSON / Response 直接透传
- **前缀 `**` 通配符**：批量卸载路由
- **框架无关**：同一套核心，适配 Hono/Fastify/Koa

## 安装

```bash
npm install @openconsole/tunnel
```

## 快速开始

```typescript
import { Tunnel, json, html, text, notFound, redirect, Hono } from '@openconsole/tunnel';

const adapter = new Hono();
const tunnel = new Tunnel(adapter);

// 注册路由
tunnel.register({
  'GET /api/hello': () => ({ message: 'Hello' }),
  'GET /api/html': () => html('<h1>Hello</h1>'),
  'GET /api/json': () => json({ a: 1 }, 201, { 'X-Custom': 'header' }),
  'GET /api/redirect': () => redirect('/new-location', 301),
  'GET /api/not-found': () => notFound('Resource not found'),
});
```

## 响应函数

### Method 类型

支持的 HTTP 方法（与 Hono 框架一致）：`GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`, `PATCH`（同时支持大小写）

| 函数 | content-type | 说明 |
|-----|-------------|------|
| `json(data, status?, headers?)` | application/json | JSON 响应 |
| `html(html, status?, headers?)` | text/html | HTML 响应 |
| `text(text, status?, headers?)` | text/plain | 文本响应 |
| `xml(xml, status?, headers?)` | application/xml | XML 响应 |
| `body(data, status?, headers?)` | - | 原始 body 响应 |
| `notFound(message?)` | - | 404 响应 |
| `redirect(location, status?)` | - | 重定向响应 |
| `blob(data, contentType?, status?, headers?)` | 自定义 | Blob 响应 |
| `arrayBuffer(data, contentType?, status?, headers?)` | 自定义 | ArrayBuffer 响应 |
| `stream(readable, contentType?, status?, headers?)` | 自定义 | 流式响应 |
| `streamText(text, contentType?, status?, headers?)` | text/plain | 文本流响应 |
| `streamSSE(source, status?, headers?)` | text/event-stream | SSE 响应 |
| `upgradeWebSocket(status?, headers?)` | - | WebSocket 升级 |

### Reply<T> 类型

```typescript
type Reply<T> = T | Response;
```

- **普通对象 (T)**：由 Adapter 兜底序列化为 JSON
- **Response**：直接透传，支持自定义状态码/Headers

### 路由冲突说明

`/api/*` 和 `/api/hello` **不会冲突**：
- 精确路由 `/api/hello` 优先匹配
- 模糊路由 `/api/*` 作为 fallback

## API 参考

### Tunnel

```typescript
const adapter = new Hono();
const tunnel = new Tunnel(adapter);

// 注册路由（热更新：相同 key 直接替换旧 handler）
tunnel.register({
  'GET /api/users': () => [{ id: 1 }],
});

// 检查路由是否存在
tunnel.has('GET /api/users'); // boolean

// 卸载路由（返回 boolean 表示是否成功）
tunnel.unregister('GET /api/users'); // boolean

// 前缀批量卸载（** 通配符）
tunnel.unregister('GET /api/**'); // boolean
```

### Context<P, L>

| 属性 | 类型 | 说明 |
|-----|------|------|
| `method` | `Method` | HTTP 方法 |
| `pathname` | `string` | 注册时的原始路径 |
| `path` | `string` | 实际请求路径 |
| `params` | `Record<string, string \| undefined>` | 路径参数 |
| `query` | `Record<string, string \| string[] \| undefined>` | 查询参数 |
| `headers` | `Record<string, string \| string[] \| undefined>` | 请求头 |
| `body` | `L` | 请求体（由 transform 解析） |
| `raw` | `P` | 框架原生 Request |

### Adapter<T, P>

```typescript
interface Adapter<T, P> {
  readonly app: T;
  readonly name: string;
  register(method: Method, pathname: string, proxy: (raw: P) => Promise<unknown>): void;
  unregister(method: Method, pathname: string): boolean;
  transform<L = unknown>(raw: P, pathname: string, method: Method): Promise<Context<P, L>>;
}
```

### Hono 适配器

```typescript
import { Tunnel, Hono } from '@openconsole/tunnel';

// 方式1：传入自己的 Hono 实例
const app = new Hono();
const adapter = new Hono(app);

// 方式2：不传，自动创建 Hono 实例
const adapter = new Hono();

const tunnel = new Tunnel(adapter);
```

### MIME_TYPES

```typescript
import { MIME_TYPES, type ContentType } from '@openconsole/tunnel';

MIME_TYPES.json;  // 'application/json'
MIME_TYPES.html;  // 'text/html'
```

## 内存泄漏警告

> **重要**：底层框架（如 Hono 的 RegExpRouter）一旦注册路由，就会将其编译进路由树。Tunnel 的 `unregister` 只是删除了内存 Map 中的引用，底层路由树中的闭包节点依然存在。

- 适用于固定路径的 HMR 热更新或低频的动态路由增删
- **不要**频繁注册/卸载带有动态参数的新路径（如 `/api/temp-1`, `/api/temp-2`），这会导致底层路由树无限膨胀

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        Tunnel                                │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Registry (Map<routeId, Route>) - O(1) 寻址      │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                │
│              ┌─────────────┴─────────────┐                  │
│              ▼                           ▼                  │
│     ┌──────────────┐            ┌──────────────┐          │
│     │   register   │            │   unregister │          │
│     └──────────────┘            └──────────────┘          │
│                            │                                │
│                            ▼                                │
│     ┌──────────────────────────────────────────────┐        │
│     │              Proxy (Flyweight)                │        │
│     │   生成闭包代理，统一分发到 Adapter              │        │
│     └──────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼
               ┌─────────────────────────┐
               │       Adapter           │
               │  ┌─────────────────┐   │
               │  │ transform()     │   │ ← 框架 req → 标准 Context
               │  │ register()      │   │ ← 注册路由 + 智能响应
               │  │ reply<T>()     │   │ ← T 兜底 json / Response 透传
               │  └─────────────────┘   │
               └─────────────────────────┘
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
          ┌────────┐   ┌─────────┐   ┌────────┐
          │  Hono  │   │ Fastify │   │  Koa   │
          └────────┘   └─────────┘   └────────┘
```

## 性能

- **O(1) 路由查找**：FNV-1a 32-bit 哈希算法，将路由字符串转为 SMI Key
- **零拷贝热更新**：直接替换 Map 中的 Handler 引用，无锁无 GC 压力
- **极小体积**：核心包 < 5KB，无外部依赖

## 许可证

MIT