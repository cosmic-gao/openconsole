import { describe, expect, it } from "vitest";

import { render, strip } from "../src/template";

describe("strip", () => {
  it("strips inline zh comments", () => {
    expect(strip("<!--zh: 中文说明-->\nEnglish")).toBe("English");
  });

  it("strips block zh comments", () => {
    expect(strip("<!--zh\n多行\n中文\n-->\nEnglish")).toBe("English");
  });

  it("leaves non-zh comments untouched", () => {
    expect(strip("<!-- keep -->x")).toBe("<!-- keep -->x");
  });
});

describe("render", () => {
  it("expands @variable", async () => {
    expect(
      await render('Hello {{ @variable("name") }}', {
        vars: { name: "World" },
      }),
    ).toBe("Hello World");
  });

  it("uses the @variable default when missing", async () => {
    expect(await render('{{ @variable("x", "fallback") }}')).toBe("fallback");
  });

  it("throws on a missing @variable with no default", async () => {
    await expect(render('{{ @variable("missing") }}')).rejects.toThrow();
  });

  it("expands @env", async () => {
    process.env["AGENT_TEST_VAR"] = "envval";
    expect(await render('{{ @env("AGENT_TEST_VAR") }}')).toBe("envval");
  });

  it("strips annotations before expanding", async () => {
    expect(await render("<!--zh: x-->\nplain")).toBe("plain");
  });

  it("leaves unknown directives verbatim", async () => {
    expect(await render('{{ @unknown("a") }}')).toBe('{{ @unknown("a") }}');
  });

  it("expands @include and detects cycles", async () => {
    const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "agent-tpl-"));
    try {
      writeFileSync(join(dir, "a.prompt"), 'A {{ @include(path="./b") }}');
      writeFileSync(join(dir, "b.prompt"), "B");
      expect(await render('{{ @include(path="./a") }}', { baseDir: dir })).toBe(
        "A B",
      );
      writeFileSync(join(dir, "b.prompt"), '{{ @include(path="./a") }}'); // 制造 a->b->a 环
      await expect(
        render('{{ @include(path="./a") }}', { baseDir: dir }),
      ).rejects.toThrow(/cycle/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("expands @config with default fallback", async () => {
    expect(
      await render('{{ @config("k", "def") }}', { config: { k: "v" } }),
    ).toBe("v");
    expect(await render('{{ @config("missing", "def") }}')).toBe("def");
  });
});
