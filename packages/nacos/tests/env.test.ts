import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SERVER, loadEnvOptions } from "../core/env";

/**
 * 每个用例独占一份干净的 `process.env` 快照，避免在并发用例中互相污染。
 */
const snapshot: Record<string, string | undefined> = {};
const KEYS = [
  "NACOS_SERVER",
  "NACOS_NAMESPACE",
  "NACOS_USERNAME",
  "NACOS_PASSWORD",
  "NACOS_CONFIG_TIMEOUT",
  "NACOS_PROVIDER_ENABLED",
  "NACOS_PROVIDER_SERVICE",
  "NACOS_PROVIDER_PORT",
  "NACOS_PROVIDER_GROUP",
  "NACOS_PROVIDER_WEIGHT",
  "NACOS_PROVIDER_CLUSTER",
  "NACOS_PROVIDER_EPHEMERAL",
  "PORT",
  "NACOS_BALANCER",
  "NACOS_REQUEST_TIMEOUT",
  "NACOS_RETRY_ATTEMPTS",
  "NACOS_DISCOVERY_TTL",
  "NACOS_CONFIG_SOURCES",
  "NACOS_CONFIG_TAG",
];

beforeEach(() => {
  for (const k of KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

describe("loadEnvOptions — 默认值", () => {
  it("无任何 env 时使用 127.0.0.1:8848，且 provider 不启用", () => {
    const opts = loadEnvOptions();
    expect(opts.registry.server).toBe(DEFAULT_SERVER);
    expect(opts.provider).toBeUndefined();
    expect(opts.consumer).toEqual({});
    expect(opts.config).toBeUndefined();
    // 默认带上 forward()
    expect(opts.plugins?.map((p) => p.name)).toEqual(["forward"]);
  });
});

describe("loadEnvOptions — registry", () => {
  it("NACOS_SERVER 覆盖默认地址", () => {
    process.env.NACOS_SERVER = "nacos.example.com:8848";
    expect(loadEnvOptions().registry.server).toBe("nacos.example.com:8848");
  });

  it("镜像 namespace / username / password / config-timeout", () => {
    process.env.NACOS_NAMESPACE = "dev";
    process.env.NACOS_USERNAME = "u";
    process.env.NACOS_PASSWORD = "p";
    process.env.NACOS_CONFIG_TIMEOUT = "12000";
    const r = loadEnvOptions().registry;
    expect(r.namespace).toBe("dev");
    expect(r.username).toBe("u");
    expect(r.password).toBe("p");
    expect(r.timeout).toBe(12000);
  });

  it("非法 NACOS_CONFIG_TIMEOUT 被忽略（保留 undefined）", () => {
    process.env.NACOS_CONFIG_TIMEOUT = "not-a-number";
    expect(loadEnvOptions().registry.timeout).toBeUndefined();
  });
});

describe("loadEnvOptions — provider", () => {
  it("ENABLED=true + service + port 三者齐备才返回", () => {
    process.env.NACOS_PROVIDER_ENABLED = "true";
    process.env.NACOS_PROVIDER_SERVICE = "nextjs-admin";
    process.env.NACOS_PROVIDER_PORT = "3000";
    const p = loadEnvOptions().provider;
    expect(p).toEqual({
      enabled: true,
      service: "nextjs-admin",
      port: 3000,
      group: undefined,
      weight: undefined,
      cluster: undefined,
      ephemeral: undefined,
    });
  });

  it("ENABLED 缺省时整体 undefined（不会泄露半成品）", () => {
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.NACOS_PROVIDER_PORT = "3000";
    expect(loadEnvOptions().provider).toBeUndefined();
  });

  it("ENABLED=true 但缺 service / port 时也跳过", () => {
    process.env.NACOS_PROVIDER_ENABLED = "1";
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    // 故意不设 PORT
    expect(loadEnvOptions().provider).toBeUndefined();
  });

  it("PORT 退化到 Next.js 标准的 PORT 变量", () => {
    process.env.NACOS_PROVIDER_ENABLED = "true";
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.PORT = "4000";
    expect(loadEnvOptions().provider?.port).toBe(4000);
  });

  it("ENABLED=false 等同于未启用", () => {
    process.env.NACOS_PROVIDER_ENABLED = "false";
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.NACOS_PROVIDER_PORT = "3000";
    expect(loadEnvOptions().provider).toBeUndefined();
  });

  it("镜像 group / weight / cluster / ephemeral", () => {
    process.env.NACOS_PROVIDER_ENABLED = "yes";
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.NACOS_PROVIDER_PORT = "3000";
    process.env.NACOS_PROVIDER_GROUP = "g1";
    process.env.NACOS_PROVIDER_WEIGHT = "5";
    process.env.NACOS_PROVIDER_CLUSTER = "cl";
    process.env.NACOS_PROVIDER_EPHEMERAL = "off";
    const p = loadEnvOptions().provider!;
    expect(p.group).toBe("g1");
    expect(p.weight).toBe(5);
    expect(p.cluster).toBe("cl");
    expect(p.ephemeral).toBe(false);
  });
});

describe("loadEnvOptions — consumer", () => {
  it("镜像 balancer / timeout / retry / ttl", () => {
    process.env.NACOS_BALANCER = "round-robin";
    process.env.NACOS_REQUEST_TIMEOUT = "8000";
    process.env.NACOS_RETRY_ATTEMPTS = "3";
    process.env.NACOS_DISCOVERY_TTL = "2000";
    const c = loadEnvOptions().consumer!;
    expect(c.balancer).toBe("round-robin");
    expect(c.timeout).toBe(8000);
    expect(c.retry).toEqual({ attempts: 3 });
    expect(c.ttl).toBe(2000);
  });

  it("不在白名单的 NACOS_BALANCER 被忽略", () => {
    process.env.NACOS_BALANCER = "nonsense";
    expect(loadEnvOptions().consumer?.balancer).toBeUndefined();
  });

  it("大小写不敏感", () => {
    process.env.NACOS_BALANCER = "STICKY";
    expect(loadEnvOptions().consumer?.balancer).toBe("sticky");
  });
});

describe("loadEnvOptions — config sources", () => {
  it("单个 dataId", () => {
    process.env.NACOS_CONFIG_SOURCES = "app.json";
    expect(loadEnvOptions().config?.sources).toEqual([
      { dataId: "app.json", group: undefined, key: undefined },
    ]);
  });

  it("dataId:key", () => {
    process.env.NACOS_CONFIG_SOURCES = "flags.json:flags";
    expect(loadEnvOptions().config?.sources).toEqual([
      { dataId: "flags.json", group: undefined, key: "flags" },
    ]);
  });

  it("dataId@group:key 三段语法", () => {
    process.env.NACOS_CONFIG_SOURCES = "throttle.yaml@throttles:throttle";
    expect(loadEnvOptions().config?.sources).toEqual([
      { dataId: "throttle.yaml", group: "throttles", key: "throttle" },
    ]);
  });

  it("多条逗号分隔，忽略空段", () => {
    process.env.NACOS_CONFIG_SOURCES = "a.json, ,b.json@g,c.json:ck";
    expect(loadEnvOptions().config?.sources).toEqual([
      { dataId: "a.json", group: undefined, key: undefined },
      { dataId: "b.json", group: "g", key: undefined },
      { dataId: "c.json", group: undefined, key: "ck" },
    ]);
  });

  it("仅有 NACOS_CONFIG_TAG 也返回 config 段", () => {
    process.env.NACOS_CONFIG_TAG = "app-config";
    expect(loadEnvOptions().config).toEqual({ tag: "app-config" });
  });
});

describe("loadEnvOptions — boolean 解析", () => {
  it.each([
    ["1", true],
    ["true", true],
    ["TRUE", true],
    ["yes", true],
    ["on", true],
    ["0", false],
    ["false", false],
    ["NO", false],
    ["off", false],
  ])("'%s' → %s", (input, expected) => {
    process.env.NACOS_PROVIDER_ENABLED = input;
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.NACOS_PROVIDER_PORT = "3000";
    const provider = loadEnvOptions().provider;
    if (expected) {
      expect(provider).toBeDefined();
      expect(provider!.enabled).toBe(true);
    } else {
      expect(provider).toBeUndefined();
    }
  });

  it("无法识别的布尔字面量按未设置处理", () => {
    process.env.NACOS_PROVIDER_ENABLED = "maybe";
    process.env.NACOS_PROVIDER_SERVICE = "svc";
    process.env.NACOS_PROVIDER_PORT = "3000";
    expect(loadEnvOptions().provider).toBeUndefined();
  });
});
