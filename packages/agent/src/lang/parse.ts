import { parse as parseYaml } from "yaml";

import { SkillsConfigSchema, type SkillsConfig } from "../types";

/**
 * `.agent` 文件解析器。移植自 magic 的 `agentlang/agent/define/parser.py`。
 *
 * 格式：YAML frontmatter（`--- ... ---`）后接一段模板化的提示词正文。
 * `tools` 和 `llm` 均为必填（magic 对缺失的 `llm` 只是告警；这里改为强制要求）。
 */

// 匹配文件开头的 frontmatter 块：`^` 锚定起始，捕获两道 `---` 之间的 YAML 内容；
// `[\s\S]*?` 非贪婪，确保停在第一个结束分隔符。兼容 CRLF/LF（`\r?\n`）。
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** 一篇文档被拆分为 YAML frontmatter 与其余正文两部分。 */
export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
}

/**
 * 从文档中分离 YAML frontmatter 与正文。无 frontmatter 时，`data` 为 `{}`、
 * `body` 为整段文本。crew 编译器也复用此函数处理 IDENTITY/TOOLS/SKILLS 这些
 * markdown 文件（它们并非完整的 `.agent` 文件）。
 */
export function split(text: string): Frontmatter {
  const m = FRONTMATTER.exec(text);
  if (!m) return { data: {}, body: text };
  const parsed = parseYaml(m[1] ?? "") as unknown;
  // YAML 可能解析出标量/数组/null，这里只接受对象（映射），数组也排除，否则归一为空对象
  const data =
    parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  return { data, body: text.slice(m[0].length) };
}

/** {@link parse} 的结果：frontmatter 字段 + 尚未渲染的原始提示词正文。 */
export interface ParsedAgentFile {
  /** 来自 `llm:` 的模型别名或 id。 */
  modelId: string;
  /** 工具白名单：名字 -> 选项。 */
  tools: Record<string, Record<string, unknown>>;
  /** 可选的 skills 配置。 */
  skills?: SkillsConfig;
  /** 去掉 frontmatter 后的原始提示词正文（尚未做模板展开）。 */
  body: string;
}

/** 将 `.agent` 文件文本解析为 frontmatter 字段与原始正文。 */
export function parse(text: string): ParsedAgentFile {
  if (!FRONTMATTER.test(text)) {
    throw new Error("Agent file is missing YAML frontmatter (--- ... ---).");
  }
  const { data: fm, body } = split(text);
  if (Object.keys(fm).length === 0) {
    throw new Error("Agent frontmatter is empty or not a mapping.");
  }

  // tools：必填（字符串或字符串数组）；统一解析为 { 名字: {} } 形式的 record。
  // 用 record 而非数组，是为了给每个工具预留挂载「按工具选项」的位置（当前为空对象）。
  const rawTools = fm["tools"];
  if (rawTools === undefined || rawTools === null) {
    throw new Error("Agent frontmatter is missing required `tools`.");
  }
  const list: unknown[] = Array.isArray(rawTools) ? rawTools : [rawTools]; // 标量也归一为单元素数组
  const tools: Record<string, Record<string, unknown>> = {};
  for (const t of list) {
    if (typeof t === "string" && t.length > 0) tools[t] = {}; // 跳过非字符串/空串项
  }

  // llm：必填。
  const rawLlm = fm["llm"];
  if (typeof rawLlm !== "string" || rawLlm.length === 0) {
    throw new Error("Agent frontmatter is missing required `llm`.");
  }

  const parsed: ParsedAgentFile = { modelId: rawLlm, tools, body };

  // skills：可选。存在则用 zod schema 校验并归一化。
  const rawSkills = fm["skills"];
  if (rawSkills !== undefined && rawSkills !== null) {
    parsed.skills = SkillsConfigSchema.parse(rawSkills);
  }
  return parsed;
}
