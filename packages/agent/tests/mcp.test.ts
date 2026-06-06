import { describe, expect, it } from "vitest";

import { defaultMcpServers, Mcp } from "../src/mcp";

describe("Mcp", () => {
  it("exposes connect and register", () => {
    expect(typeof Mcp.connect).toBe("function");
    expect(typeof Mcp.register).toBe("function");
  });

  it("ships default reference servers (stdio / npx)", () => {
    expect(Object.keys(defaultMcpServers)).toEqual(
      expect.arrayContaining(["filesystem", "memory", "sequential-thinking"]),
    );
    expect(defaultMcpServers["filesystem"]).toMatchObject({
      transport: "stdio",
      command: "npx",
    });
  });
});
