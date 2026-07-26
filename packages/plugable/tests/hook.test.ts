import { describe, expect, it, vi } from "vitest";

import {
  BailHook,
  ParallelHook,
  SeriesHook,
  Stage,
  WaterfallHook,
  type Probe,
  type Produce,
  type Ranking,
} from "../core/hook";
import { CycleError, PhaseError } from "../core/pipeline";

describe("SeriesHook", () => {
  it("runs taps sequentially in registration order", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<{ n: number }>("s");
    hook.tap({ name: "a" }, async (input) => {
      calls.push("a" + input.n);
    });
    hook.tap({ name: "b" }, (input) => {
      calls.push("b" + input.n);
    });
    await hook.call({ n: 1 });
    expect(calls).toEqual(["a1", "b1"]);
  });

  it("orders by stage, then registration", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "x", stage: Stage.post }, () => void calls.push("post"));
    hook.tap({ name: "y", stage: Stage.pre }, () => void calls.push("pre"));
    hook.tap({ name: "z" }, () => void calls.push("def"));
    hook.tap({ name: "w", stage: -5 }, () => void calls.push("mid"));
    await hook.call(undefined);
    expect(calls).toEqual(["pre", "mid", "def", "post"]);
  });

  it("isolates errors when onError is provided", async () => {
    const seen: string[] = [];
    const hook = new SeriesHook<void>("s", { onError: (_e, tap) => void seen.push("caught:" + tap) });
    hook.tap({ name: "a" }, () => {
      throw new Error("boom");
    });
    hook.tap({ name: "b" }, () => void seen.push("b"));
    await hook.call(undefined);
    expect(seen).toEqual(["caught:a", "b"]);
  });

  it("propagates errors without onError", async () => {
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "a" }, () => {
      throw new Error("boom");
    });
    await expect(hook.call(undefined)).rejects.toThrow("boom");
  });
});

describe("WaterfallHook", () => {
  it("threads output via in-place mutate", async () => {
    const hook = new WaterfallHook<{ id: string }, { code: string }>("t");
    hook.tap({ name: "a" }, (_input, output) => void (output.code += "A"));
    hook.tap({ name: "b" }, (_input, output) => void (output.code += "B"));
    expect((await hook.call({ id: "x" }, { code: "" })).code).toBe("AB");
  });

  it("supports return-replace", async () => {
    const hook = new WaterfallHook<void, { code: string }>("t");
    hook.tap({ name: "a" }, () => ({ code: "replaced" }));
    expect((await hook.call(undefined, { code: "orig" })).code).toBe("replaced");
  });

  it("uses immutable snapshots when a produce is injected", async () => {
    // 用浅拷贝模拟 immer 的 produce(不引 immer 依赖)。
    const produce: Produce<{ code: string }> = async (base, recipe) => {
      const draft = { ...base };
      return (await recipe(draft)) ?? draft;
    };
    const hook = new WaterfallHook<void, { code: string }>("t", { produce });
    const input = { code: "" };
    hook.tap({ name: "a" }, (_input, output) => void (output.code += "A"));
    expect((await hook.call(undefined, input)).code).toBe("A");
    expect(input.code).toBe(""); // 原对象未被改(快照语义)
  });

  it("keeps the previous value when an isolated tap throws", async () => {
    const hook = new WaterfallHook<void, { code: string }>("t", { onError: () => {} });
    hook.tap({ name: "a" }, (_input, output) => void (output.code += "A"));
    hook.tap({ name: "bad" }, () => {
      throw new Error("boom");
    });
    hook.tap({ name: "b" }, (_input, output) => void (output.code += "B"));
    expect((await hook.call(undefined, { code: "" })).code).toBe("AB");
  });
});

describe("BailHook", () => {
  it("returns the first non-null result and short-circuits", async () => {
    const seen: string[] = [];
    const hook = new BailHook<{ id: string }, { to: string }>("r");
    hook.tap({ name: "a" }, () => {
      seen.push("a");
      return undefined;
    });
    hook.tap({ name: "b" }, () => {
      seen.push("b");
      return { to: "B" };
    });
    hook.tap({ name: "c" }, () => {
      seen.push("c");
      return { to: "C" };
    });
    expect(await hook.call({ id: "x" })).toEqual({ to: "B" });
    expect(seen).toEqual(["a", "b"]); // c 未执行
  });
});

