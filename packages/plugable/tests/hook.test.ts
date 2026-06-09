import { describe, expect, it } from "vitest";

import { BailHook, ParallelHook, type Produce, SeriesHook, WaterfallHook } from "../core/hook";

describe("SeriesHook", () => {
  it("runs taps sequentially in registration order", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<{ n: number }>("s");
    hook.tap("a", async (input) => {
      calls.push("a" + input.n);
    });
    hook.tap("b", (input) => {
      calls.push("b" + input.n);
    });
    await hook.call({ n: 1 });
    expect(calls).toEqual(["a1", "b1"]);
  });

  it("orders by pre / default / post", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "x", order: "post" }, () => void calls.push("post"));
    hook.tap({ name: "y", order: "pre" }, () => void calls.push("pre"));
    hook.tap({ name: "z" }, () => void calls.push("def"));
    await hook.call(undefined);
    expect(calls).toEqual(["pre", "def", "post"]);
  });

  it("isolates errors when onError is provided", async () => {
    const seen: string[] = [];
    const hook = new SeriesHook<void>("s", () => seen.push("caught"));
    hook.tap("a", () => {
      throw new Error("boom");
    });
    hook.tap("b", () => void seen.push("b"));
    await hook.call(undefined);
    expect(seen).toEqual(["caught", "b"]);
  });
});

describe("WaterfallHook", () => {
  it("threads output via in-place mutate (V1)", async () => {
    const hook = new WaterfallHook<{ id: string }, { code: string }>("t");
    hook.tap("a", (_input, output) => void (output.code += "A"));
    hook.tap("b", (_input, output) => void (output.code += "B"));
    const result = await hook.call({ id: "x" }, { code: "" });
    expect(result.code).toBe("AB");
  });

  it("supports return-replace", async () => {
    const hook = new WaterfallHook<void, { code: string }>("t");
    hook.tap("a", () => ({ code: "replaced" }));
    const result = await hook.call(undefined, { code: "orig" });
    expect(result.code).toBe("replaced");
  });

  it("uses immutable snapshots when a produce is injected (V2)", async () => {
    // 用结构化克隆模拟 immer 的 produce(不引 immer 依赖)。
    const produce: Produce<{ code: string }> = async (base, recipe) => {
      const draft = { ...base };
      const returned = await recipe(draft);
      return returned ?? draft;
    };
    const hook = new WaterfallHook<void, { code: string }>("t", produce);
    const input = { code: "" };
    hook.tap("a", (_input, output) => void (output.code += "A"));
    const result = await hook.call(undefined, input);
    expect(result.code).toBe("A");
    expect(input.code).toBe(""); // 原对象未被改(快照语义)
  });

  it("gates taps by filter", async () => {
    const hook = new WaterfallHook<{ id: string }, { code: string }>("t");
    hook.tap({ name: "ts", filter: (input) => input.id.endsWith(".ts") }, (_input, output) => void (output.code += "TS"));
    expect((await hook.call({ id: "a.ts" }, { code: "" })).code).toBe("TS");
    expect((await hook.call({ id: "a.css" }, { code: "" })).code).toBe("");
  });
});

describe("BailHook", () => {
  it("returns the first non-null result and short-circuits", async () => {
    const seen: string[] = [];
    const hook = new BailHook<{ id: string }, { to: string }>("r");
    hook.tap("a", () => {
      seen.push("a");
      return undefined;
    });
    hook.tap("b", () => {
      seen.push("b");
      return { to: "B" };
    });
    hook.tap("c", () => {
      seen.push("c");
      return { to: "C" };
    });
    const result = await hook.call({ id: "x" });
    expect(result).toEqual({ to: "B" });
    expect(seen).toEqual(["a", "b"]); // c 未执行
  });
});

describe("ParallelHook", () => {
  it("runs all taps", async () => {
    const seen = new Set<string>();
    const hook = new ParallelHook<void>("p");
    hook.tap("a", async () => void seen.add("a"));
    hook.tap("b", async () => void seen.add("b"));
    await hook.call(undefined);
    expect(seen).toEqual(new Set(["a", "b"]));
  });
});
