import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { split } from "../src/parse";
import { Skill } from "../src/skill";

describe("Skill", () => {
  it("locates the bundled skills directory", () => {
    expect(Skill.dir()).toContain("skills");
  });

  it("bundles using-mcp / deep-research / using-sandbox with valid frontmatter", async () => {
    for (const name of ["using-mcp", "deep-research", "using-sandbox"]) {
      const md = await readFile(join(Skill.dir(), name, "SKILL.md"), "utf8");
      const { data } = split(md);
      expect(data["name"]).toBe(name);
      expect(typeof data["description"]).toBe("string");
    }
  });
});
