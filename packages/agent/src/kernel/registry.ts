import type { StructuredTool } from "@langchain/core/tools";

/**
 * 工具注册表。magic `ToolFactory` 的轻量移植：工具按名字注册，代理在构建时
 * 把自己的 `tools:` 名字列表解析为实例。未知名字会被告警并丢弃
 *（与 magic 的工具校验器行为一致）。
 */
export class ToolRegistry {
  private readonly tools = new Map<string, StructuredTool>();

  /** 以工具的 `name` 为键注册该工具。返回 `this` 以便链式调用。 */
  register(tool: StructuredTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  /** 一次性注册多个工具。 */
  registerAll(tools: StructuredTool[]): this {
    for (const t of tools) this.register(t);
    return this;
  }

  /** 该名字的工具是否已注册。 */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** 把一组工具名解析为实例；遇到未知名字则告警并跳过（不报错）。 */
  get(names: string[]): StructuredTool[] {
    const out: StructuredTool[] = [];
    for (const name of names) {
      const tool = this.tools.get(name);
      if (tool) out.push(tool);
      else
        console.warn(`[@openconsole/agent] unknown tool "${name}" — skipped`);
    }
    return out;
  }

  /** 所有已注册的工具。 */
  all(): StructuredTool[] {
    return [...this.tools.values()];
  }
}

/** 进程级的默认注册表。内置工具在被 import 时注册到这里。 */
export const registry = new ToolRegistry();
