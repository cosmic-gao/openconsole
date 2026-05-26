/**
 * 服务注册（Provider）—— 把当前进程注册到 Nacos。
 *
 * 自动探测对外 IP、注册、由 SDK 维护临时实例心跳、监听 SIGTERM/SIGINT
 * 反注册。K8s/Docker 优雅停机能跳过 15–30 秒的健康检查窗口。
 *
 * 可重入：`start()` 在已运行时为空操作；`stop()` 给 deregister 加了
 * 3 秒超时，避免注册中心 hang 住时把整个 shutdown grace period 吃光。
 *
 * @module
 */
import os from "node:os";

import { DEFAULT_GROUP, type Instance, type ProviderOptions, type Registry } from "./types";

/** deregister 的超时，毫秒。 */
const DEREGISTER_TIMEOUT_MS = 3000;

/** {@link detectIp} 返回值，附带来源便于排查。 */
interface DetectedIp {
  ip: string;
  /** 来源标识，写到启动日志中：`env:NACOS_HOST_IP` / `iface:eth0` / `fallback` 等。 */
  source: string;
}

/**
 * 自动探测对外 IP。
 *
 * 优先级(从高到低):
 * 1. `NACOS_HOST_IP`
 * 2. `POD_IP`(K8s Downward API)
 * 3. `HOST_IP`
 * 4. `NACOS_PREFER_INTERFACE` 指定的网卡(先 IPv4,后 IPv6)
 * 5. 第一个非内网 IPv4
 * 6. 第一个非内网、非 link-local 的 IPv6(`fe80::` 跳过 —— 不能跨节点路由)
 * 7. 兜底 `127.0.0.1`
 *
 * 多网卡机器**强烈建议**显式设置 `NACOS_HOST_IP` 或 `NACOS_PREFER_INTERFACE`,
 * 否则每次启动可能选到不同 IP。
 *
 * IPv6 兜底:IPv4 仍然是首选(大多数 Nacos 部署默认 IPv4),只是在 IPv6-only
 * 网络下不再被迫退到 `127.0.0.1` 注册成无效实例。
 */
function detectIp(): DetectedIp {
  if (process.env.NACOS_HOST_IP)
    return { ip: process.env.NACOS_HOST_IP, source: "env:NACOS_HOST_IP" };
  if (process.env.POD_IP)
    return { ip: process.env.POD_IP, source: "env:POD_IP" };
  if (process.env.HOST_IP)
    return { ip: process.env.HOST_IP, source: "env:HOST_IP" };

  const ifaces = os.networkInterfaces();

  // 显式指定网卡("eth0" / "en0" 等);先匹配 IPv4,没有再 IPv6。
  const preferred = process.env.NACOS_PREFER_INTERFACE;
  if (preferred && ifaces[preferred]) {
    for (const addr of ifaces[preferred] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        return { ip: addr.address, source: `iface:${preferred}` };
      }
    }
    for (const addr of ifaces[preferred] ?? []) {
      if (isUsableIPv6(addr)) {
        return { ip: addr.address, source: `iface:${preferred}:ipv6` };
      }
    }
  }

  // 第一遍:任意非内网 IPv4。
  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        return { ip: addr.address, source: `iface:${name}` };
      }
    }
  }

  // 第二遍:任意非内网、非 link-local 的 IPv6 —— IPv6-only 部署的安全网。
  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list ?? []) {
      if (isUsableIPv6(addr)) {
        return { ip: addr.address, source: `iface:${name}:ipv6` };
      }
    }
  }

  return { ip: "127.0.0.1", source: "fallback" };
}

/**
 * IPv6 地址是否能作为服务注册地址使用。
 *
 * Link-local(`fe80::/10`)只在同一段链路内有效,不能跨节点路由 ——
 * 注册到 Nacos 上消费者无法用它发请求,排除掉。
 */
function isUsableIPv6(addr: os.NetworkInterfaceInfo): boolean {
  if (addr.family !== "IPv6" || addr.internal) return false;
  return !addr.address.toLowerCase().startsWith("fe80:");
}

/** 运行时快照，供 `stop()` 反注册时用。 */
interface Runtime {
  instance: Instance;
  group: string;
}

/**
 * 服务提供方。
 *
 * 由 {@link create} 在 `provider.enabled === true` 时实例化，通过
 * {@link Client.provider} 暴露给业务（一般用不到，主要给运维内省）。
 */
export class Provider {
  private runtime: Runtime | null = null;
  private hooked = false;
  private shuttingDown = false;

  constructor(
    private readonly registry: Registry,
    private readonly opts: ProviderOptions,
  ) {}

  /** 探测 IP、注册实例、挂上 SIGTERM/SIGINT 钩子。已运行时为空操作。 */
  async start(): Promise<void> {
    if (this.runtime || !this.opts.enabled) return;

    let ip: string;
    if (this.opts.ip) {
      ip = this.opts.ip;
    } else {
      const detected = detectIp();
      ip = detected.ip;
      console.info(
        `[nacos] provider ip=${ip} (source=${detected.source}); ` +
          `set NACOS_PREFER_INTERFACE or NACOS_HOST_IP to pin`,
      );
    }

    const instance: Instance = {
      service: this.opts.service,
      ip,
      port: this.opts.port,
      weight: this.opts.weight ?? 1,
      healthy: true,
      enabled: true,
      cluster: this.opts.cluster,
      metadata: this.opts.metadata,
    };

    await this.registry.register(instance, {
      group: this.opts.group ?? DEFAULT_GROUP,
      ephemeral: this.opts.ephemeral ?? true,
    });

    this.runtime = { instance, group: this.opts.group ?? DEFAULT_GROUP };
    this.hook();
  }

  /**
   * 反注册实例。
   *
   * 限时 {@link DEREGISTER_TIMEOUT_MS}：注册中心若 hang 住，超过时间就放弃，
   * 避免把整个进程 shutdown grace period 吃完。
   */
  async stop(): Promise<void> {
    if (!this.runtime) return;
    const snap = this.runtime;
    this.runtime = null;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), DEREGISTER_TIMEOUT_MS);
    });
    try {
      const result = await Promise.race([
        this.registry
          .deregister(snap.instance, { group: snap.group })
          .then(() => "done" as const),
        timeout,
      ]);
      if (result === "timeout") {
        console.warn(
          `[nacos] deregister timed out after ${DEREGISTER_TIMEOUT_MS}ms; abandoning`,
        );
      }
    } catch (err) {
      console.error("[nacos] deregister failed", err);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 当前已注册的实例快照，未启动时为 null。 */
  current(): Instance | null {
    return this.runtime?.instance ?? null;
  }

  /**
   * 挂载 SIGTERM/SIGINT 钩子：收到信号 → 反注册 → 重发同样的信号让进程
   * 走默认终止流程。使用 `process.once` 保证只触发一次，避免重发后又
   * 进入自己的 handler 形成死循环。
   */
  private hook() {
    if (this.hooked) return;
    this.hooked = true;
    const handler = async (signal: NodeJS.Signals) => {
      // SIGTERM + SIGINT 几乎同时到达时合并。
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      console.info(`[nacos] received ${signal}, deregistering`);
      try {
        await this.stop();
      } finally {
        process.kill(process.pid, signal);
      }
    };
    process.once("SIGTERM", () => void handler("SIGTERM"));
    process.once("SIGINT", () => void handler("SIGINT"));
  }
}
