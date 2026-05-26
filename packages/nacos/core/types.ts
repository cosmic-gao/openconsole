/**
 * 包内共享类型定义。
 *
 * 类型名不带 `Nacos*` 前缀，调用方通过命名空间导入消歧：
 *
 * @example
 * ```ts
 * import * as nacos from "@openconsole/nacos";
 * // 或
 * import type { Client, Instance } from "@openconsole/nacos";
 * ```
 *
 * @module
 */

/**
 * Nacos 协议层的默认分组名。
 *
 * 由 Nacos 服务端硬编码，不可按调用粒度配置；任何 API 的 `group?: string`
 * 缺省时都会落到这个常量。
 */
export const DEFAULT_GROUP = "DEFAULT_GROUP";

// 服务发现

/** Nacos 实例。统一抹平 SDK 字段差异，对外只暴露调度需要的属性。 */
export interface Instance {
  /** 注册中心分配的实例 id；SDK 未返回时为 undefined。 */
  id?: string;
  /** 服务名。 */
  service: string;
  /** 实例 IP。 */
  ip: string;
  /** 实例端口。 */
  port: number;
  /** 健康状态：false 时被负载均衡器过滤掉。 */
  healthy: boolean;
  /** 启用状态：false 表示运维人工下线。 */
  enabled: boolean;
  /** 权重，缺省按 1 计算。 */
  weight?: number;
  /** 所属集群（Nacos 概念，不是 K8s 集群）。 */
  cluster?: string;
  /** 自定义元数据。 */
  metadata?: Record<string, string>;
}

/** 注册 / 反注册时的可选参数。 */
export interface RegisterOptions {
  /** 分组名；缺省 {@link DEFAULT_GROUP}。 */
  group?: string;
  /** 是否为临时实例（依赖心跳维持）；缺省 true。 */
  ephemeral?: boolean;
}

/**
 * 注册中心抽象。当前唯一实现是 {@link NacosRegistry}；接口保留只是为了
 * 让测试可以注入 fake，以及未来接入其它注册中心（Consul、Eureka 等）时
 * 不用改上层。
 */
export interface Registry {
  /** 等待连接就绪。可重入。 */
  ready(): Promise<void>;
  /** 关闭客户端，释放资源。可重入。 */
  close(): Promise<void>;

  /** 把当前进程作为实例注册到服务端。 */
  register(instance: Instance, opts?: RegisterOptions): Promise<void>;
  /** 反注册实例。优雅停机时调用。 */
  deregister(instance: Instance, opts?: RegisterOptions): Promise<void>;
  /** 拉取服务的全量实例列表（含不健康/已下线的，过滤交给上层）。 */
  list(service: string, group?: string): Promise<Instance[]>;
  /** 订阅服务实例变化，回调收到新的全量列表。 */
  watch(
    service: string,
    listener: (instances: Instance[]) => void,
    group?: string,
  ): Promise<void>;
  /** 取消 {@link watch}。listener 引用必须与订阅时一致。 */
  unwatch(
    service: string,
    listener: (instances: Instance[]) => void,
    group?: string,
  ): Promise<void>;

  /** 一次性读取某 dataId 的内容。 */
  read(dataId: string, group?: string): Promise<string | null>;
  /** 订阅 dataId 变更，回调收到全量新内容。 */
  observe(
    dataId: string,
    listener: (content: string) => void,
    group?: string,
  ): Promise<void>;
  /** 取消 {@link observe}。listener 引用必须与订阅时一致。 */
  unobserve(
    dataId: string,
    listener: (content: string) => void,
    group?: string,
  ): Promise<void>;
}

// 负载均衡

/** 负载均衡器的运行时提示。 */
export interface Hint {
  /** 黏性键，常用业务实体 id（user / tenant），用于 sticky 策略。 */
  key?: string;
  /** 当前重试次数；由 {@link Http} 的重试循环写入。 */
  attempt?: number;
}

/** 负载均衡策略接口。自定义策略实现该接口即可。 */
export interface Balancer {
  /** 策略名，仅用于日志与调试。 */
  readonly name: string;
  /** 从健康实例中挑一个；空数组返回 null。 */
  pick(instances: Instance[], hint?: Hint): Instance | null;
}

/** 内置策略名或自定义 {@link Balancer} 对象。 */
export type Strategy =
  | "round-robin"
  | "random"
  | "weighted"
  | "sticky"
  | Balancer;

// 重试

/** 单次请求的重试策略。 */
export interface Retry {
  /** 总尝试次数（包括首次）；`1` 表示不重试。 */
  attempts: number;
  /** 每次重试前的延迟（毫秒）；index 0 对应第一次重试前。 */
  delays?: number[];
  /** 判定本次结果是否要继续重试的谓词。 */
  when?: (input: RetryInput) => boolean;
}

/** 传给 {@link Retry.when} 的判定参数。 */
export interface RetryInput {
  /** 当前重试次数，0 表示首次尝试。 */
  attempt: number;
  /** 本次抛出的异常；与 response 互斥。 */
  error?: unknown;
  /** 本次得到的响应；与 error 互斥。 */
  response?: Response;
}

// 插件管线

