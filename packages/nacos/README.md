# @openconsole/nacos

> Next.js 16 专用 Nacos 客户端 —— 服务发现、动态配置、带插件管线的 fetch HTTP 层。

`@openconsole/nacos` 把官方 [`nacos`](https://www.npmjs.com/package/nacos) Node SDK 包装成一个适合 Next.js 16 App Router 心智模型的客户端：

- **服务发现**：用 `nacos://user-service/path` 直接发起请求,自动解析实例、负载均衡、重试。
- **动态配置**：监听 Nacos 上的 dataId,Server Component 同步读取;变更时自动触发 `revalidateTag`。
- **服务注册**：可选,作为 Provider 把当前进程注册到 Nacos,优雅停机自动反注册。
- **插件管线**:axios 风格的 `onRequest` / `onResponse` / `onError`,内置日志、静态请求头、上游请求头转发。
- **HMR 友好**:`globalThis` 单例,Next.js 开发模式下热更新不会重复注册或泄漏订阅。

## 安装

```bash
pnpm add @openconsole/nacos nacos
```

> **Peer 依赖**:`next@^16`、`nacos@^2`。本包只面向 Node.js Runtime,Edge Runtime 会主动抛错。

如果应用是 monorepo 内部包,需要在 `next.config.ts` 加入 `transpilePackages`:

```ts
const nextConfig = {
  transpilePackages: ["@openconsole/nacos"],
};
```

## 快速上手

### 1. 在 `instrumentation.ts` 初始化

最小写法：所有配置走环境变量，代码里只调 `init()`：

```ts
// instrumentation.ts
import { init } from "@openconsole/nacos";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await init();
}
```

对应的 `.env.local`：

```bash
NACOS_SERVER=127.0.0.1:8848
NACOS_PROVIDER_ENABLED=true
NACOS_PROVIDER_SERVICE=nextjs-admin
NACOS_CONFIG_SOURCES=app.json:app
NACOS_CONFIG_TAG=app-config
```

需要在代码里写死的细节（比如自定义插件、动态计算的端口）可以传入覆盖：

```ts
import { init, logger, forward } from "@openconsole/nacos";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await init({
    consumer: { retry: { attempts: 3, delays: [100, 300] } },
    plugins: [logger(), forward()], // 覆盖默认仅 forward()
  });
}
```

完整的工厂形式，所有字段都手写：

```ts
await init(() => ({
  registry: {
    server: "127.0.0.1:8848",
    namespace: "dev",
    username: "u",
    password: "p",
  },
  provider: {
    enabled: true,
    service: "nextjs-admin",
    port: 3000,
  },
  consumer: {
    balancer: "weighted",
    timeout: 10_000,
    retry: { attempts: 3, delays: [100, 300] },
  },
  config: {
    sources: [{ dataId: "app.json", key: "app" }],
    tag: "app-config",
  },
  plugins: [logger(), forward()],
}));
```

**合并规则**：env 默认值与传入的覆盖按 section 浅合并（registry / provider /
consumer / config），同名字段覆盖优先；`plugins` 传入即整体替换，不传则继承
env 默认的 `[forward()]`。

### 2. 在 Server Component / Route Handler / Server Action 使用

```ts
// app/users/[id]/page.tsx
import { client } from "@openconsole/nacos";

export default async function UserPage({ params }: { params: { id: string } }) {
  // 写法 1:逻辑 URL,自动解析 + 负载均衡 + 重试
  const res = await client().fetch(`nacos://user-service/users/${params.id}`);
  const user = await res.json();

  // 写法 2:fluent service helper,自动序列化、自动解析
  const orders = await client().service("order-service").get<Order[]>(
    `/orders?userId=${params.id}`,
  );

  // 同步读取动态配置
  const flags = client().config.get<Flags>("app", {} as Flags);

  return <UserView user={user} orders={orders} flags={flags} />;
}
```

## 核心概念

### 服务发现

逻辑 URL 形如 `nacos://<service>/<path>`,客户端会:

1. 从注册中心拉取 service 的健康实例列表(首次拉取后建立长连接订阅,后续推送增量)。
2. 用配置的负载均衡器(`weighted` / `round-robin` / `random` / `sticky`)挑一个实例。
3. 重写为 `http://<ip>:<port>/<path>` 发起真正的 fetch。

