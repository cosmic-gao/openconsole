import { tool } from "@langchain/core/tools";
import type { StructuredTool } from "@langchain/core/tools";
import type { z } from "zod";

import type { ToolResult } from "./types";

/**
 * 工具定义。把 magic 的 `BaseTool` 模式（zod 参数 + `execute -> ToolResult`）
 * 桥接到 DeepAgent 可调用的 LangChain `tool()` 上。
 */
export interface ToolDef<S extends z.ZodType> {
  /** 模型调用时使用的工具名。 */
  name: string;
  /** 工具的功能描述，会展示给模型。 */
  description: string;
  /** 工具参数的 zod schema。 */
  schema: S;
  /** 具体实现。返回 {@link ToolResult}；其中 `content` 才是模型读到的内容。 */
  execute: (input: z.infer<S>) => Promise<ToolResult> | ToolResult;
}

/**
 * 由 {@link ToolDef} 创建一个 LangChain 工具。
 *
 * 采用 LangChain 的 `content_and_artifact` 约定：回调返回 `[content, data]`——
 * `content` 进入模型上下文，`data` 作为 `ToolMessage.artifact` 暴露给调用方/中间件，
 * 既不丢失结构化结果，也不占用模型上下文。
 */
function define<S extends z.ZodType>(def: ToolDef<S>): StructuredTool {
  const built = tool(
    async (input: z.infer<S>): Promise<[string, Record<string, unknown>]> => {
      const result = await def.execute(input);
      return [result.content, result.data ?? {}];
    },
    {
      name: def.name,
      description: def.description,
      schema: def.schema,
      responseFormat: "content_and_artifact",
    },
  );
  // tool() 的返回类型在 exactOptionalPropertyTypes 下与 StructuredTool 抽象类并不完全兼容
  // （zod schema 的 _def.description 可选性差异），属 LangChain + 严格 TS 的已知摩擦；
  // 这里统一收敛为 StructuredTool，便于注册表存放与 createDeepAgent 装配。
  return built as unknown as StructuredTool;
}

/** 工具定义入口。`Tool.define({ name, description, schema, execute })`。 */
export const Tool = { define };