/** 插件钩子的运行上下文。 */
export interface Context {
  /** 逻辑服务名；直接 http(s):// 调用时为 undefined。 */
  service?: string;
  /** 当前重试次数，从 0 开始。 */
  attempt: number;
  /** 请求开始时间（`Date.now()`）。 */
  startedAt: number;
}

/** `onRequest` 钩子收到的入参。 */
export interface RequestStep {
  request: Request;
  context: Context;
}

/** `onResponse` 钩子收到的入参。 */
export interface ResponseStep {
  request: Request;
  response: Response;
  context: Context;
}

/** `onError` 钩子收到的入参。 */
export interface ErrorStep {
  request: Request;
  error: unknown;
  context: Context;
}

/**
 * 插件定义。钩子返回新 Request/Response 即替换当前对象，返回 `void` 保持原样。
 *
 * @example
 * ```ts
 * const traceId: Plugin = {
 *   name: "trace-id",
 *   onRequest({ request }) {
 *     const next = new Request(request, { headers: new Headers(request.headers) });
 *     next.headers.set("x-trace-id", crypto.randomUUID());
 *     return next;
 *   },
 * };
 * ```
 */
export interface Plugin {
  /** 插件名，仅用于日志与调试。 */
  readonly name: string;
  onRequest?: (step: RequestStep) => Request | void | Promise<Request | void>;
  onResponse?: (step: ResponseStep) => Response | void | Promise<Response | void>;
  onError?: (step: ErrorStep) => void | Promise<void>;
}

// HTTP 参数

/**
 * `client.fetch()` / `service.*()` 的扩展参数。继承 `RequestInit`，附加
 * 几个 Nacos 专属字段。
 */
export interface FetchOptions extends RequestInit {
  /** 本次调用使用的负载均衡器，覆盖 `consumer.balancer`。 */
  balancer?: Balancer;
  /** 负载均衡提示（sticky 键、重试次数）。 */
  hint?: Hint;
  /** 单次调用超时（毫秒），覆盖 `consumer.timeout`。 */
  timeout?: number;
  /** 单次调用重试策略，覆盖 `consumer.retry`。 */
  retry?: Retry;
  /** 服务分组，覆盖 {@link DEFAULT_GROUP}。 */
  group?: string;
  /**
   * 解析 `nacos://` 后使用的协议；优先级高于 query 参数 `?scheme=https`。
   */
  scheme?: "http" | "https";
}

// 顶层配置

/** `create()` / `init()` 的顶层配置。 */
export interface Options {
  registry: RegistryOptions;
  provider?: ProviderOptions;
  consumer?: ConsumerOptions;
  config?: ConfigOptions;
  plugins?: Plugin[];
}

/** 注册中心连接参数。 */
export interface RegistryOptions {
  /** Nacos 服务地址，支持逗号分隔的多节点：`host1:8848,host2:8848`。 */
  server: string;
  /** 命名空间 id；缺省 `"public"`。 */
  namespace?: string;
  /** 鉴权用户名（启用鉴权时必填）。 */
  username?: string;
  /** 鉴权密码（启用鉴权时必填）。 */
  password?: string;
  /** ConfigClient 的 requestTimeout，毫秒；缺省 6000。 */
  timeout?: number;
}

/** 服务注册（Provider）参数。 */
export interface ProviderOptions {
  /** 是否启用注册；为 false 时下面字段全部忽略。 */
  enabled: boolean;
  /** 注册到 Nacos 上的服务名。 */
  service: string;
  /** 本进程对外端口。 */
  port: number;
  /**
   * 显式 IP。缺省时按以下顺序自动探测：
   *
   * 1. `NACOS_HOST_IP`
   * 2. `POD_IP`（K8s Downward API）
   * 3. `HOST_IP`
   * 4. `NACOS_PREFER_INTERFACE` 指定的网卡
   * 5. 第一个非内网 IPv4
   * 6. 兜底 `127.0.0.1`
   */
  ip?: string;
  /** 分组名，缺省 {@link DEFAULT_GROUP}。 */
  group?: string;
  /** 权重，缺省 1。 */
  weight?: number;
  /** 集群名。 */
  cluster?: string;
  /** 自定义元数据，会注册到 Nacos 上供其它消费者读取。 */
  metadata?: Record<string, string>;
  /** 是否注册为临时实例；缺省 true。 */
  ephemeral?: boolean;
}

/** 消费端（默认负载均衡 / 超时 / 重试 / 缓存）参数。 */
export interface ConsumerOptions {
  /** 默认负载均衡策略，缺省 `"weighted"`。 */
  balancer?: Strategy;
  /** 默认请求超时（毫秒）。 */
  timeout?: number;
  /** 默认重试策略。 */
  retry?: Retry;
  /** 实例列表本地缓存 TTL（毫秒），缺省 5000。 */
  ttl?: number;
}

/** 动态配置参数。 */
export interface ConfigOptions {
  /** 每条 source 在 snapshot 中暴露为一个顶层键（`key` 缺省时取 `dataId`）。 */
  sources?: Array<{ dataId: string; group?: string; key?: string }>;
  /** 任一 source 推送变更时触发 `revalidateTag(tag)`。 */
  tag?: string;
}
