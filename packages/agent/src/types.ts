import { z } from "zod";

/**
 * 声明式 Agent 层的公共类型。
 *
 * 这些类型对应 magic 的 `agentlang/agent/define/models.py`（AgentDefine / SkillsConfig）
 * 与 `agentlang/tools/tool_result.py`（ToolResult），并裁剪到本脚手架所需的范围。
 */

/** 一个 skill 引用：裸名字，或 `{ name, path? }`。 */
export const SkillEntrySchema = z.union([
  z.string(),
  z.object({ name: z.string(), path: z.string().optional() }),
]);
export type SkillEntry = z.infer<typeof SkillEntrySchema>;

/** 一个 skill 来源：`"*"`（扫描整个目录）或一份显式的条目列表。 */
export const SkillSourceSchema = z.union([
  z.literal("*"),
  z.array(SkillEntrySchema),
]);
export type SkillSource = z.infer<typeof SkillSourceSchema>;

/** 一个 preload 条目：裸名字，或 `{ name, files? }`（files 默认为 `["SKILL.md"]`）。 */
export const PreloadEntrySchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    files: z.union([z.string(), z.array(z.string())]).optional(),
  }),
]);
export type PreloadEntry = z.infer<typeof PreloadEntrySchema>;

/** `.agent` frontmatter 中的 `skills:` 配置块。 */
export const SkillsConfigSchema = z.object({
  system_skills: SkillSourceSchema.optional(),
  crew_skills: SkillSourceSchema.optional(),
  workspace_skills: SkillSourceSchema.optional(),
  excluded_skills: z.array(z.string()).optional(),
  preload: z.array(PreloadEntrySchema).optional(),
});
export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;

/** 当 skills 配置不含任何可用来源时返回 true。 */
export function isSkillsConfigEmpty(skills: SkillsConfig | undefined): boolean {
  if (!skills) return true;
  const sources = [
    skills.system_skills,
    skills.crew_skills,
    skills.workspace_skills,
  ];
  return sources.every(
    (s) => s === undefined || (Array.isArray(s) && s.length === 0),
  );
}

/**
 * 解析后的 `.agent` 定义。
 *
 * 由 {@link Agent.parse} 产出；其中 `prompt` 是已完成模板展开、注释剥离的系统提示词。
 */
export interface AgentSpec {
  /** 来自 frontmatter `llm:` 的模型别名或具体 id（如 `"main_llm"`）。 */
  modelId: string;
  /** 工具白名单：工具名 -> 按工具的选项（目前恒为 `{}`）。 */
  tools: Record<string, Record<string, unknown>>;
  /** 可选的 skills 配置。未声明任何 skill 时为 undefined。 */
  skills?: SkillsConfig;
  /** 已渲染的系统提示词。 */
  prompt: string;
}

/**
 * 工具统一返回的值。移植自 magic 的 `ToolResult`：
 * `content` 给模型读；`data` 是结构化数据，经 LangChain 的 `content_and_artifact`
 * 机制作为 `ToolMessage.artifact` 暴露给调用方/中间件，不进入模型上下文。
 */
export interface ToolResult {
  /** 给模型阅读的可读文本。 */
  content: string;
  /** 本次调用是否成功。默认 true。 */
  ok?: boolean;
  /** 结构化数据（作为 artifact 暴露，不放入模型上下文）。 */
  data?: Record<string, unknown>;
}

/** 构造一个成功的 {@link ToolResult}。 */
export function ok(
  content: string,
  data?: Record<string, unknown>,
): ToolResult {
  return data === undefined
    ? { content, ok: true }
    : { content, ok: true, data };
}

/** 构造一个失败的 {@link ToolResult}。 */
export function err(
  content: string,
  data?: Record<string, unknown>,
): ToolResult {
  return data === undefined
    ? { content, ok: false }
    : { content, ok: false, data };
}
