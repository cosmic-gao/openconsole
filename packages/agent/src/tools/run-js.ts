import { z } from "zod";

import { Sandbox } from "../sandbox";
import { Tool } from "../tool";
import { err, ok } from "../types";

/**
 * `run_javascript` —— 在进程内 quickjs WASM 沙箱里安全执行 JS。
 * 移植 magic 的 Code Mode 思路,但用完全开源的进程内沙箱(无 Node API/网络/文件系统)。
 */
export const runJsTool = Tool.define({
  name: "run_javascript",
  description:
    "Execute a snippet of JavaScript in a secure in-process sandbox (no Node.js APIs, no network, no filesystem; time- and memory-limited). Use console.log to print output; the value of the last expression is also returned. Good for calculations and transforming data already present in the conversation.",
  schema: z.object({
    code: z.string().describe("The JavaScript source to execute."),
  }),
  execute: async ({ code }) => {
    const r = await Sandbox.runJs(code);
    if (!r.ok) {
      return err(
        `Error: ${r.error ?? "unknown error"}${r.logs.length ? `\n${r.logs.join("\n")}` : ""}`,
      );
    }
    const parts: string[] = [];
    if (r.logs.length > 0) parts.push(r.logs.join("\n"));
    if (r.result !== undefined) {
      parts.push(
        `=> ${typeof r.result === "string" ? r.result : JSON.stringify(r.result)}`,
      );
    }
    return ok(parts.length > 0 ? parts.join("\n") : "(no output)", {
      result: r.result,
      logs: r.logs,
    });
  },
});
