/**
 * Hooks —— Claude Code 式的确定性控制点，底层编译成一个 LangChain 中间件，
 * 经 `build(spec, { middleware: [Hook.middleware(hooks)] })` 挂载。
 *
 * 不给 `BuildOptions` 加专属 `hooks` 字段：Hooks 只是「生产中间件的一种方式」，
 * 统一走 `middleware` 数组（扩展只走参数/接口/注册表，不预埋抽象层）。
 */
import { ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createMiddleware, type AgentMiddleware } from "langchain";

/**
 * `preToolUse` 的决策：
 *  - `void` / `{decision:"allow"}`：放行；
 *  - `{decision:"deny"}`：拒绝，回填一条 error ToolMessage，工具不执行；
 *  - `{decision:"modify"}`：改参后放行。
 *
 * 需要真正的人工确认，请用 deepagents 原生 HITL：
 * `build({ interruptOn: { [tool]: true }, checkpointer: true })`。
 */
export type PreToolDecision =
  | void
  | { decision: "allow" }
  | { decision: "deny"; reason?: string }
  | { decision: "modify"; args: Record<string, unknown> };

/** 工具执行前事件。 */
export interface PreToolUse {
  tool: string;
  args: Record<string, unknown>;
  toolCallId: string;
  runtime: unknown;
}

/** 工具执行后事件。`result` 是工具产出的 ToolMessage。 */
export interface PostToolUse {
  tool: string;
  args: Record<string, unknown>;
  result: ToolMessage;
  runtime: unknown;
}

/** agent 结束事件。 */
export interface StopEvent {
  messages: BaseMessage[];
  runtime: unknown;
}

/** 生命周期钩子集合。每个钩子均可选。 */
export interface Hooks {
  /** 工具执行前：放行 / 拒绝 / 改参（见 {@link PreToolDecision}）。 */
  preToolUse?: (e: PreToolUse) => PreToolDecision | Promise<PreToolDecision>;
  /** 工具执行后：观测或后处理。返回新的 ToolMessage 则替换原结果。 */
  postToolUse?: (
    e: PostToolUse,
  ) => void | ToolMessage | Promise<void | ToolMessage>;
  /** agent 结束时触发一次。 */
  stop?: (e: StopEvent) => void | Promise<void>;
}

/** Hooks 入口。`Hook.middleware(hooks)` 把一组钩子编译成中间件。 */
export const Hook = {
  /** 把一组 {@link Hooks} 编译成可挂到 `build({ middleware })` 的中间件。 */
  middleware(hooks: Hooks): AgentMiddleware {
    return createMiddleware({
      name: "hooks",
      wrapToolCall: async (request, handler) => {
        const id = request.toolCall.id ?? "";
        let call = request;
        if (hooks.preToolUse) {
          const d = await hooks.preToolUse({
            tool: request.toolCall.name,
            args: request.toolCall.args,
            toolCallId: id,
            runtime: request.runtime,
          });
          if (d && d.decision === "deny") {
            return new ToolMessage({
              content: `Denied: ${d.reason ?? "blocked by hook"}`,
              tool_call_id: id,
              status: "error",
            });
          }
          if (d && d.decision === "modify") {
            call = { ...request, toolCall: { ...request.toolCall, args: d.args } };
          }
        }
        const result = await handler(call);
        if (hooks.postToolUse && result instanceof ToolMessage) {
          const replaced = await hooks.postToolUse({
            tool: request.toolCall.name,
            args: request.toolCall.args,
            result,
            runtime: request.runtime,
          });
          if (replaced) return replaced;
        }
        return result;
      },
      afterAgent: async (state, runtime) => {
        if (hooks.stop) await hooks.stop({ messages: state.messages, runtime });
      },
    });
  },
};
