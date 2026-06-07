import { stringify as stringifyYaml } from "yaml";

import { split } from "./parse";

/**
 * Crew 编译器。移植自 magic 的 `app/service/crew_agent_compiler.py`。
 *
 * 一个「crew agent」（员工）由若干 markdown 文件编写，再与 `crew.template.agent`
 * 模板合并、编译为单个 `.agent` 文件：
 *   tools  = 模板 tools + TOOLS.tools − TOOLS.exclude_builtin_tools（去重、保持顺序）
 *   skills = 模板 skills，再用 SKILLS 追加/覆盖
 *   body   = 模板正文，并把 CREW_ROLE / CREW_INSTRUCTIONS / CREW_PERSONALITY 占位符填入
 */
export interface CrewInput {
  /** IDENTITY.md：frontmatter `{ name, role?, description? }` + 角色正文。必填。 */
  identity: string;
  /** AGENTS.md 正文（工作流/规则）。可选。 */
  agents?: string;
  /** SOUL.md 正文（人格设定）。可选。 */
  soul?: string;
  /** TOOLS.md：frontmatter `{ tools?, exclude_builtin_tools? }`。可选。 */
  tools?: string;
  /** SKILLS.md：frontmatter 中的 skills 配置。可选。 */
  skills?: string;
  /** `crew.template.agent` 文本（frontmatter + 含 CREW_* 占位符的正文）。 */
  template: string;
}

/** 从 IDENTITY.md frontmatter 中提取的身份元数据。 */
export interface CrewMeta {
  name: string;
  role?: string;
  description?: string;
}

/** {@link Crew.compile} 的输出。 */
export interface CompiledCrew {
  /** 编译后的 `.agent` 文件文本（可直接交给 {@link Agent.parse}/{@link Agent.load}）。 */
  agent: string;
  /** 用于发布/注册的身份元数据。 */
  meta: CrewMeta;
}

/** 将任意值归一化为字符串数组：数组取其中的字符串项，单个字符串包成单元素数组，其余为空数组。 */
function asStringList(v: unknown): string[] {
  if (Array.isArray(v))
    return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") return [v];
  return [];
}

/** 将任意值归一化为数组：数组原样返回，null/undefined 返回空数组，标量包成单元素数组。 */
function asList(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  return v === undefined || v === null ? [] : [v];
}

/** 字符串数组去重，并保持首次出现的顺序。 */
function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

/** 计算 skill 条目的去重键：字符串直接用其本身，对象用其 `name` 字段，否则退化为 JSON 串。 */
function entryKey(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (
    entry &&
    typeof entry === "object" &&
    typeof (entry as { name?: unknown }).name === "string"
  ) {
    return (entry as { name: string }).name;
  }
  return JSON.stringify(entry);
}

/** 按 {@link entryKey} 对多个条目列表做去重合并，保持首次出现的顺序（靠前列表优先）。 */
function dedupeEntries(...lists: unknown[][]): unknown[] {
  const seen = new Set<string>();
  const out: unknown[] = [];
  for (const list of lists) {
    for (const entry of list) {
      const key = entryKey(entry);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(entry);
      }
    }
  }
  return out;
}

/** 合并一个 skill 来源：任一侧为 "*"（扫描整个目录）则结果为 "*"；否则按条目去重合并；空则 undefined。 */
function mergeSource(baseVal: unknown, cfgVal: unknown): unknown {
  if (baseVal === "*" || cfgVal === "*") return "*";
  const merged = dedupeEntries(asList(baseVal), asList(cfgVal));
  return merged.length > 0 ? merged : undefined;
}

