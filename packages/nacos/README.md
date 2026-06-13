# @openconsole/nacos

> 框架无关的 Nacos 客户端 —— 服务发现、动态配置、带插件管线的 fetch HTTP 层。核心零框架耦合，适配器一行接入 **Next.js / Hono / NestJS**。

`@openconsole/nacos` 把官方 [`nacos`](https://www.npmjs.com/package/nacos) Node SDK 包装成一个 fetch 兼容、可声明式配置的客户端：

- **服务发现**：用 `nacos://user-service/path` 直接发起请求，自动解析实例、负载均衡、重试。
- **动态配置**：监听 Nacos 上的 dataId，同步读取快照；变更时按适配器触发缓存失效（Next.js → `revalidateTag`）。
- **服务注册**：可选，把当前进程注册到 Nacos，优雅停机自动反注册。
- **插件管线**：axios 风格的 `onRequest` / `onResponse` / `onError`，内置日志、静态请求头、上游请求头转发。
- **框架无关核心**：核心不 import 任何框架；框架能力（标记动态、上游头透传、缓存失效）走一个三方法的 `Runtime` 端口，由各适配器实现。

## 架构

```
@openconsole/nacos            框架无关核心  create() / fetch / service / config / balancer / plugins
        │  Runtime 端口（markDynamic / upstreamHeaders / revalidate）
        ├── /nextjs           Next.js 16：instrumentation 单例 + Cache Components + revalidateTag + 上游头透传
        ├── /hono             Hono：createNacos() + 中间件（AsyncLocalStorage 注入上游头）
        └── /nestjs           NestJS：NacosModule.forRoot() + NacosService + 请求级中间件
```

核心通过 `Runtime` 端口与框架解耦：

| 方法 | 作用 | Next.js | Hono / NestJS |
| --- | --- | --- | --- |
| `markDynamic()` | 标记当前请求为动态（Next 16 Cache Components） | `next/server` 的 `connection()` | no-op |
| `upstreamHeaders()` | 读当前请求入站头，供 `forward()` 透传 | `next/headers` 的 `headers()` | 请求级 `AsyncLocalStorage` |
| `revalidate(tag)` | 缓存失效 | `next/cache` 的 `revalidateTag()` | no-op（可经选项接入自定义钩子） |

## 安装

```bash
pnpm add @openconsole/nacos nacos
```

> **必需 peer**：`nacos@^2`。**可选 peer**：`next@^16`（仅 `/nextjs`）、`hono@^4`（仅 `/hono`）。NestJS 适配器零依赖，不需要装任何 nest 包到本库（你的应用自带 `@nestjs/common`）。

monorepo 内部包需要在 Next.js 应用里 `transpilePackages`：

```ts
const nextConfig = { transpilePackages: ["@openconsole/nacos"] };
```

## 快速上手

### Next.js 16 —— `@openconsole/nacos/nextjs`

在 `instrumentation.ts` 初始化单例（HMR 安全、优雅停机）：

```ts
// instrumentation.ts
import { init } from "@openconsole/nacos/nextjs";
import { logger, forward } from "@openconsole/nacos";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await init({ plugins: [logger(), forward()] }); // 其余走 NACOS_* 环境变量
}
```

业务侧任意 Server Component / Route Handler / Server Action：

```ts
import { client } from "@openconsole/nacos/nextjs";

const res = await client().fetch("nacos://user-service/users/me");
const orders = await client().service("order-service").get<Order[]>("/orders");
const flags = client().config.get<Flags>("app", {} as Flags);
```

### Hono —— `@openconsole/nacos/hono`

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createNacos } from "@openconsole/nacos/hono";
import { logger, forward } from "@openconsole/nacos";

const nacos = createNacos({ plugins: [logger(), forward()] });
const app = new Hono();

app.use("*", nacos.middleware); // 注入上游头（让 forward() 生效）+ c.set("nacos", client)
app.get("/me", (c) =>
  c.var.nacos.service("user-service").get("/me").then((u) => c.json(u)),
);

await nacos.start();
const server = serve({ fetch: app.fetch, port: 3000 });
process.on("SIGTERM", () => { server.close(); void nacos.stop(); });
```

`createNacos(options?)` 返回 `{ client, middleware, start, stop }`。`options` 在 `NACOS_*` 环境默认值之上浅合并（同 Next 的 `init`），并支持 `onRevalidate` / `contextKey` / `exposeOnContext`。

### NestJS —— `@openconsole/nacos/nestjs`

```ts
// app.module.ts
import { Module } from "@nestjs/common";
import { NacosModule } from "@openconsole/nacos/nestjs";
import { logger, forward } from "@openconsole/nacos";