describe("ParallelHook", () => {
  it("runs all taps concurrently", async () => {
    const seen: string[] = [];
    const hook = new ParallelHook<void>("p");
    hook.tap({ name: "slow" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      seen.push("slow");
    });
    hook.tap({ name: "fast" }, async () => void seen.push("fast"));
    await hook.call(undefined);
    expect(seen).toEqual(["fast", "slow"]); // 并发:快的先落
  });

  it("aggregates multiple failures instead of swallowing them", async () => {
    const hook = new ParallelHook<void>("p");
    hook.tap({ name: "a" }, async () => {
      throw new Error("a-boom");
    });
    hook.tap({ name: "b" }, async () => {
      throw new Error("b-boom");
    });
    await expect(hook.call(undefined)).rejects.toThrow(AggregateError);
  });

  it("routes failures to onError when provided", async () => {
    const seen: string[] = [];
    const hook = new ParallelHook<void>("p", { onError: (_e, tap) => void seen.push(tap) });
    hook.tap({ name: "a" }, async () => {
      throw new Error("boom");
    });
    hook.tap({ name: "b" }, async () => void seen.push("ok"));
    await hook.call(undefined);
    expect(seen.sort()).toEqual(["a", "ok"]);
  });
});

describe("declarative filters", () => {
  it("gates taps by a field pattern", async () => {
    const hook = new WaterfallHook<{ id: string }, { code: string }>("t");
    hook.tap({ name: "ts", filter: { id: /\.[jt]sx?$/ } }, (_i, out) => void (out.code += "TS"));
    expect((await hook.call({ id: "a.ts" }, { code: "" })).code).toBe("TS");
    expect((await hook.call({ id: "a.css" }, { code: "" })).code).toBe("");
  });

  it("requires every declared field to match", async () => {
    const hook = new SeriesHook<{ id: string; namespace: string }>("s");
    const hit = vi.fn();
    hook.tap({ name: "v", filter: { namespace: "virtual", id: ["@/env", "@/version"] } }, hit);
    await hook.call({ id: "@/env", namespace: "virtual" });
    await hook.call({ id: "@/env", namespace: "file" });
    await hook.call({ id: "@/other", namespace: "virtual" });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("still accepts a raw predicate as an escape hatch", async () => {
    const hook = new SeriesHook<{ id: string }>("s");
    const hit = vi.fn();
    hook.tap({ name: "long", filter: (input) => input.id.length > 3 }, hit);
    await hook.call({ id: "abcd" });
    await hook.call({ id: "ab" });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it("exposes the declared condition through entries()", () => {
    const hook = new SeriesHook<{ id: string }>("s");
    hook.tap({ name: "b", stage: Stage.post, filter: { id: /\.ts$/ } }, () => {});
    hook.tap({ name: "a" }, () => {});
    expect(hook.entries()).toEqual([
      { name: "a", stage: 0, layer: 0, filter: undefined },
      { name: "b", stage: Stage.post, layer: 0, filter: { id: /\.ts$/ } },
    ]);
  });
});

describe("dispatch plan", () => {
  it("sorts once per mutation, not per call", async () => {
    const weight = vi.fn(() => 0);
    const hook = new SeriesHook<void>("s");
    hook.weigh({ epoch: 1, weight });

    hook.tap({ name: "a" }, () => {});
    hook.tap({ name: "b" }, () => {});
    await hook.call(undefined);
    const afterFirst = weight.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await hook.call(undefined);
    await hook.call(undefined);
    expect(weight.mock.calls.length).toBe(afterFirst); // 计划已缓存,不再重排
  });

  it("reorders when the ranking epoch changes", async () => {
    const rank = new Map([
      ["a", 0],
      ["b", 1],
    ]);
    let epoch = 1;
    const ranking: Ranking = {
      get epoch() {
        return epoch;
      },
      weight: (name) => rank.get(name) ?? 0,
    };
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.weigh(ranking);
    hook.tap({ name: "b" }, () => void calls.push("b"));
    hook.tap({ name: "a" }, () => void calls.push("a"));

    await hook.call(undefined);
    expect(calls).toEqual(["a", "b"]);

    rank.set("a", 5);
    epoch = 2;
    calls.length = 0;
    await hook.call(undefined);
    expect(calls).toEqual(["b", "a"]);
  });

  it("freezes the plan for an in-flight dispatch", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    let off = (): void => {};
    hook.tap({ name: "a" }, () => {
      calls.push("a");
      off(); // 派发途中注销后面的 tap
    });
    off = hook.tap({ name: "b" }, () => void calls.push("b"));
    hook.tap({ name: "c" }, () => void calls.push("c"));

    await hook.call(undefined);
    expect(calls).toEqual(["a", "b", "c"]); // 本次派发用的是开始那一刻的计划
    calls.length = 0;
    await hook.call(undefined);
    expect(calls).toEqual(["a", "c"]); // 下一次生效
  });
});

describe("tap pipeline", () => {
  it("orders taps by before / after regardless of registration order", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "c", after: "b" }, () => void calls.push("c"));
    hook.tap({ name: "a", before: ["b"] }, () => void calls.push("a"));
    hook.tap({ name: "b" }, () => void calls.push("b"));
    await hook.call(undefined);
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("resolves a forward reference declared before its target exists", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "first", before: ["later"] }, () => void calls.push("first"));
    hook.tap({ name: "later" }, () => void calls.push("later"));
    await hook.call(undefined);
    expect(calls).toEqual(["first", "later"]);
  });

  it("constrains every tap sharing the referenced name", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "last", after: ["pair"] }, () => void calls.push("last"));
    hook.tap({ name: "pair" }, () => void calls.push("pair-1"));
    hook.tap({ name: "pair" }, () => void calls.push("pair-2"));
    await hook.call(undefined);
    expect(calls).toEqual(["pair-1", "pair-2", "last"]);
  });

  it("ignores a reference to a name nobody tapped", async () => {
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "a", after: ["absent"] }, () => {});
    expect(() => hook.verify()).not.toThrow();
    await expect(hook.call(undefined)).resolves.toBeUndefined();
  });

  it("assigns layers from the dependency depth", () => {
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "a" }, () => {});
    hook.tap({ name: "b" }, () => {});
    hook.tap({ name: "c", after: ["a", "b"] }, () => {});
    expect(hook.entries().map((entry) => [entry.name, entry.layer])).toEqual([
      ["a", 0],
      ["b", 0],
      ["c", 1],
    ]);
  });

  it("reports a cycle among tap declarations", () => {
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "x", after: ["y"] }, () => {});
    hook.tap({ name: "y", after: ["x"] }, () => {});
    expect(() => hook.verify()).toThrow(CycleError);
    expect(() => hook.verify()).toThrow('hook "s" 的 tap 顺序成环');
  });

  it("reports a tap declaration that contradicts stage", () => {
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "late", stage: Stage.post, before: ["early"] }, () => {});
    hook.tap({ name: "early", stage: Stage.pre }, () => {});
    expect(() => hook.verify()).toThrow(PhaseError);
    expect(() => hook.verify()).toThrow("late(10) 须先于 early(-10)");
  });

  it("still dispatches when declarations are broken", async () => {
    const calls: string[] = [];
    const hook = new SeriesHook<void>("s");
    hook.tap({ name: "x", after: ["y"] }, () => void calls.push("x"));
    hook.tap({ name: "y", after: ["x"] }, () => void calls.push("y"));
    await hook.call(undefined); // 顺序降级,但两个 tap 都还跑
    expect(calls.sort()).toEqual(["x", "y"]);
  });
});