/** 将 SKILLS.md 的配置合并到模板的 skills 块上（合并规则见文件头注释）。 */
function mergeSkills(
  templateSkills: unknown,
  skillsDoc: string | undefined,
): Record<string, unknown> {
  // 以模板的 skills 为基底（浅拷贝，避免改动模板原对象）
  const base: Record<string, unknown> =
    templateSkills && typeof templateSkills === "object"
      ? { ...(templateSkills as Record<string, unknown>) }
      : {};
  if (!skillsDoc) return base;

  // SKILLS.md 的配置既可写在 frontmatter 的 `skills:` 子键下，也可直接平铺在 frontmatter 顶层；
  // 这里做兼容：优先取 `skills` 子对象，否则退回整个 frontmatter。
  const fm = split(skillsDoc).data;
  const cfgRaw = fm["skills"];
  const cfg = (cfgRaw && typeof cfgRaw === "object" ? cfgRaw : fm) as Record<
    string,
    unknown
  >;

  // system_skills / workspace_skills：合并去重，"*" 哨兵优先
  for (const key of ["system_skills", "workspace_skills"] as const) {
    const merged = mergeSource(base[key], cfg[key]);
    if (merged !== undefined) base[key] = merged;
  }

  // crew_skills：直接「覆盖」。兼容把它写成 `skills` 键的情况
  if (cfg["crew_skills"] !== undefined)
    base["crew_skills"] = cfg["crew_skills"];
  else if (cfg["skills"] !== undefined) base["crew_skills"] = cfg["skills"];

  // excluded_skills：直接「覆盖」
  if (cfg["excluded_skills"] !== undefined)
    base["excluded_skills"] = cfg["excluded_skills"];

  // preload：与 system_skills 一样「合并去重」
  const preload = dedupeEntries(
    asList(base["preload"]),
    asList(cfg["preload"]),
  );
  if (preload.length > 0) base["preload"] = preload;

  return base;
}

/** 将 crew 的各 markdown 文件编译为单个 `.agent` 定义。 */
function compile(input: CrewInput): CompiledCrew {
  const tpl = split(input.template);
  const identity = split(input.identity);

  // 合成 tools：模板工具 + TOOLS.md 追加工具，去重保序后，再剔除被排除的内置工具
  const templateTools = asStringList(tpl.data["tools"]);
  const toolsFm = input.tools ? split(input.tools).data : {};
  const extraTools = asStringList(toolsFm["tools"]);
  const excluded = new Set(asStringList(toolsFm["exclude_builtin_tools"]));
  const tools = dedupeStrings([...templateTools, ...extraTools]).filter(
    (t) => !excluded.has(t),
  );

  // 合并 skills
  const skills = mergeSkills(tpl.data["skills"], input.skills);

  // 占位符替换：把模板正文中的 CREW_* 标记替换为各文件的实际内容（trim 去掉首尾空白）
  const body = tpl.body
    .replaceAll("CREW_ROLE", identity.body.trim())
    .replaceAll("CREW_INSTRUCTIONS", (input.agents ?? "").trim())
    .replaceAll("CREW_PERSONALITY", (input.soul ?? "").trim());

  // 重新拼出 frontmatter + 正文。llm 缺省回退到 "main_llm"
  const frontmatter: Record<string, unknown> = {
    llm: typeof tpl.data["llm"] === "string" ? tpl.data["llm"] : "main_llm",
    tools,
  };
  if (Object.keys(skills).length > 0) frontmatter["skills"] = skills; // 无 skills 则不写该字段
  const agent = `---\n${stringifyYaml(frontmatter).trimEnd()}\n---\n\n${body.trim()}\n`;

  // 提取身份元数据；name 缺省回退到 "agent"，role/description 存在才填
  const meta: CrewMeta = {
    name:
      typeof identity.data["name"] === "string"
        ? identity.data["name"]
        : "agent",
  };
  if (typeof identity.data["role"] === "string")
    meta.role = identity.data["role"];
  if (typeof identity.data["description"] === "string")
    meta.description = identity.data["description"];

  return { agent, meta };
}

/** Crew 编译入口。`Crew.compile({ identity, template, ... })`。 */
export const Crew = { compile };
