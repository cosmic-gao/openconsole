/**
 * 中间件层。与 {@link ToolRegistry}（工具）、{@link ModelRegistry}（模型）对称：
 * 一个按名注册的 {@link MiddlewareRegistry}，外加三个内置中间件工厂。
 *
 * 全部基于 LangChain v1 的 `createMiddleware`（deepagents 的一等扩展点），
 * 经 `Agent.create(name, { middleware: [...] })` / `build(spec, { middleware })` 挂载，
 * 追加在 deepagents 内置中间件之后。
 *
 *  - {@link horizon}：每轮模型调用前注入系统上下文（移植 magic 的 AgentHorizon）；
 *  - {@link observe}：把工具/agent 生命周期记录到 {@link EventSink}；
 *  - {@link guard}：工具调用前的权限策略（allow / deny / modify）。
 *
 * 注：langsmith 集成走其原生环境变量自动 tracing（`LANGCHAIN_TRACING_V2=true` + key），
 * 无需在此手写 sink；{@link observe} 的 sink 用于自定义遥测/转发（如推给前端 SSE）。
 */
import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseMessage } from "@langchain/core/messages";
import { createMiddleware, type AgentMiddleware } from "langchain";

import { events, type EventSink } from "./event";

/**
 * 中间件注册表。magic 风格的按名注册，行为对齐 {@link ToolRegistry}：
 * 以中间件自带的 `name` 为键；未知名字在 {@link get} 时告警并跳过。
 */
export class MiddlewareRegistry {
  private readonly items = new Map<string, AgentMiddleware>();

  /** 以中间件的 `name` 为键注册。返回 `this` 以便链式调用。 */
  register(mw: AgentMiddleware): this {
    this.items.set(mw.name, mw);
    return this;
  }

  /** 一次性注册多个中间件。 */
  registerAll(mws: AgentMiddleware[]): this {
    for (const mw of mws) this.register(mw);
    return this;
  }

  /** 该名字的中间件是否已注册。 */
  has(name: string): boolean {
    return this.items.has(name);
  }

  /** 把一组名字解析为中间件实例；遇到未知名字则告警并跳过（不报错）。 */
  get(names: string[]): AgentMiddleware[] {
    const out: AgentMiddleware[] = [];
    for (const name of names) {
      const mw = this.items.get(name);
      if (mw) out.push(mw);
      else
        console.warn(
          `[@openconsole/agent] unknown middleware "${name}" — skipped`,
        );
    }
    return out;
  }

  /** 所有已注册的中间件。 */
  all(): AgentMiddleware[] {
    return [...this.items.values()];
  }
}

/** 进程级共享的中间件注册表。 */
export const middlewares = new MiddlewareRegistry();

// ———————————————————————————— horizon ————————————————————————————

/**
 * 系统上下文片段生成器：每轮模型调用前执行，返回要追加到 system message 末尾的文本
 *（返回空串则本轮跳过）。`messages` 是当前对话消息，`runtime` 是中间件运行时（含 context/signal 等）。
 */
export type HorizonInject = (ctx: {
  messages: BaseMessage[];
  runtime: unknown;
}) => string | Promise<string>;

/**
 * 逐轮系统上下文注入（移植 magic 的 AgentHorizon）。用 `wrapModelCall` 在每次模型调用前，
 * 把 `inject()` 产出的上下文（时间、进度、环境等）拼到 system message 上。
 *
 * 用 `systemMessage.concat(...)` 而非改已废弃的 `systemPrompt` 字符串，保留 cache_control 能力。
 */
export function horizon(inject: HorizonInject): AgentMiddleware {
  return createMiddleware({
    name: "horizon",
    wrapModelCall: async (request, handler) => {
      const extra = await inject({
        messages: request.state.messages,
        runtime: request.runtime,
      });
      if (!extra) return handler(request);
      return handler({
        ...request,
        systemMessage: request.systemMessage.concat(
          new SystemMessage(`\n\n${extra}`),
        ),
      });
    },
  });
}

// ———————————————————————————— observe ————————————————————————————

/** 取工具结果（ToolMessage）的可读文本，防御任意形状。 */
function resultText(result: unknown): string {
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (typeof o["text"] === "string") return o["text"];
    if (typeof o["content"] === "string") return o["content"];
  }
  return "";
}

/**
 * 把工具与 agent 的生命周期记录到 {@link EventSink}，产出与流式路径同构的 {@link Event}
 *（`tool_start` / `tool_end`，并填充 `durationMs` 与 `data`=artifact）。缺省走 {@link events.console}。
 */
export function observe(sink: EventSink = events.console): AgentMiddleware {
  return createMiddleware({
    name: "observe",
    wrapToolCall: async (request, handler) => {
      const id = request.toolCall.id ?? "";
      const name = request.toolCall.name;
      await sink.emit({ type: "tool_start", id, name, input: request.toolCall.args });
      const t0 = Date.now();
      const result = await handler(request);
      const durationMs = Date.now() - t0;
      const artifact = (result as { artifact?: unknown } | undefined)?.artifact;
      const status = (result as { status?: unknown } | undefined)?.status;
      await sink.emit({
        type: "tool_end",
        id,
        name,
        ok: status !== "error",
        content: resultText(result),
        durationMs,
        ...(artifact && typeof artifact === "object"
          ? { data: artifact as Record<string, unknown> }
          : {}),
      });
      return result;
    },
  });
}

// ————————————————————————————— guard —————————————————————————————

/** 权限决策：放行 / 拒绝（回填错误结果）/ 改参后放行。 */
export type GuardDecision =
  | { action: "allow" }
  | { action: "deny"; reason?: string }
  | { action: "modify"; args: Record<string, unknown> };

/** 工具调用前的策略：据工具名/参数返回 {@link GuardDecision}。与 deepagents 的 permissions/interruptOn 正交、可组合。 */
export type GuardPolicy = (call: {
  name: string;
  args: Record<string, unknown>;
  runtime: unknown;
}) => GuardDecision | Promise<GuardDecision>;

/**
 * 工具调用前的权限策略中间件。`deny` 直接回填一条 error ToolMessage 且不执行工具；
 * `modify` 改参后放行；`allow` 原样放行。
 *
 * 注：需要「人工确认」请用 deepagents 原生 HITL（`build({ interruptOn: { [tool]: true }, checkpointer: true })`），
 * guard 不自造 interrupt（不稳、与底座重叠）。
 */
export function guard(policy: GuardPolicy): AgentMiddleware {
  return createMiddleware({
    name: "guard",
    wrapToolCall: async (request, handler) => {
      const decision = await policy({
        name: request.toolCall.name,
        args: request.toolCall.args,
        runtime: request.runtime,
      });
      if (decision.action === "deny") {
        return new ToolMessage({
          content: `Blocked by guard: ${decision.reason ?? "policy denied"}`,
          tool_call_id: request.toolCall.id ?? "",
          status: "error",
        });
      }
      if (decision.action === "modify") {
        return handler({
          ...request,
          toolCall: { ...request.toolCall, args: decision.args },
        });
      }
      return handler(request);
    },
  });
}
