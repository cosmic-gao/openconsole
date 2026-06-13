import type { NetworkInterfaceInfo } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { detectIp } from "../core/provider";

const KEYS = [
  "NACOS_HOST_IP",
  "POD_IP",
  "HOST_IP",
  "NACOS_PREFER_INTERFACE",
  "NACOS_IGNORE_INTERFACES",
  "NACOS_PREFER_NETWORKS",
];

beforeEach(() => {
  for (const k of KEYS) vi.stubEnv(k, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function v4(address: string, internal = false): NetworkInterfaceInfo {
  return {
    address,
    family: "IPv4",
    internal,
    netmask: "255.255.255.0",
    mac: "00:00:00:00:00:00",
    cidr: null,
  } as NetworkInterfaceInfo;
}

describe("detectIp", () => {
  it("NACOS_HOST_IP wins over everything", () => {
    vi.stubEnv("NACOS_HOST_IP", "1.2.3.4");
    expect(detectIp({ eth0: [v4("10.0.0.5")] }).ip).toBe("1.2.3.4");
  });

  it("falls back to the first non-internal IPv4", () => {
    const r = detectIp({ lo: [v4("127.0.0.1", true)], eth0: [v4("10.0.0.5")] });
    expect(r.ip).toBe("10.0.0.5");
    expect(r.source).toBe("iface:eth0");
  });

  it("NACOS_IGNORE_INTERFACES skips matching interfaces (docker0 / veth*)", () => {
    vi.stubEnv("NACOS_IGNORE_INTERFACES", "docker.*,veth.*");
    const r = detectIp({
      docker0: [v4("172.17.0.1")],
      veth1234: [v4("172.18.0.1")],
      eth0: [v4("10.0.0.5")],
    });
    expect(r.ip).toBe("10.0.0.5");
  });

  it("NACOS_PREFER_NETWORKS keeps only the matching subnet", () => {
    vi.stubEnv("NACOS_PREFER_NETWORKS", "^10\\.");
    const r = detectIp({ eth0: [v4("172.17.0.1")], eth1: [v4("10.0.0.5")] });
    expect(r.ip).toBe("10.0.0.5");
  });

  it("NACOS_PREFER_INTERFACE picks that interface, before auto-scan", () => {
    vi.stubEnv("NACOS_PREFER_INTERFACE", "eth1");
    const r = detectIp({ eth0: [v4("10.0.0.5")], eth1: [v4("192.168.1.9")] });
    expect(r.ip).toBe("192.168.1.9");
    expect(r.source).toBe("iface:eth1");
  });

  it("falls back to 127.0.0.1 when nothing matches", () => {
    vi.stubEnv("NACOS_PREFER_NETWORKS", "^99\\.");
    expect(detectIp({ eth0: [v4("10.0.0.5")] }).ip).toBe("127.0.0.1");
  });
});
