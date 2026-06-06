import { z } from "zod";

import { Tool } from "../tool";
import { ok } from "../types";

/**
 * `think` —— 一块私有的推理/规划草稿区。移植自 magic 的 `thinking` 工具。
 * 它除了把思考内容原样回显外不做任何事，为模型提供一个「行动前先规划」的位置
 *（这能提升多步工具调用的效果）。
 */
export const thinkTool = Tool.define({
  name: "think",
  description:
    "Record a private reasoning or planning step before acting. The thought is returned unchanged; no side effects. Use it to break down a task or reflect on results.",
  schema: z.object({
    thought: z.string().describe("Your reasoning, plan, or reflection."),
  }),
  execute: ({ thought }) => ok(thought),
});