```ts
// 默认 weighted
await client().fetch("nacos://user-service/users/me");

// 单次覆盖:用 sticky,按用户 id 选实例
await client().fetch("nacos://user-service/users/me", {
  balancer: sticky(),
  hint: { key: userId },
});

// 强制 HTTPS,默认是 http
await client().fetch("nacos://user-service/secure", { scheme: "https" });
```

直接传 `http(s)://...` URL 也可以,会原样穿透,这样内外部调用可以共用一个 `client()`。

### 动态配置

每个 `sources[i]` 在启动时拉取并订阅;`key` 缺省时使用 `dataId`:

```ts
config: {
  sources: [
    { dataId: "feature-flags.json", key: "flags" },
    { dataId: "throttle.json", group: "throttles" },
  ],
  tag: "app-config", // 任一 source 推送变更时,对该 cache tag 触发 revalidateTag
}
```

读取:

```ts
client().config.get<Flags>("flags", {} as Flags); // 带默认值
client().config.get<Throttle>("throttle.json"); // 可能 undefined
client().config.get(); // 整个 snapshot
```

进程内订阅变更:

```ts
const unsubscribe = client().config.on((key, value) => {
  if (key === "flags") console.log("flags updated", value);
});
```

JSON 之外的内容(YAML / properties / 纯文本)会原样以字符串形式存储,并打印一条 warning,可在 `on()` 回调里自行解析。

### 服务注册(可选)

启用 `provider.enabled` 后,客户端会:

1. 自动探测对外 IP(优先级:`NACOS_HOST_IP` → `POD_IP` → `HOST_IP` → `NACOS_PREFER_INTERFACE` → 第一个非内网 IPv4)。
2. 调用 `registerInstance` 注册到 Nacos,SDK 自动维持心跳。
3. 监听 `SIGTERM` / `SIGINT`,在进程退出前调用 `deregisterInstance`,避免 K8s/Docker 15–30 秒的健康检查窗口。

```ts
provider: {
  enabled: true,
  service: "nextjs-admin",
  port: 3000,
  // ip: "10.0.0.1",       // 显式指定,跳过自动探测
  weight: 1,
  cluster: "default",
  metadata: { version: process.env.GIT_SHA ?? "dev" },
}
```

多网卡机器建议设置 `NACOS_PREFER_INTERFACE=eth0` 或直接 `NACOS_HOST_IP=10.x.x.x`,避免每次启动选到不同 IP。

### 负载均衡

| 策略          | 适用场景                                                         |
| ------------- | ---------------------------------------------------------------- |
| `weighted`    | **默认**,按 `weight` 加权;异构集群首选                          |
| `round-robin` | 同质实例,严格轮询                                                |
| `random`      | 随机,简单且无状态                                                |
| `sticky`      | 同一个 `hint.key`(用户 id / 租户 id)总是落到同一实例           |

也可以传一个对象自己实现 `Balancer`:

```ts
const leastBusy: Balancer = {
  name: "least-busy",
  pick(instances) {
    return instances.sort((a, b) => weight(a) - weight(b))[0] ?? null;
  },
};

consumer: { balancer: leastBusy }
```

### 重试

```ts
consumer: {
  retry: {
    attempts: 3,                // 总尝试次数,1 表示不重试
    delays: [200, 500],         // 每次重试前的延迟,索引 0 对应第一次重试
    when: ({ error, response }) =>
      Boolean(error) || (response && response.status >= 500),
  },
}
```

每次重试都会重新挑实例,所以网络故障/单实例宕机会自动转移。

> ⚠️ 携带 `ReadableStream` body 的请求不能重试(流只能读一次),此时必须 `attempts: 1`,否则会立即抛错。

### 超时

```ts
consumer: { timeout: 10_000 }                           // 全局
client().fetch("nacos://svc/x", { timeout: 2_000 })    // 单次覆盖
```

超时通过 `AbortController` 实现,会与调用方传入的 `signal` 合并(优先用原生 `AbortSignal.any`,Node < 20 回退到手工合并)。

## 插件

插件管线按声明顺序执行 `onRequest` / `onResponse` / `onError`。`onRequest` / `onResponse` 返回新对象即替换,返回 `void` 则不动。`onError` 抛错被吞掉但会 `console.warn`,保证原始错误不被遮蔽。

