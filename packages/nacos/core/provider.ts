/**
 * Provider — register this instance with the registry.
 *
 * Detects the network address, registers, lets the SDK manage heartbeats
 * (ephemeral), and deregisters on SIGTERM/SIGINT so K8s/Docker shutdowns
 * skip the 15–30 s health-check window.
 *
 * Re-entry safe: `start()` is a no-op when already running. `stop()` races
 * the deregister call against a short timeout so a stalled Nacos can't
 * stretch the shutdown grace period.
 */
import os from "node:os";

import type { Instance, ProviderOptions, Registry } from "./types";

const DEFAULT_GROUP = "DEFAULT_GROUP";
const DEREGISTER_TIMEOUT_MS = 3000;

interface DetectedIp {
  ip: string;
  source: string;
}

function detectIp(): DetectedIp {
  if (process.env.NACOS_HOST_IP)
    return { ip: process.env.NACOS_HOST_IP, source: "env:NACOS_HOST_IP" };
  if (process.env.POD_IP)
    return { ip: process.env.POD_IP, source: "env:POD_IP" };
  if (process.env.HOST_IP)
    return { ip: process.env.HOST_IP, source: "env:HOST_IP" };

  const ifaces = os.networkInterfaces();

  // Honor an explicit interface preference (e.g., "eth0", "en0").
  const preferred = process.env.NACOS_PREFER_INTERFACE;
  if (preferred && ifaces[preferred]) {
    for (const addr of ifaces[preferred] ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        return { ip: addr.address, source: `iface:${preferred}` };
      }
    }
  }

  // First non-internal IPv4 across all interfaces. Non-deterministic on
  // multi-NIC hosts — set NACOS_PREFER_INTERFACE or NACOS_HOST_IP to pin it.
  for (const [name, list] of Object.entries(ifaces)) {
    for (const addr of list ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        return { ip: addr.address, source: `iface:${name}` };
      }
    }
  }

  return { ip: "127.0.0.1", source: "fallback" };
}

interface Runtime {
  instance: Instance;
  group: string;
}

export class Provider {
  private runtime: Runtime | null = null;
  private hooked = false;
  private shuttingDown = false;

  constructor(
    private readonly registry: Registry,
    private readonly opts: ProviderOptions,
  ) {}

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

  current(): Instance | null {
    return this.runtime?.instance ?? null;
  }

  private hook() {
    if (this.hooked) return;
    this.hooked = true;
    const handler = async (signal: NodeJS.Signals) => {
      // Coalesce concurrent SIGTERM+SIGINT.
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
