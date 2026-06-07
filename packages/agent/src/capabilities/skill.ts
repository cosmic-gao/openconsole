import { fileURLToPath } from "node:url";
import { FilesystemBackend } from "deepagents";

/** 本包内置 skills 目录的绝对路径(`packages/agent/skills`)。 */
function skillsDir(): string {
  return fileURLToPath(new URL("../../skills/", import.meta.url));
}

/**
 * SKILL 集成。基于 deepagents 的 skills middleware(渐进披露:系统提示里只放
 * skill 的名字与描述,agent 需要时再读全文)。
 *
 * 接线示例:
 * ```ts
 * const agent = await Agent.create("search", {
 *   skills: ["/"],            // 相对 backend 根,扫描全部内置 SKILL.md
 *   backend: Skill.backend(), // 指向内置 skills 目录
 * });
 * ```
 */
export const Skill = {
  /** 内置 skills 目录绝对路径。 */
  dir: skillsDir,

  /**
   * 构造一个指向内置 skills 目录的 `FilesystemBackend`;
   * 配合 `Agent.create(name, { skills: ["/"], backend: Skill.backend() })` 使用。
   */
  backend: (): FilesystemBackend =>
    new FilesystemBackend({ rootDir: skillsDir() }),
};
