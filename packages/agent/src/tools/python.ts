import { spawn } from "node:child_process";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../types";

/** 解释器命令；可用 AGENT_PYTHON 覆盖（默认 python3）。 */
const PYTHON = process.env["AGENT_PYTHON"] ?? "python3";

/** {@link makeRunPython} 选项。 */
export interface PythonToolOptions {
  /**
   * 是否允许在宿主机 spawn 执行（⚠️ 无隔离）。默认 false：仅信任环境显式开启。
   * 也可用环境变量 `AGENT_PYTHON_HOST=1` 开启（两个逃生口取 OR）。
   */
  host?: boolean;
  /** 执行超时（毫秒）。默认 30000。 */
  timeoutMs?: number;
}

function runHostPython(
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
 * 工厂：按选项产出 `run_python` 工具。移植自 magic 的 `run_python_snippet`。
 *
 * **安全默认**：`host=false` 时调用即返回拒绝与指引，**不** spawn——quickjs（{@link Sandbox.runJs}）
 * 跑不了 Python，故默认不在宿主机执行不可信代码。`host=true`（或 `AGENT_PYTHON_HOST=1`）才在
 * 宿主机执行（⚠️ 无隔离，仅信任环境）；需要强隔离的不可信代码请用 `run_javascript`（WASM 沙箱）
 * 或经 {@link Sandbox.adapt} 接自托管沙箱（Docker/gVisor）。
 */
export function makeRunPython(options: PythonToolOptions = {}) {
  const host = options.host ?? process.env["AGENT_PYTHON_HOST"] === "1";
  const timeoutMs = options.timeoutMs ?? 30000;
  return Tool.define({
    name: "run_python",
    description: host
      ? "Execute a Python snippet on the host and return combined stdout/stderr. Requires python3 on the host. For untrusted code prefer run_javascript."
      : "Execute Python. Host execution is DISABLED by default for safety; this returns guidance unless explicitly enabled. For untrusted code use run_javascript (in-process WASM sandbox).",
    schema: z.object({
      code: z.string().describe("The Python source to execute."),
    }),
    execute: async ({ code }): Promise<ToolResult> => {
      if (!host) {
        return err(
          "run_python host execution is disabled by default. Enable it in a trusted environment via AGENT_PYTHON_HOST=1 or makeRunPython({ host: true }); for untrusted code use run_javascript (WASM sandbox) or a self-hosted sandbox via Sandbox.adapt.",
        );
      }
      const r = await runHostPython(code, timeoutMs);
      return r.ok
        ? ok(r.output || "(no output)")
        : err(r.output || "python execution failed");
    },
  });
}

/**
 * 默认 `run_python` 工具（安全默认：宿主机执行需 `AGENT_PYTHON_HOST=1` 或
 * `makeRunPython({ host: true })` 显式开启）。
 */
export const runPythonTool = makeRunPython();