### `forward()` —— 自动转发上游请求头

```ts
plugins: [forward()]
// 或
plugins: [forward({ exclude: ["x-debug"] })]
```

读取 Next.js 当前请求作用域里的 `headers()`,把所有上游请求头(cookie、Authorization、Accept-Language、X-Trace-Id、自定义租户头……)原封不动地透传给 `nacos://` 下游服务。

**默认行为**:

- 仅对 `nacos://` 请求生效(`internalOnly: true`),避免凭据泄露到 Stripe / OpenAI 等第三方 host。
- 自动跳过 hop-by-hop 头(`host`、`content-length`、`transfer-encoding`、`connection`、`keep-alive` 等),这些头描述的是上游 socket,直接转发会导致下游 415 / 502。
- 调用方已显式设置的头优先(caller wins),不会被上游值覆盖。
- 不在请求作用域(后台任务、cron、instrumentation)调用时静默降级,不影响业务请求。

如果要对外部 host 也带上某些请求头,把 `internalOnly: false` 打开,但请只对你自己控制的 hostname 这样做。

### `headers()` —— 注入静态请求头

适合后台任务、cron、service account 调用,因为这些场景没有上游请求可转发:

```ts
plugins: [
  headers({
    headers: {
      authorization: `Bearer ${process.env.SERVICE_TOKEN}`,
      "x-app": "scheduler",
    },
  }),
]
```

构造时会快照 `headers` 对象,后续修改原对象不会影响已注册的插件。

### `logger()` —— 请求日志

```ts
plugins: [logger()]
// 仅记录失败
plugins: [logger({ success: false })]
// 自定义 logger
plugins: [logger({ logger: pino({ name: "nacos" }) })]
```

输出格式:`[nacos:user-service] GET nacos://user-service/users/me -> 200 (43ms)`。

### 自定义插件

```ts
import type { Plugin } from "@openconsole/nacos";

const traceId: Plugin = {
  name: "trace-id",
  onRequest({ request }) {
    const id = crypto.randomUUID();
    const next = new Request(request, {
      headers: new Headers(request.headers),
    });
    next.headers.set("x-trace-id", id);
    return next;
  },
};

client().use(traceId); // 运行时挂载
```

## API 速查

### 顶层导出

```ts
import {
  // 生命周期(Next.js 单例)
  init,         // (input?: OptionsOverride | (() => OptionsOverride)) => Promise<Client>
  client,       // () => Client                  (未初始化时抛错)
  tryClient,    // () => Client | null
  dispose,      // () => Promise<void>           (测试 / 强制重启)

  // 底层
  create,       // (options) => Client           (自己管理生命周期时用)
  loadEnvOptions, // () => Options               (拿一份 env 默认值用于自定义合并)
  DEFAULT_SERVER, // "127.0.0.1:8848"

  // 插件
  logger,
  headers,
  forward,

  // 负载均衡
  roundRobin,
  random,
  weighted,
  sticky,
  strategy,     // (name | balancer | undefined) => Balancer

  // 错误
  HttpError,
  NoInstanceError,
  TimeoutError,
} from "@openconsole/nacos";

import type {
  Client,
  Service,
  ConfigApi,
  Options,
  Plugin,
  Balancer,
  Instance,
  Retry,
  FetchOptions,
  // …其它类型
} from "@openconsole/nacos";
```

### `Client`

```ts
interface Client {
  start(): Promise<void>;
  stop(): Promise<void>;

  // 服务感知的 fetch
  fetch(input: string | URL | Request, init?: FetchOptions): Promise<Response>;
  discover(service: string, hint?: Hint): Promise<Instance>;
  service(name: string): Service;
  use(plugin: Plugin): void;

  // 底层句柄
  readonly registry: Registry;
  readonly discovery: Discovery;
  readonly http: Http;
  readonly provider: Provider | null;
  readonly config: ConfigApi;
  readonly plugins: Plugins;
}
```

### `Service`(fluent helper)

```ts
const user = client().service("user-service");

await user.get<UserDto>("/users/me");
await user.post<UserDto>("/users", { name: "Ada" });
await user.put<void>("/users/42", { name: "Ada" });
await user.del<void>("/users/42");
await user.fetch("/users/me");  // 原生 Response
```

