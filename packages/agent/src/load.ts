import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "./parse";
import { render } from "./template";
import { isSkillsConfigEmpty, type AgentSpec } from "./types";

/**
 * Agent 加载器。移植自 magic 的 `AgentLoader`：读取 `<dir>/<name>.agent`，
 * 解析 frontmatter，再对正文做模板展开与注释剥离，得到系统提示词。
 */
export interface LoadOptions {
  /** 存放 `.agent` 文件的目录。默认为本包内置的 `agents/`。 */
  agentsDir?: string;
  /** 提示词正文中 `@variable(...)` 所需的变量（如 `agent_profile`）。 */
  vars?: Record<string, string>;
}

/** 本包随附的内置 `agents/` 目录。 */
export function defaultAgentsDir(): string {
  // 基于当前模块 URL 解析，使内置目录无论从何处被引用都能正确定位
  return fileURLToPath(new URL("../agents/", import.meta.url));
}

/** 加载一个 `.agent` 定义并完整渲染为 {@link AgentSpec}。 */
export async function load(
  name: string,
  options: LoadOptions = {},
): Promise<AgentSpec> {
  const dir = options.agentsDir ?? defaultAgentsDir();
  const file = resolve(dir, `${name}.agent`);
  const text = await readFile(file, "utf8");
  const parsed = parse(text);
  // baseDir 设为 .agent 文件所在目录，使正文里的 @include 相对路径能正确解析
  const prompt = await render(parsed.body, {
    baseDir: dir,
    vars: options.vars ?? {},
  });

  const spec: AgentSpec = {
    modelId: parsed.modelId,
    tools: parsed.tools,
    prompt,
  };
  if (parsed.skills) {
    spec.skills = parsed.skills;
    // skills 块当前不会被脚手架自动接线到 DeepAgent，非空时提示改用 Agent.create 传源路径
    if (!isSkillsConfigEmpty(parsed.skills)) {
      console.warn(
        `[@openconsole/agent] agent "${name}" declares a skills block, which the scaffold does not auto-wire to DeepAgent. Pass skill source paths via Agent.create(name, { skills: [...] }) instead (see README / Phase-2).`,
      );
    }
  }
  return spec;
}