@Module({
  imports: [NacosModule.forRoot({ global: true, plugins: [logger(), forward()] })],
})
export class AppModule {}
```

```ts
// main.ts —— 挂请求级中间件，让 forward() 拿到上游头
import { nacosRequestScope } from "@openconsole/nacos/nestjs";
app.use(nacosRequestScope);
```

```ts
// 任意 controller / provider
import { NacosService } from "@openconsole/nacos/nestjs";

class UserController {
  constructor(private readonly nacos: NacosService) {}
  me() { return this.nacos.service("user-service").get("/me"); }
}
```

`NacosModule` 在 `OnModuleInit` 时 `start()`、`OnModuleDestroy` 时 `stop()`（生命周期自动接管）。需要异步配置时用 `NacosModule.forRootAsync({ inject, useFactory })`。也可用 `@Inject(NACOS)` 注入原始 `Client`。

### 不用任何框架（自管理生命周期）

```ts
import { create, logger } from "@openconsole/nacos";

const client = create({
  registry: { server: "127.0.0.1:8848" },
  plugins: [logger()],
});
await client.start();
await client.fetch("nacos://user-service/users/me");
// …
await client.stop();
```

## 核心概念

### 服务发现

逻辑 URL 形如 `nacos://<service>/<path>`，客户端会：

1. 从注册中心拉取 service 的健康实例列表（首次拉取后建立长连接订阅，后续推送增量）。
2. 用配置的负载均衡器（`weighted` / `round-robin` / `random` / `sticky`）挑一个实例。
3. 重写为 `http://<ip>:<port>/<path>` 发起真正的 fetch。

```ts
await client.fetch("nacos://user-service/users/me");                 // 默认 weighted
await client.fetch("nacos://user-service/users/me", {                // 单次覆盖 sticky
  balancer: sticky(),
  hint: { key: userId },
});
await client.fetch("nacos://user-service/secure", { scheme: "https" }); // 强制 HTTPS
```

直接传 `http(s)://...` URL 会原样穿透，内外部调用共用一个 client。

### 动态配置

每个 source 在启动时拉取并订阅；`key` 缺省时使用 `dataId`：

```ts
config: {
  sources: [
    { dataId: "feature-flags.json", key: "flags" },
    { dataId: "throttle.json", group: "throttles" },
  ],
  tag: "app-config", // 任一 source 推送变更时经 Runtime.revalidate(tag) 触发缓存失效
}
```

```ts
client.config.get<Flags>("flags", {} as Flags); // 带默认值
client.config.get<Throttle>("throttle.json");    // 可能 undefined
client.config.get();                             // 整个 snapshot
const off = client.config.on((key, value) => { /* 进程内订阅 */ });
```

非 JSON 内容（YAML / properties / 纯文本）原样以字符串存储并打印 warning。

### 服务注册（可选）

启用 `provider.enabled` 后自动探测对外 IP（优先级：`NACOS_HOST_IP` → `POD_IP` → `HOST_IP` → `NACOS_PREFER_INTERFACE` → 第一个非内网 IPv4 → IPv6 → `127.0.0.1`），`registerInstance` 注册并由 SDK 维持心跳，监听 `SIGTERM`/`SIGINT` 在退出前反注册（跳过 K8s/Docker 15–30 秒健康检查窗口）。

> 自动探测阶段对齐 Spring Cloud Commons InetUtils：`NACOS_IGNORE_INTERFACES` 按正则排除网卡（容器部署建议 `docker.*,veth.*,br-.*`，避免选到 docker0 桥接 IP），`NACOS_PREFER_NETWORKS` 按正则只保留匹配网段的 IP（如 `^10\.,^192\.168\.`）。显式 `NACOS_HOST_IP` / `NACOS_PREFER_INTERFACE` 不受这两个筛选影响。

```ts
provider: {
  enabled: true,
  service: "my-service",
  port: 3000,
  weight: 1,
  metadata: { version: process.env.GIT_SHA ?? "dev" },
}
```

### 负载均衡

| 策略 | 适用场景 |
| --- | --- |
| `weighted` | **默认**，按 `weight` 加权；异构集群首选 |
| `round-robin` | 同质实例，严格轮询 |
| `random` | 随机，简单且无状态 |
| `sticky` | 同一个 `hint.key`（用户/租户 id）总落到同一实例 |

