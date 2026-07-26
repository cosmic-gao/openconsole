import { describe, expect, it } from "vitest";

import { and, compile, not, or, test } from "../core/filter";

interface Input {
  id: string;
  namespace?: string | undefined;
  size: number;
}

const input = (id: string, namespace?: string): Input => ({ id, namespace, size: id.length });

describe("test", () => {
  it("matches strings exactly, regexps by test, arrays by any", () => {
    expect(test("a.ts", "a.ts")).toBe(true);
    expect(test("a.ts", "b.ts")).toBe(false);
    expect(test(/\.ts$/, "a.ts")).toBe(true);
    expect(test(["a.ts", /\.css$/], "b.css")).toBe(true);
    expect(test(["a.ts", /\.css$/], "b.js")).toBe(false);
  });
});

describe("compile", () => {
  it("returns undefined for an empty condition so dispatch skips the check", () => {
    expect(compile<Input>(undefined)).toBeUndefined();
    expect(compile<Input>({})).toBeUndefined();
  });

  it("passes a predicate through untouched", () => {
    const gate = (value: Input): boolean => value.size > 3;
    expect(compile<Input>(gate)).toBe(gate);
  });

  it("requires every declared field to match", () => {
    const gate = compile<Input>({ namespace: "virtual", id: /^@\// })!;
    expect(gate(input("@/env", "virtual"))).toBe(true);
    expect(gate(input("@/env", "file"))).toBe(false);
    expect(gate(input("./local", "virtual"))).toBe(false);
  });

  it("never matches a missing field — a regexp must not see the string \"undefined\"", () => {
    const gate = compile<Input>({ namespace: /undefined/ })!;
    expect(gate(input("a.ts"))).toBe(false);
  });
});

describe("combinators", () => {
  const ts = { id: /\.ts$/ } as const;
  const virtual = { namespace: "virtual" } as const;

  it("and / or / not compose declarative conditions with predicates", () => {
    expect(and<Input>(ts, virtual)(input("a.ts", "virtual"))).toBe(true);
    expect(and<Input>(ts, virtual)(input("a.ts", "file"))).toBe(false);
    expect(or<Input>(ts, virtual)(input("a.css", "virtual"))).toBe(true);
    expect(or<Input>(ts, virtual)(input("a.css", "file"))).toBe(false);
    expect(not<Input>(ts)(input("a.css"))).toBe(true);
    expect(and<Input>(ts, (value) => value.size > 10)(input("a.ts"))).toBe(false);
  });

  it("treats an empty condition as always true", () => {
    expect(and<Input>({})(input("anything"))).toBe(true);
    expect(not<Input>({})(input("anything"))).toBe(false);
  });
});