body 序列化规则:`FormData` / `URLSearchParams` / `Blob` / `ArrayBuffer` / `ReadableStream` 自动识别,其它对象 `JSON.stringify`。`content-type` 在调用方未显式设置时自动推断。

### `Options`

```ts
interface Options {
  registry: {
    server: string;            // "127.0.0.1:8848" 或 "host1:8848,host2:8848"
    namespace?: string;        // 默认 "public"
    username?: string;
    password?: string;
    timeout?: number;          // ConfigClient 的 requestTimeout,默认 6000
  };

  provider?: {
    enabled: boolean;
    service: string;
    port: number;
    ip?: string;               // 显式 IP,跳过自动探测
    group?: string;            // 默认 "DEFAULT_GROUP"
    weight?: number;
    cluster?: string;
    metadata?: Record<string, string>;
    ephemeral?: boolean;       // 默认 true
  };

  consumer?: {
    balancer?: Strategy;       // "weighted"(默认) / "round-robin" / "random" / "sticky" / Balancer
    timeout?: number;
    retry?: Retry;
    ttl?: number;              // 实例列表本地缓存 TTL,默认 5000ms
  };

  config?: {
    sources?: Array<{ dataId: string; group?: string; key?: string }>;
    tag?: string;              // 任何一条 source 推送变更时 revalidateTag(tag)
  };

  plugins?: Plugin[];
}
```

## 环境变量

调用 `init()` 时会先调用 `loadEnvOptions()` 拿到下表所有变量的默认值，然后
把传入的覆盖叠加上去。仅有 `registry.server` 缺省（默认 `127.0.0.1:8848`）；
其它字段未设置时保留各自子模块的默认行为。

### 注册中心

| 变量                   | 作用                                            | 默认             |
| ---------------------- | ----------------------------------------------- | ---------------- |
| `NACOS_SERVER`         | Nacos 地址（支持 `host1:8848,host2:8848` 多写） | `127.0.0.1:8848` |
| `NACOS_NAMESPACE`      | 命名空间 id                                     | `public`         |
| `NACOS_USERNAME`       | 鉴权用户名                                      | -                |
| `NACOS_PASSWORD`       | 鉴权密码                                        | -                |
| `NACOS_CONFIG_TIMEOUT` | ConfigClient 请求超时（毫秒）                   | `6000`           |

### 服务注册 / Provider

`NACOS_PROVIDER_ENABLED` 为 true **并且** 同时提供 service 与 port 时才会
启用，否则整个 provider 段视为未启用。

| 变量                       | 作用                          | 默认            |
| -------------------------- | ----------------------------- | --------------- |
| `NACOS_PROVIDER_ENABLED`   | 是否注册当前进程到 Nacos      | `false`         |
| `NACOS_PROVIDER_SERVICE`   | 注册的服务名                  | -               |
| `NACOS_PROVIDER_PORT`      | 服务端口；缺省回退到 `PORT`   | `$PORT`         |
| `NACOS_PROVIDER_GROUP`     | 分组名                        | `DEFAULT_GROUP` |
| `NACOS_PROVIDER_WEIGHT`    | 权重                          | `1`             |
| `NACOS_PROVIDER_CLUSTER`   | 集群名                        | -               |
| `NACOS_PROVIDER_EPHEMERAL` | 是否注册为临时实例            | `true`          |
| `NACOS_HOST_IP`            | 显式 IP（最高优先级）         | -               |
| `POD_IP` / `HOST_IP`       | K8s Downward API 注入的 IP    | -               |
| `NACOS_PREFER_INTERFACE`   | 多网卡时使用哪个网卡          | -               |

### 消费端

| 变量                    | 作用                                                          | 默认       |
| ----------------------- | ------------------------------------------------------------- | ---------- |
| `NACOS_BALANCER`        | `weighted` / `round-robin` / `random` / `sticky`              | `weighted` |
| `NACOS_REQUEST_TIMEOUT` | 默认请求超时（毫秒）                                          | 无超时     |
| `NACOS_RETRY_ATTEMPTS`  | 默认重试次数（含首次尝试）                                    | `1`        |
| `NACOS_DISCOVERY_TTL`   | 实例列表本地缓存 TTL（毫秒）                                  | `5000`     |

