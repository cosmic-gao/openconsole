import { spawn } from "node:child_process";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../types";

/** 解释器命令；可用 AGENT_PYTHON 覆盖（默认 python3）。 */
const PYTHON = process.env["AGENT_PYTHON"] ?? "python3";

function runPython(
  code: string,
  timeoutMs: number,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolveRun) => {
    const child = spawn(PYTHON, ["-c", code], { timeout: timeoutMs });
    let output = "";
    child.stdout?.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr?.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", (e) =>
      resolveRun({
        ok: false,
        output: `Failed to start ${PYTHON}: ${e.message}`,
      }),
    );
    child.on("close", (codeNum) => resolveRun({ ok: codeNum === 0, output }));
  });
}

/**
 * `run_python` —— 在宿主机执行一段 Python，返回合并的 stdout/stderr。
 * 移植自 magic 的 `run_python_snippet`。⚠️ 无隔离、在宿主机运行,需本机有 python3;
 * 不可信代码请改用 `run_javascript`(quickjs 沙箱)或自托管沙箱 backend。
 */
export const runPythonTool = Tool.define({
  name: "run_python",
  description:
    "Execute a Python snippet on the host and return its combined stdout/stderr. Requires python3 on the host. Use for data tasks that need Python libraries; for untrusted code prefer run_javascript.",
  schema: z.object({
    code: z.string().describe("The Python source to execute."),
  }),
  execute: async ({ code }): Promise<ToolResult> => {
    const r = await runPython(code, 30000);
    return r.ok
      ? ok(r.output || "(no output)")
      : err(r.output || "python execution failed");
  },
});
