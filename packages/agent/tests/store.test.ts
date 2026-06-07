import { describe, expect, it } from "vitest";

import { checkpoint } from "../src/store";

/** 探测可选依赖是否已安装，让测试对「装了 / 没装」两种环境都成立。 */
async function sqlitePresent(): Promise<boolean> {
  try {
    await import("@langchain/langgraph-checkpoint-sqlite" as string);
    return true;
  } catch {
    return false;
  }
}

describe("checkpoint", () => {
  it("memory() returns a checkpoint saver", () => {
    const saver = checkpoint.memory();
    // BaseCheckpointSaver 的契约方法之一
    expect(typeof (saver as { getTuple?: unknown }).getTuple).toBe("function");
  });

  it("sqlite() yields a saver when the optional dep is present, else a clear install hint", async () => {
    if (await sqlitePresent()) {
      const saver = await checkpoint.sqlite(":memory:");
      expect(typeof (saver as { getTuple?: unknown }).getTuple).toBe("function");
    } else {
      // 可选依赖未安装：应抛出带安装指引的错误
      await expect(checkpoint.sqlite(":memory:")).rejects.toThrow(
        /langgraph-checkpoint-sqlite/,
      );
    }
  });
});
