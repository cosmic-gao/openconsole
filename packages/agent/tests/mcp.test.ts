import { describe, expect, it } from "vitest";

import { Mcp } from "../src/mcp";

describe("Mcp", () => {
  it("exposes connect and register", () => {
    expect(typeof Mcp.connect).toBe("function");
    expect(typeof Mcp.register).toBe("function");
  });

  it("ships default reference servers (stdio / npx)", () => {
    expect(Object.keys(Mcp.defaults)).toEqual(
      expect.arrayContaining(["filesystem", "memory", "sequential-thinking"]),
    );
    expect(Mcp.defaults["filesystem"]).toMatchObject({
      transport: "stdio",
      command: "npx",
    });
  });
});
