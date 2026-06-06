/**
 * 安全沙箱示例：
 *  1) 进程内 quickjs 执行 JS(完全开源、无需模型/网络，可直接跑)；
 *  2) 给 agent 配 LocalShellBackend，使其获得 execute(shell) 工具(⚠️ 弱隔离，需配置模型)。
 * 运行：pnpm --filter @openconsole/agent exec tsx examples/sandbox.ts
 */
import { Agent, Sandbox } from "../index";

async function main(): Promise<void> {
  // 1) 进程内沙箱：安全跑一段 JS（无 Node API/网络/文件系统）
  const r = await Sandbox.runJs(
    "const a = [3, 1, 2]; console.log('sorted', JSON.stringify(a.sort())); a.length",
  );
  console.log("runJs =>", r);

  // 2) agent + 本地 shell backend（⚠️ 命令在宿主机执行，仅信任环境用）；需配置模型
  if (!process.env["AGENT_MODEL"] && !process.env["AGENT_MAIN_MODEL"]) {
    console.log("(设置 AGENT_MODEL + 对应 API Key 后可演示 execute 工具)");
    return;
  }
  const agent = await Agent.create("explore", { backend: Sandbox.local() });
  console.log(await agent.run("Run `node --version` and report the output."));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
