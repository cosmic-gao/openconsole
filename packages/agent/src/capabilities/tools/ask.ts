import { z } from "zod";

import { Tool } from "../tool";
import { ok } from "../../types";

/**
 * `ask` —— 向用户提问。移植自 magic 的 `ask_user`（一个会暂停运行的 USER_TOOL_CALL）。
 * 若要真正暂停以等待输入，需在构建代理时配置 checkpointer 与
 * `interruptOn: { ask: true }`（DeepAgent 的人机协作机制）。单独使用时，
 * 该工具只是把问题抛出来。
 */
export const askTool = Tool.define({
  name: "ask",
  description:
    "Ask the user a clarifying question and wait for their answer. Use only when you genuinely cannot proceed without their input. Pass a single, specific question.",
  schema: z.object({
    question: z.string().describe("The question to ask the user."),
  }),
  execute: ({ question }) => ok(question),
});
