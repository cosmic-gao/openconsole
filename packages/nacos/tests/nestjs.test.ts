import { describe, expect, it } from "vitest";

import type { Client } from "../core";
import { currentRequestHeaders } from "../core/scope";
import {
  NACOS,
  NacosModule,
  NacosService,
  nacosRequestScope,
  nestRuntime,
} from "../adapters/nestjs";

describe("nestjs adapter", () => {
  it("forRoot returns a DynamicModule shape", () => {
    const mod = NacosModule.forRoot({
      global: true,
      registry: { server: "127.0.0.1:8848" },
    });
    expect(mod.module).toBe(NacosModule);
    expect(mod.global).toBe(true);
    expect(mod.exports).toEqual([NacosService, NACOS]);
    expect(mod.providers).toHaveLength(2);

    const [service, client] = mod.providers!;
    expect(service!.provide).toBe(NacosService);
    expect(client!.provide).toBe(NACOS);
    expect(client!.inject).toEqual([NacosService]);
  });

  it("service provider factory builds a NacosService (delegation, no network)", () => {
    const mod = NacosModule.forRoot();
    const svc = (mod.providers![0]!.useFactory as () => NacosService)();
    expect(svc).toBeInstanceOf(NacosService);
    expect(svc.service("user-service").name).toBe("user-service");
    expect(typeof svc.onModuleInit).toBe("function");
    expect(typeof svc.onModuleDestroy).toBe("function");
  });

  it("client provider derives the raw Client from NacosService", () => {
    const mod = NacosModule.forRoot();
    const svc = (mod.providers![0]!.useFactory as () => NacosService)();
    const derive = mod.providers![1]!.useFactory as (s: NacosService) => Client;
    expect(derive(svc)).toBe(svc.client);
  });

  it("lifecycle hooks delegate to client.start / client.stop", async () => {
    const svc = new NacosService({ registry: { server: "127.0.0.1:8848" } });
    const calls: string[] = [];
    (svc as unknown as { client: Pick<Client, "start" | "stop"> }).client = {
      start: async () => {
        calls.push("start");
      },
      stop: async () => {
        calls.push("stop");
      },
    };
    await svc.onModuleInit();
    await svc.onModuleDestroy();
    expect(calls).toEqual(["start", "stop"]);
  });

  it("nacosRequestScope feeds req.headers into the shared ALS", () => {
    let seen: Headers | null = null;
    nacosRequestScope(
      {
        headers: {
          cookie: "k=v",
          "x-multi": ["a", "b"],
          "x-undef": undefined,
        },
      },
      {},
      () => {
        seen = currentRequestHeaders();
      },
    );
    expect(seen).not.toBeNull();
    expect(seen!.get("cookie")).toBe("k=v");
    expect(seen!.get("x-multi")).toBe("a, b");
    expect(seen!.has("x-undef")).toBe(false);
    expect(currentRequestHeaders()).toBeNull();
  });

  it("nestRuntime.upstreamHeaders is null outside a request scope", () => {
    expect(nestRuntime.upstreamHeaders()).toBeNull();
  });
});