也可以传一个对象自己实现 `Balancer`：

```ts
const leastBusy: Balancer = {
  name: "least-busy",
  pick(instances) { return instances.sort((a, b) => weight(a) - weight(b))[0] ?? null; },
};
consumer: { balancer: leastBusy }
```

### 重试 / 超时

```ts
consumer: {
  retry: {
    attempts: 3,            // 总尝试次数，1 表示不重试
    delays: [200, 500],     // 每次重试前的延迟
    when: ({ error, response }) => Boolean(error) || (response && response.status >= 500),
  },
  timeout: 10_000,          // 全局超时
}
client.fetch("nacos://svc/x", { timeout: 2_000 }); // 单次覆盖
```

每次重试重新挑实例，故障自动转移。超时通过 `AbortController` 与调用方 `signal` 用 `AbortSignal.any` 合并。

> ⚠️ 携带 `ReadableStream` body 的请求不能重试（流只能读一次），此时必须 `attempts: 1`。

## 插件

插件管线按声明顺序执行 `onRequest` / `onResponse` / `onError`。返回新对象即替换，返回 `void` 不动。`onError` 抛错被吞掉但 `console.warn`。

### `forward()` —— 自动转发上游请求头

```ts
plugins: [forward()]
plugins: [forward({ exclude: ["x-debug"] })]
```

把当前请求的所有非 hop-by-hop 上游头（cookie、Authorization、Accept-Language、X-Trace-Id、自定义租户头……）原封不动透传给 `nacos://` 下游。**上游头来源由 `Runtime` 端口提供**：Next.js 走 `next/headers`，Hono/NestJS 走中间件灌入的请求级 `AsyncLocalStorage`。

默认行为：仅对 `nacos://` 请求生效（`internalOnly: true`，避免凭据泄露给第三方 host）；自动跳过 hop-by-hop 头；调用方已显式设置的头优先；不在请求作用域时静默降级。

> Hono/NestJS 必须先挂上对应中间件（`nacos.middleware` / `nacosRequestScope`），否则 `forward()` 读不到上游头。后台任务、cron 等无上游可转发的场景请改用 `headers()`。

### `headers()` —— 注入静态请求头

适合后台任务、cron、service-account 调用：

```ts
plugins: [headers({ headers: { authorization: `Bearer ${process.env.SERVICE_TOKEN}`, "x-app": "scheduler" } })]
```

### `logger()` —— 请求日志

```ts
plugins: [logger()]
plugins: [logger({ success: false })]          // 仅记录失败
plugins: [logger({ logger: pino({ name: "nacos" }) })]
```

输出：`[nacos:user-service] GET nacos://user-service/users/me -> 200 (43ms)`。

### 自定义插件

```ts
import type { Plugin } from "@openconsole/nacos";

const traceId: Plugin = {
  name: "trace-id",
  onRequest({ request }) {
    const next = new Request(request, { headers: new Headers(request.headers) });
    next.headers.set("x-trace-id", crypto.randomUUID());
    return next;
  },
};
client.use(traceId);
```

## API 速查

### 顶层 `@openconsole/nacos`（框架无关核心）

```ts
import {
  create,        // (options: Options) => Client          自管理生命周期
  loadEnvOptions, mergeOptions, resolveOptions, DEFAULT_SERVER,            // env 默认值 + 浅合并（适配器复用）
  NO_OP_RUNTIME, withRequestHeaders, currentRequestHeaders, // Runtime 端口 / 请求级 ALS（写适配器用）
  logger, headers, forward,                                // 插件
  roundRobin, random, weighted, sticky, strategy,          // 负载均衡
  HttpError, NoInstanceError, TimeoutError,                // 错误
} from "@openconsole/nacos";

import type { Client, Service, ConfigApi, Options, OptionsOverride, Runtime, Plugin, Balancer, Instance, Retry, FetchOptions } from "@openconsole/nacos";
```

### `@openconsole/nacos/nextjs`

```ts
import {
  init,        // (input?: OptionsOverride | (() => OptionsOverride)) => Promise<Client>
  client,      // () => Client       （未 init 抛错）
  tryClient,   // () => Client | null
  dispose,     // () => Promise<void>（测试 teardown / 强制重启）
  nextRuntime, // Runtime
} from "@openconsole/nacos/nextjs";
// 核心 API（create / 插件 / 负载均衡 / 类型 / 错误）从 @openconsole/nacos 导入
```

### `@openconsole/nacos/hono`

