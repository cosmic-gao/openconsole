/**
 * 会话层。对已编译图（{@link BuiltAgent}）的轻量封装：固定一个 thread_id 做多轮，
 * 产出标准化 {@link Event} 流，支持 {@link Session.resume}/{@link Session.fork} 与取消。
 *
 * 设计：不另造状态机——多轮/持久化/恢复全部复用 LangGraph 的 checkpointer + thread_id，
 * 流式复用 `graph.streamEvents(input, { version: "v3" })`，归一化交给 {@link toEvents}。
 *
 * 持久化要点：**checkpointer 在编译期烘焙进 agent**（`Agent.create(name, { checkpointer })`）。
 * 未带 checkpointer 时，单 Session 内多轮仍可用（同进程内存），但跨 Session 的 resume/fork 不持久。
 */
import { randomUUID } from "node:crypto";
import type { BaseMessage } from "@langchain/core/messages";

import { events, type Event, type RunStream } from "./event";

/** 一次对话输入：纯文本，或完整 messages 形态。 */
export type Input =
  | string
  | { messages: Array<{ role: string; content: string }> };

/** {@link Agent.session} 的选项。 */
export interface SessionOptions {
  /** 会话线程 id；默认自动生成。同一 id 续接同一条历史。 */
  thread?: string;
  /** 会话级默认取消信号（可被单轮 {@link RunOptions.signal} 覆盖）。 */
  signal?: AbortSignal;
  /** 递归上限，透传 LangGraph。 */
  recursionLimit?: number;
}

/** 单轮 {@link Session.run}/{@link Session.stream} 的选项。 */
export interface RunOptions {
  /** 覆盖会话级 signal 的单轮取消信号。 */
  signal?: AbortSignal;
}

/** Session 需要从已编译图用到的最小方法面（也便于用 fake graph 单测）。 */
export interface RunnableGraph {
  invoke(input: unknown, config?: unknown): Promise<unknown>;
  streamEvents(input: unknown, options: unknown): Promise<RunStream>;
  getState(config: unknown): Promise<{ values?: { messages?: BaseMessage[] } }>;
  updateState(config: unknown, values: unknown): Promise<unknown>;
}

/** 把 {@link Input} 归一为图输入。 */
function toGraphInput(input: Input): { messages: unknown } {
  return typeof input === "string"
    ? { messages: [{ role: "user", content: input }] }
    : { messages: input.messages };
}

/** 取图结果 state 末条消息的文本（与 agent.ts 的 lastText 同义；本地定义以避免循环导入）。 */
function lastText(state: unknown): string {
  const messages = (state as { messages?: BaseMessage[] } | undefined)?.messages;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  return typeof last?.text === "string" ? last.text : "";
}

/**
 * 一个绑定到固定 thread 的会话。多轮共享历史；`run` 取最终文本，`stream` 产出标准化事件流。
 */
export class Session {
  private constructor(
    private readonly graph: RunnableGraph,
    private readonly thread: string,
    private readonly signal: AbortSignal | undefined,
    private readonly recursionLimit: number | undefined,
  ) {}

  /** 内部入口：由 {@link Agent.session} 调用，注入已编译图。 */
  static open(graph: RunnableGraph, options: SessionOptions = {}): Session {
    return new Session(
      graph,
      options.thread ?? randomUUID(),
      options.signal,
      options.recursionLimit,
    );
  }

  /** 当前会话线程 id。 */
  get id(): string {
    return this.thread;
  }

  /** 构造一次调用的 LangGraph config（thread_id + 「有值才展开」的 signal/recursionLimit）。 */
  private config(signal?: AbortSignal): Record<string, unknown> {
    const sig = signal ?? this.signal;
    return {
      configurable: { thread_id: this.thread },
      ...(sig !== undefined ? { signal: sig } : {}),
      ...(this.recursionLimit !== undefined
        ? { recursionLimit: this.recursionLimit }
        : {}),
    };
  }

  /** 执行一轮对话，返回最终助手文本（多轮：带 thread_id 续接历史）。 */
  async run(input: Input, options: RunOptions = {}): Promise<string> {
    const state = await this.graph.invoke(
      toGraphInput(input),
      this.config(options.signal),
    );
    return lastText(state);
  }

  /** 以标准化 {@link Event} 流执行一轮对话（token / tool / subagent / done…）。 */
  stream(input: Input, options: RunOptions = {}): AsyncIterable<Event> {
    const config = this.config(options.signal);
    const graph = this.graph;
    return (async function* () {
      const run = await graph.streamEvents(toGraphInput(input), {
        version: "v3",
        ...config,
      });
      yield* events.of(run);
    })();
  }

  /** 切到另一个 thread（复用同一编译图），返回新的不可变 Session。 */
  resume(thread: string): Session {
    return new Session(this.graph, thread, this.signal, this.recursionLimit);
  }

  /**
   * 从当前 thread 的最新状态分叉出一个新 thread，返回分叉后的 Session。
   * 需要 agent 编译时带了 checkpointer，否则当前 thread 无持久状态、抛错指引。
   */
  async fork(): Promise<Session> {
    const snapshot = await this.graph.getState(this.config());
    const values = snapshot?.values;
    if (!values || !values.messages) {
      throw new Error(
        "fork() requires a checkpointer: the current thread has no persisted state. Create the agent with { checkpointer: new MemorySaver() } (or true).",
      );
    }
    const thread = randomUUID();
    await this.graph.updateState({ configurable: { thread_id: thread } }, values);
    return new Session(this.graph, thread, this.signal, this.recursionLimit);
  }

  /** 当前 thread 的消息历史（需 checkpointer 才非空）。 */
  async history(): Promise<BaseMessage[]> {
    const snapshot = await this.graph.getState(this.config());
    return snapshot?.values?.messages ?? [];
  }
}
