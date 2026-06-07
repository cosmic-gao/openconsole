import { describe, expect, it } from "vitest";

import { cache, load } from "../src/lang/load";

describe("load cache", () => {
  it("returns the same spec instance on repeated load (cache hit)", async () => {
    cache.clear();
    const a = await load("search");
    const b = await load("search");
    expect(b).toBe(a); // 同一引用 = 命中编译缓存（未重复读盘 + 渲染）
  });

  it("cache.clear forces a fresh parse with equal content", async () => {
    const a = await load("search");
    cache.clear();
    const b = await load("search");
    expect(b).not.toBe(a); // 缓存已清，重新解析得到新对象
    expect(b.prompt).toBe(a.prompt); // 内容一致
    expect(b.modelId).toBe(a.modelId);
  });
});
