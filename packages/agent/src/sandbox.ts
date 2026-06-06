import {
  adaptSandboxProtocol,
  FilesystemBackend,
  LocalShellBackend,
  StateBackend,
  type LocalShellBackendOptions,
} from "deepagents";
import {
  getQuickJS,
  Scope,
  shouldInterruptAfterDeadline,
} from "quickjs-emscripten";

/** {@link Sandbox.runJs} 的选项。 */
export interface RunJsOptions {
  /** 执行超时（毫秒）。默认 5000。 */
  timeoutMs?: number;
  /** 内存上限（MB）。默认 64。 */
  memoryMb?: number;
}

/** {@link Sandbox.runJs} 的结果。 */
export interface RunJsResult {
  /** 是否成功执行（未抛错、未超时/超内存）。 */
  ok: boolean;
  /** 顶层表达式/返回值（已 dump 为普通 JS 值）。 */
  result?: unknown;
  /** 捕获到的 console.log 输出（按行）。 */
  logs: string[];
  /** 失败时的错误信息。 */
  error?: string;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * 安全沙箱（全部完全开源，零商业云）。两层:
 *
 * 1. backend —— 直接复用 deepagents 的文件系统/沙箱 backend:
 *    `state`(虚拟FS,无执行)、`files`(真实FS)、`local`(本地shell)、`adapt`(接外部沙箱)。
 *    把 backend 传给 `Agent.create(name, { backend })`;当 backend 具备执行能力时
 *    agent 会自动获得内置 `execute` 工具。
 * 2. runJs —— 进程内 quickjs-emscripten(WASM) 执行不可信 JS:无 Node API、无网络、
 *    无文件系统,带超时与内存上限,捕获 console.log。
 */
export const Sandbox = {
  /** 虚拟内存文件系统,无代码执行——最安全,默认。 */
  state: (): StateBackend => new StateBackend(),

  /** 真实磁盘文件系统(无 shell 执行)。 */
  files: (rootDir: string): FilesystemBackend =>
    new FilesystemBackend({ rootDir }),

  /**
   * 真实磁盘文件系统 + 本地 shell 执行(agent 将获得 `execute` 工具)。
   *
   * ⚠️ 无隔离:命令直接在宿主机运行。仅用于你信任 agent 的本地环境,
   * 切勿用于执行不可信代码。需要强隔离时,用 {@link Sandbox.runJs}(进程内 WASM),
   * 或 {@link Sandbox.adapt} 适配自托管的开源沙箱(如 Docker/gVisor)。
   */
  local: (options: LocalShellBackendOptions = {}): LocalShellBackend =>
    new LocalShellBackend(options),

  /** 把任意 `{ execute, id }` 沙箱(如自托管 Docker/gVisor 封装)适配成 backend。 */
  adapt: adaptSandboxProtocol,

  /**
   * 在进程内 quickjs WASM 沙箱里执行一段 JS。无 Node API/网络/文件系统,
   * 带超时与内存上限,捕获 console.log。用于安全执行模型生成的 JS(计算/数据变换)。
   */
  async runJs(code: string, options: RunJsOptions = {}): Promise<RunJsResult> {
    const timeoutMs = options.timeoutMs ?? 5000;
    const memoryBytes = (options.memoryMb ?? 64) * 1024 * 1024;
    const QuickJS = await getQuickJS();
    const logs: string[] = [];

    return Scope.withScope((scope): RunJsResult => {
      const ctx = scope.manage(QuickJS.newContext());
      // 资源上限:内存 + 截止时间(超时则中断执行)
      ctx.runtime.setMemoryLimit(memoryBytes);
      ctx.runtime.setInterruptHandler(
        shouldInterruptAfterDeadline(Date.now() + timeoutMs),
      );

      // 注入 console.log —— 沙箱内默认没有 console,把输出收集到 logs
      const consoleObj = scope.manage(ctx.newObject());
      const logFn = scope.manage(
        ctx.newFunction("log", (...args) => {
          logs.push(args.map((arg) => formatValue(ctx.dump(arg))).join(" "));
        }),
      );
      ctx.setProp(consoleObj, "log", logFn);
      ctx.setProp(ctx.global, "console", consoleObj);

      try {
        // unwrapResult:成功返回 value handle,失败抛出含沙箱错误信息的异常
        const handle = scope.manage(ctx.unwrapResult(ctx.evalCode(code)));
        return { ok: true, logs, result: ctx.dump(handle) };
      } catch (e) {
        return {
          ok: false,
          logs,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });
  },
};