### 动态配置

| 变量                   | 作用                                                | 默认 |
| ---------------------- | --------------------------------------------------- | ---- |
| `NACOS_CONFIG_SOURCES` | 逗号分隔的 source 列表，语法：`dataId[@group][:key]` | -    |
| `NACOS_CONFIG_TAG`     | 变更时触发的 cache tag 名                            | -    |

`NACOS_CONFIG_SOURCES` 示例：

```bash
# 单个 source
NACOS_CONFIG_SOURCES=app.json

# 自定义 snapshot key
NACOS_CONFIG_SOURCES=flags.json:flags

# 指定 group + key
NACOS_CONFIG_SOURCES=throttle.yaml@throttles:throttle

# 多条混用
NACOS_CONFIG_SOURCES=app.json:app,flags.json:flags,throttle.yaml@throttles:throttle
```

### 布尔字面量解析规则

- **true**：`1` / `true` / `yes` / `on`（大小写不敏感）
- **false**：`0` / `false` / `no` / `off`
- 其它值按未设置处理

## 错误类型

```ts
import { HttpError, NoInstanceError, TimeoutError } from "@openconsole/nacos";

try {
  await client().service("user-service").get("/users/me");
} catch (err) {
  if (err instanceof NoInstanceError) {
    // 服务在 Nacos 中没有健康实例
  } else if (err instanceof TimeoutError) {
    // 单次请求超时
  } else if (err instanceof HttpError) {
    // 4xx / 5xx 响应;err.status / err.statusText / err.body
  } else {
    // 网络层异常等
  }
}
```

## 测试 / 多进程

- `dispose()`:释放当前单例(反注册、关闭 SDK、清除 globalThis 槽),用于测试 teardown 或强制重启。
- 单元测试可直接 `create(options)` 拿到 `Client`,跳过单例机制。
- HMR 期间 `init()` 会复用 `globalThis.__nacos`,不会重复注册到 Nacos。

## 常见问题

**Q:Edge Runtime 报错 `[nacos] requires the Node.js runtime`?**
A:本包依赖 `node:os`、`node:process`,只能跑在 Node.js Runtime。在 Route Handler / Page 顶部加 `export const runtime = "nodejs"`,或者用 `if (process.env.NEXT_RUNTIME === "nodejs")` 守护后再 import。

**Q:本地开发用 `forward()` 但下游一直拿不到 cookie?**
A:确认调用栈在 Server Component / Server Action / Route Handler 里。Client Component 中调用 `fetch` 实际是浏览器发起,不会经过本插件。

**Q:`config.get()` 永远返回 fallback?**
A:检查:① `init()` 已 `await`;② `sources[i].dataId` 在 Nacos 上确实存在;③ 启动日志没有 `config '<dataId>' is not JSON` 的 warning(若有,内容是字符串而非对象)。

**Q:为什么默认是 `weighted` 而不是 `round-robin`?**
A:异构集群比同质集群更常见;同质集群里所有实例 `weight=1`,`weighted` 等价于 `random`,行为不会有意外。需要严格轮询时显式指定 `"round-robin"`。

## 与同类库的差异

| 维度         | `@openconsole/nacos`                                         | 直接用 `nacos` SDK                    |
| ------------ | ------------------------------------------------------------ | ------------------------------------- |
| API 风格     | fetch 兼容 + service helper                                  | 命名式(`getAllInstances` / `getConfig`) |
| 重试 / 超时  | 内置,可声明式配置                                            | 自己包                                 |
| 负载均衡     | 4 种内置 + 可扩展                                            | 没有,SDK 只返回列表                  |
| 动态配置     | 同步快照 + 自动 `revalidateTag`                              | 手动订阅 + 自己存                     |
| HMR 安全     | `globalThis` 单例                                            | 自己处理                              |
| 上游头转发   | `forward()` 一行启用                                          | 自己实现                              |
| Next.js 集成 | 一等公民:`instrumentation` / `next/cache` / `next/headers` | 与运行时无关                          |
| 体积         | 极薄(类型 + 一层包装)                                       | 原生                                  |

## License

参见仓库根目录的 LICENSE。
