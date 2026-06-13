import os from "node:os";

import { DEFAULT_GROUP, type Instance, type ProviderOptions, type Registry } from "./types";

const DEREGISTER_TIMEOUT_MS = 3000;

interface DetectedIp {
  ip: string;
  source: string;
}

// 探测优先级:NACOS_HOST_IP → POD_IP → HOST_IP → NACOS_PREFER_INTERFACE 网卡 → 非内网 IPv4 → 可路由 IPv6 → 127.0.0.1。
function detectIp(): DetectedIp {
  if (process.env.NACOS_HOST_IP)
    return { ip: process.env.NACOS_HOST_IP, source: "env:NACOS_HOST_IP" };
  if (process.env.POD_IP) return { ip: process.env.POD_IP, source: "env:POD_IP" };
  if (process.env.HOST_IP) return { ip: process.env.HOST_IP, source: "env:HOST_IP" };

  const ifaces = os.networkInterfaces();

  const preferred = process.env.NACOS_PREFER_INTERFACE;
  if (preferred && ifaces[preferred]) {
    for (const addr of ifaces[preferred] ?? []) {
      if (addr.family === "IPv4" && !addr.internal)
        return { ip: addr.address, source: `iface:${preferred}` };
    }
    for (const addr of ifaces[preferred] ?? []) {
      if (isUsableIPv6(addr)) return { ip: addr.address, source: `iface:${preferred}:ipv6` };
    }
  }

  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family === "IPv4" && !addr.internal)
        return { ip: addr.address, source: `iface:${name}` };
    }
  }
  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list ?? []) {
      if (isUsableIPv6(addr)) return { ip: addr.address, source: `iface:${name}:ipv6` };
    }
  }

  return { ip: "127.0.0.1", source: "fallback" };
}

// link-local(fe80::/10)只在同链路有效,不能跨节点路由,排除。
function isUsableIPv6(addr: os.NetworkInterfaceInfo): boolean {
  if (addr.family !== "IPv6" || addr.internal) return false;
  return !addr.address.toLowerCase().startsWith("fe80:");
}

interface Registration {
  instance: Instance;
  group: string;
}

export class Provider {
  private registration: Registration | null = null;
  private hooked = false;
  private shuttingDown = false;

  constructor(
    private readonly registry: Registry,
    private readonly opts: ProviderOptions,
  ) {}

  async start(): Promise<void> {
    if (this.registration || !this.opts.enabled) return;

    let ip = this.opts.ip;
    if (!ip) {
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
    const group = this.opts.group ?? DEFAULT_GROUP;

    await this.registry.register(instance, {
      group,
      ephemeral: this.opts.ephemeral ?? true,
    });
    this.registration = { instance, group };
    this.hook();
  }

  // 限时反注册:注册中心 hang 住就放弃,不吃光 shutdown grace period。
  async stop(): Promise<void> {
    if (!this.registration) return;
    const snap = this.registration;
    this.registration = null;

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

  current(): Instance | null {
    return this.registration?.instance ?? null;
  }

  // 收信号 → 反注册 → 重发同信号走默认终止;process.once 保证只触发一次,避免重入 handler 死循环。
  private hook() {
    if (this.hooked) return;
    this.hooked = true;
    const handler = async (signal: NodeJS.Signals) => {
      if (this.shuttingDown) return; // SIGTERM + SIGINT 几乎同时到达时合并。
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