```ts
import { createNacos, honoRuntime, type NacosHono, type NacosHonoOptions } from "@openconsole/nacos/hono";
// createNacos(options?) => { client, middleware, start(), stop() }
```

### `@openconsole/nacos/nestjs`

```ts
import { NacosModule, NacosService, NACOS, nacosRequestScope, nestRuntime, type NacosModuleOptions } from "@openconsole/nacos/nestjs";
// NacosModule.forRoot(options?) / forRootAsync({ inject, useFactory })
```

### `Service`（fluent helper）

```ts
const user = client.service("user-service");
await user.get<UserDto>("/users/me");
await user.post<UserDto>("/users", { name: "Ada" });
await user.put<void>("/users/42", { name: "Ada" });
await user.del<void>("/users/42");
await user.fetch("/users/me"); // 原生 Response
```

body 序列化：`FormData` / `URLSearchParams` / `Blob` / `ArrayBuffer` / `ReadableStream` 自动识别，其它对象 `JSON.stringify`；`content-type` 在未显式设置时自动推断。

## 环境变量

`init` / `createNacos` / `NacosModule.forRoot` 都先调 `loadEnvOptions()` 拿默认值，再叠加传入覆盖。仅 `registry.server` 缺省 `127.0.0.1:8848`。

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `NACOS_SERVER` | Nacos 地址（支持 `host1:8848,host2:8848`） | `127.0.0.1:8848` |
| `NACOS_NAMESPACE` | 命名空间 id | `public` |
| `NACOS_USERNAME` / `NACOS_PASSWORD` | 鉴权 | - |
| `NACOS_CONFIG_TIMEOUT` | ConfigClient 请求超时（ms） | `6000` |
| `NACOS_PROVIDER_ENABLED` | 是否注册当前进程（需同时有 service+port） | `false` |
| `NACOS_PROVIDER_SERVICE` / `NACOS_PROVIDER_PORT` | 注册服务名 / 端口（缺省回退 `PORT`） | - / `$PORT` |
| `NACOS_PROVIDER_GROUP` / `NACOS_PROVIDER_WEIGHT` / `NACOS_PROVIDER_CLUSTER` / `NACOS_PROVIDER_EPHEMERAL` | 分组 / 权重 / 集群 / 临时实例 | `DEFAULT_GROUP` / `1` / - / `true` |
| `NACOS_HOST_IP` / `POD_IP` / `HOST_IP` / `NACOS_PREFER_INTERFACE` | IP 探测来源（IP 值 / K8s 注入 / 网卡名） | - |
| `NACOS_IGNORE_INTERFACES` / `NACOS_PREFER_NETWORKS` | 自动探测按正则排除网卡 / 筛选网段（对齐 InetUtils） | - |
| `NACOS_BALANCER` | `weighted` / `round-robin` / `random` / `sticky` | `weighted` |
| `NACOS_REQUEST_TIMEOUT` | 默认请求超时（ms） | 无 |
| `NACOS_RETRY_ATTEMPTS` | 默认重试次数（含首次） | `1` |
| `NACOS_DISCOVERY_TTL` | 实例列表本地缓存 TTL（ms） | `5000` |
| `NACOS_CONFIG_SOURCES` | 逗号分隔，语法 `dataId[@group][:key]` | - |
| `NACOS_CONFIG_TAG` | 变更时触发的 cache tag | - |

布尔字面量：`1`/`true`/`yes`/`on` → true；`0`/`false`/`no`/`off` → false；其它按未设置。

## 错误类型

```ts
import { HttpError, NoInstanceError, TimeoutError } from "@openconsole/nacos";

try {
  await client.service("user-service").get("/users/me");
} catch (err) {
  if (err instanceof NoInstanceError) { /* Nacos 上无健康实例 */ }
  else if (err instanceof TimeoutError) { /* 单次请求超时 */ }
  else if (err instanceof HttpError) { /* 4xx/5xx；err.status / statusText / body */ }
  else { /* 网络层异常 */ }
}
```

`HttpError` 由 `service` 的 get/post/put/del 抛出（直接 `fetch` 不自动抛，与原生一致）。

## 测试 / 多实例

- 单元测试直接 `create(options)` 拿 `Client`，注入自定义 `runtime` 即可脱离框架。
- `@openconsole/nacos/nextjs` 的 `dispose()` 释放单例（反注册、关闭 SDK、清空 globalThis 槽），用于测试 teardown。
- HMR 期间 Next 的 `init()` 复用 `globalThis.__nacos`，不会重复注册。

## License

参见仓库根目录的 LICENSE。
