import { describe, expect, it } from "vitest";

import { Crew } from "../src/crew";
import { parse } from "../src/parse";

const template = [
  "---",
  "llm: main_llm",
  "tools:",
  "  - web_search",
  "  - think",
  "---",
  "<identity>",
  "CREW_ROLE",
  "</identity>",
  "<agents>",
  "CREW_INSTRUCTIONS",
  "</agents>",
  "<soul>",
  "CREW_PERSONALITY",
  "</soul>",
  "",
].join("\n");

describe("Crew.compile", () => {
  it("merges tools, fills placeholders, and stays parseable", () => {
    const { agent, meta } = Crew.compile({
      template,
      identity: `---\nname: Ada\nrole: Analyst\ndescription: data whiz\n---\nYou are Ada, an analyst.`,
      agents: "Follow the workflow.",
      soul: "Friendly and precise.",
      tools: `---\ntools:\n  - read_webpages_as_markdown\nexclude_builtin_tools:\n  - think\n---`,
    });

    expect(meta).toEqual({
      name: "Ada",
      role: "Analyst",
      description: "data whiz",
    });
    expect(agent).toContain("You are Ada, an analyst.");
    expect(agent).toContain("Follow the workflow.");
    expect(agent).toContain("Friendly and precise.");
    expect(agent).not.toContain("CREW_ROLE");

    const parsed = parse(agent);
    expect(Object.keys(parsed.tools)).toContain("web_search"); // 来自模板
    expect(Object.keys(parsed.tools)).toContain("read_webpages_as_markdown"); // 来自 TOOLS.md
    expect(Object.keys(parsed.tools)).not.toContain("think"); // 被 TOOLS.md 排除
  });

  it("merges skills: keeps the '*' sentinel and includes workspace_skills", () => {
    const tplWithSkills = [
      "---",
      "llm: main_llm",
      "tools: [web_search]",
      "skills:",
      '  system_skills: "*"',
      "---",
      "CREW_ROLE",
      "",
    ].join("\n");
    const { agent } = Crew.compile({
      template: tplWithSkills,
      identity: "---\nname: X\n---\nBody",
      skills: "---\nworkspace_skills:\n  - name: ws\n---",
    });
    const parsed = parse(agent);
    expect(parsed.skills?.system_skills).toBe("*"); // 哨兵保留，不被破坏成 ["*"]
    expect(parsed.skills?.workspace_skills).toEqual([{ name: "ws" }]); // workspace_skills 不再被丢弃
  });
});