describe("ParallelHook layering", () => {
  it("keeps everything in one layer when nothing is declared", async () => {
    const hook = new ParallelHook<void>("p");
    hook.tap({ name: "a" }, () => {});
    hook.tap({ name: "b" }, () => {});
    expect(hook.entries().every((entry) => entry.layer === 0)).toBe(true);
  });

  it("runs a layer concurrently but waits between layers", async () => {
    const events: string[] = [];
    const hook = new ParallelHook<void>("p");
    const task = (name: string, delay: number) => async () => {
      events.push("enter:" + name);
      await new Promise((resolve) => setTimeout(resolve, delay));
      events.push("exit:" + name);
    };
    hook.tap({ name: "slow" }, task("slow", 15));
    hook.tap({ name: "quick" }, task("quick", 0));
    hook.tap({ name: "after-all", after: ["slow", "quick"] }, task("after-all", 0));

    await hook.call(undefined);
    // 第一层两个并发进入,都退出后第三个才进入。
    expect(events.slice(0, 2).sort()).toEqual(["enter:quick", "enter:slow"]);
    expect(events.indexOf("enter:after-all")).toBeGreaterThan(events.indexOf("exit:slow"));
    expect(events.indexOf("enter:after-all")).toBeGreaterThan(events.indexOf("exit:quick"));
  });

  it("stops at the failing layer when errors are not isolated", async () => {
    const seen: string[] = [];
    const hook = new ParallelHook<void>("p");
    hook.tap({ name: "bad" }, async () => {
      throw new Error("boom");
    });
    hook.tap({ name: "downstream", after: ["bad"] }, async () => void seen.push("downstream"));
    await expect(hook.call(undefined)).rejects.toThrow("boom");
    expect(seen).toEqual([]); // 下游层没跑
  });

  it("carries on through layers when errors are isolated", async () => {
    const seen: string[] = [];
    const hook = new ParallelHook<void>("p", { onError: (_e, tap) => void seen.push("err:" + tap) });
    hook.tap({ name: "bad" }, async () => {
      throw new Error("boom");
    });
    hook.tap({ name: "downstream", after: ["bad"] }, async () => void seen.push("downstream"));
    await hook.call(undefined);
    expect(seen).toEqual(["downstream", "err:bad"]);
  });
});

describe("probe", () => {
  it("reports timing hooks and attributes errors to a tap", async () => {
    const seen: Array<[string, string, boolean]> = [];
    const probe: Probe = (hook, tap) => (error) => void seen.push([hook, tap, error !== undefined]);
    const hook = new SeriesHook<void>("s", { probe, onError: () => {} });
    hook.tap({ name: "ok" }, () => {});
    hook.tap({ name: "bad" }, () => {
      throw new Error("boom");
    });
    await hook.call(undefined);
    expect(seen).toEqual([
      ["s", "ok", false],
      ["s", "bad", true],
    ]);
  });
});
