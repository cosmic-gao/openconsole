/**
 * 统一事件层。把 deepagents/LangGraph 的流式输出归一化为一个面向调用方
 * （CLI / SSE / 可观测）的 {@link Event} 联合，让 UI 渲染与 telemetry 共用同一套模型。
 *
 * 两个生产者：
 *  - {@link toEvents}（流式）：消费 `graph.streamEvents(input, { version: "v3" })` 的投影；
 *  - `observe` 中间件（见 ./middleware）：在工具/agent 生命周期里产出同构 {@link Event}。
 *
 * 设计：贴合底座、不造轮子——v3 投影已把 token/think/tool/subagent/usage 结构化，
 * 归一化只是字段搬运；v2 裸事件归一化（{@link fromRaw}）作为可插拔兜底。
 */

/** 一次运行的 token 用量（聚合自各条消息的 usage）。 */
export interface Usage {
  input: number;
  output: number;
  total: number;
}

/**
 * 归一化后的统一事件。`type` 为判别字段。
 *
 * `tool_end.data` 即工具的结构化 artifact（来自 {@link Tool.define} 的 `data`，不进模型上下文）；
 * `tool_end.durationMs` 由 `observe` 中间件填充，`toEvents` 流式路径不填。
 */
export type Event =
  /** 模型增量文本（一个 token / 一段 delta）。 */
  | { type: "token"; text: string; node?: string }
  /** 思考：来自模型 reasoning 增量，或 `think` 工具的内容。 */
  | { type: "think"; text: string }
  /** 工具开始：`id` 关联同一次调用的 `tool_end`。 */
  | { type: "tool_start"; id: string; name: string; input: unknown }
  /** 工具结束：`data` = 结构化 artifact；`durationMs` 见类型说明。 */
  | {
      type: "tool_end";
      id: string;
      name: string;
      ok: boolean;
      content: string;
      data?: Record<string, unknown>;
      error?: string;
      durationMs?: number;
    }
  /** 子 agent：`events` 是该子 agent 的嵌套归一化事件流（递归同构）。 */
  | { type: "subagent"; name: string; events: AsyncIterable<Event> }
  /** 运行级错误（含 abort）。 */
  | { type: "error"; message: string; code?: string }
  /** 完成：携带最终文本与 usage。 */
  | { type: "done"; text: string; usage?: Usage };

/** 事件汇聚点：实现方决定落到 langsmith / 日志 / 自定义。 */
export interface EventSink {
  emit(event: Event): void | Promise<void>;
}

/** {@link toEvents} 选项。 */
export interface ToEventsOptions {
  /** 是否把子 agent 展开为嵌套 `subagent` 事件。默认 true。 */
  subagents?: boolean;
}

// ——————————————————————————————————————————————————————————————
// v3 投影的结构化最小接口（只声明我们消费的字段）。
// 不 import deepagents 内部类型：① 避免依赖未导出的具体类；② 便于用 fake 驱动单测。
// deepagents 的真实投影（ChatModelStream / ToolCallStream / SubagentRunStream）结构兼容这些接口。
// ——————————————————————————————————————————————————————————————

/** 一条消息流：text/reasoning 是增量异步流，usage 是该消息最终用量。 */
export interface MessageStream {
  text: AsyncIterable<string>;
  reasoning?: AsyncIterable<string> | undefined;
  usage?: PromiseLike<UsageLike | undefined> | undefined;
  node?: string | undefined;
}

/** 一次工具调用流：start 即可得 name/callId/input，结果经 Promise 解析。 */
export interface ToolCallStream {
  name: string;
  callId: string;
  input: unknown;
  output: Promise<unknown>;
  status?: Promise<string> | undefined;
  error?: Promise<string | undefined> | undefined;
}

/** v3 运行流投影（`run.messages` / `run.toolCalls` / `run.subagents` / `run.output`）。 */
export interface RunStream {
  messages?: AsyncIterable<MessageStream> | undefined;
  toolCalls?: AsyncIterable<ToolCallStream> | undefined;
  subagents?: AsyncIterable<RunStream & { name: string }> | undefined;
  output?: PromiseLike<unknown> | undefined;
}

/** LangChain usage metadata 的最小形状。 */
interface UsageLike {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
}

// —————————————————————————— 内部 helper ——————————————————————————

/**
 * 单消费者异步通道，带**背压**：push 入队；当 buffer 超过 highWaterMark 时 push 返回一个
 * Promise，待消费方取走、水位回落后才 resolve——让生产者在下游消费不及时自然减速，避免高
 * 吞吐（大量 token / 工具事件）下事件在内存里无界堆积。close 收尾并释放所有等待者。
 */
class Channel<T> {
  private readonly buffer: T[] = [];
  private resolve: ((r: IteratorResult<T>) => void) | null = null;
  private done = false;
  /** 因背压而等待水位回落的生产者的 resolver 队列。 */
  private readonly drains: (() => void)[] = [];

  constructor(private readonly highWaterMark = 256) {}

  /** 入队。直接交付给在等的消费者时无背压；入 buffer 且达到水位线则返回待 drain 的 Promise。 */
  push(value: T): void | Promise<void> {
    if (this.done) return;
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value, done: false });
      return;
    }
    this.buffer.push(value);
    if (this.buffer.length >= this.highWaterMark) {
      return new Promise<void>((res) => this.drains.push(res));
    }
  }

  close(): void {
    this.done = true;
    // 释放所有因背压而等待的生产者，避免通道关闭后它们永久挂起
    for (const drain of this.drains.splice(0)) drain();
    if (this.resolve) {
      const r = this.resolve;
      this.resolve = null;
      r({ value: undefined as never, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      if (this.buffer.length > 0) {
        const value = this.buffer.shift() as T;
        // 取走一个后水位回落到线下，放行一个等待的生产者
        if (this.buffer.length < this.highWaterMark && this.drains.length > 0) {
          (this.drains.shift() as () => void)();
        }
        yield value;
        continue;
      }
      if (this.done) return;
      const next = await new Promise<IteratorResult<T>>((res) => {
        this.resolve = res;
      });
      if (next.done) return;
      yield next.value;
    }
  }
}

/** 从工具返回值（多为 ToolMessage）里取可读文本，防御任意形状。 */
function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o["text"] === "string") return o["text"];
    if (typeof o["content"] === "string") return o["content"];
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return value === undefined ? "" : String(value);
}

/** 从工具返回值里多路 fallback 读取结构化 artifact（即 Tool.define 写入的 data）。 */
function readArtifact(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const o = value as Record<string, unknown>;
  const lc = o["lc_kwargs"] as Record<string, unknown> | undefined;
  const a = o["artifact"] ?? lc?.["artifact"];
  return a && typeof a === "object" ? (a as Record<string, unknown>) : undefined;
}

/** 聚合多条消息的 usage。total 缺失时回退为 input+output。 */
function sumUsage(parts: UsageLike[]): Usage {
  let input = 0;
  let output = 0;
  let total = 0;
  for (const p of parts) {
    input += p.input_tokens ?? 0;
    output += p.output_tokens ?? 0;
    total += p.total_tokens ?? 0;
  }
  if (total === 0) total = input + output;
  return { input, output, total };
}

/** 取图最终 state 末条消息的文本（与 agent.ts 的 lastText 同义）。 */
function lastTextOf(state: unknown): string {
  const messages = (state as { messages?: Array<{ text?: unknown }> } | undefined)
    ?.messages;
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  return typeof last?.text === "string" ? last.text : "";
}

/**
 * 把 v3 流投影归一化为 {@link Event} 流（主路径）。
 *
 * 并发消费 messages / toolCalls / subagents 三路并交错产出，故 token 与 tool 事件
 * 按到达顺序穿插（对 UI 足够；需严格时间序请用 {@link fromRaw} 的 v2 路径）。
 */
async function* toEvents(
  run: RunStream,
  options: ToEventsOptions = {},
): AsyncIterable<Event> {
  const channel = new Channel<Event>();
  const usageParts: UsageLike[] = [];
  const pumps: Promise<void>[] = [];

  // 一路：模型消息 —— 每条消息再并发消费其 text / reasoning / usage
  if (run.messages) {
    const messages = run.messages;
    pumps.push(
      (async () => {
        for await (const msg of messages) {
          const inner: Promise<void>[] = [];
          inner.push(
            (async () => {
              for await (const t of msg.text) {
                await channel.push(
                  msg.node !== undefined
                    ? { type: "token", text: t, node: msg.node }
                    : { type: "token", text: t },
                );
              }
            })(),
          );
          if (msg.reasoning) {
            const reasoning = msg.reasoning;
            inner.push(
              (async () => {
                for await (const r of reasoning) {
                  await channel.push({ type: "think", text: r });
                }
              })(),
            );
          }
          if (msg.usage) {
            const usage = msg.usage;
            inner.push(
              (async () => {
                try {
                  const u = await usage;
                  if (u) usageParts.push(u);
                } catch {
                  /* usage 解析失败：忽略，不影响事件流 */
                }
              })(),
            );
          }
          await Promise.all(inner);
        }
      })(),
    );
  }

  // 一路：工具调用 —— start 立即产出，结果异步解析后产出 end（不阻塞下一个 start）
  if (run.toolCalls) {
    const toolCalls = run.toolCalls;
    pumps.push(
      (async () => {
        const ends: Promise<void>[] = [];
        for await (const call of toolCalls) {
          await channel.push({
            type: "tool_start",
            id: call.callId,
            name: call.name,
            input: call.input,
          });
          ends.push(
            (async () => {
              let out: unknown;
              let error: string | undefined;
              try {
                out = await call.output;
              } catch (e) {
                error = e instanceof Error ? e.message : String(e);
              }
              let status = "finished";
              try {
                if (call.status) status = await call.status;
              } catch {
                /* status 解析失败：按已知信息判定 */
              }
              try {
                if (call.error) error = (await call.error) ?? error;
              } catch {
                /* error 解析失败：保留已捕获的 */
              }
              const data = readArtifact(out);
              const ok = status !== "error" && error === undefined;
              const end: Event = {
                type: "tool_end",
                id: call.callId,
                name: call.name,
                ok,
                content: textOf(out),
                ...(data !== undefined ? { data } : {}),
                ...(error !== undefined ? { error } : {}),
              };
              await channel.push(end);
              // `think` 是普通工具：除 tool_end 外，额外发一条 think 便于 UI 区分
              if (call.name === "think") {
                await channel.push({ type: "think", text: textOf(out) });
              }
            })(),
          );
        }
        await Promise.all(ends);
      })(),
    );
  }

  // 一路：子 agent —— 递归归一化，嵌套流交给调用方消费
  if (run.subagents && options.subagents !== false) {
    const subagents = run.subagents;
    pumps.push(
      (async () => {
        for await (const sub of subagents) {
          await channel.push({
            type: "subagent",
            name: sub.name,
            events: toEvents(sub, options),
          });
        }
      })(),
    );
  }

  // 所有 pump 完成后：取最终文本 + usage，产出 done，再关闭通道
  const finished = Promise.all(pumps)
    .then(async () => {
      let text = "";
      if (run.output) {
        try {
          text = lastTextOf(await run.output);
        } catch (e) {
          await channel.push({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        }
      }
      await channel.push(
        usageParts.length > 0
          ? { type: "done", text, usage: sumUsage(usageParts) }
          : { type: "done", text },
      );
    })
    .catch(async (e: unknown) => {
      await channel.push({
        type: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    })
    .finally(() => channel.close());

  yield* channel;
  await finished;
}

// ——————————————————————————————————————————————————————————————
// v2 兜底：裸 streamEvents(version:"v2") 事件 → Event（可插拔点）。
// 子 agent 不做嵌套（拍平），仅作为 v3 不可用时的退路。
// ——————————————————————————————————————————————————————————————

/** v2 裸事件的最小结构。 */
export interface RawEvent {
  event: string;
  name?: string;
  run_id?: string;
  data?: { chunk?: unknown; input?: unknown; output?: unknown };
  metadata?: Record<string, unknown>;
}

/** 把 v2 裸 `streamEvents` 流归一化为 {@link Event} 流（兜底路径）。 */
async function* fromRaw(
  source: AsyncIterable<RawEvent>,
): AsyncIterable<Event> {
  const usageParts: UsageLike[] = [];
  let lastText = "";

  for await (const ev of source) {
    switch (ev.event) {
      case "on_chat_model_stream": {
        const chunk = ev.data?.chunk as
          | { text?: unknown; usage_metadata?: UsageLike }
          | undefined;
        const text = typeof chunk?.text === "string" ? chunk.text : "";
        if (text) {
          const node = ev.metadata?.["langgraph_node"];
          yield typeof node === "string"
            ? { type: "token", text, node }
            : { type: "token", text };
        }
        if (chunk?.usage_metadata) usageParts.push(chunk.usage_metadata);
        break;
      }
      case "on_tool_start": {
        yield {
          type: "tool_start",
          id: ev.run_id ?? "",
          name: ev.name ?? "",
          input: ev.data?.input,
        };
        break;
      }
      case "on_tool_end": {
        const out = ev.data?.output;
        const data = readArtifact(out);
        const content = textOf(out);
        lastText = content || lastText;
        const status = (out as { status?: unknown } | undefined)?.status;
        yield {
          type: "tool_end",
          id: ev.run_id ?? "",
          name: ev.name ?? "",
          ok: status !== "error",
          content,
          ...(data !== undefined ? { data } : {}),
        };
        if (ev.name === "think") yield { type: "think", text: content };
        break;
      }
      default:
        break;
    }
  }

  yield usageParts.length > 0
    ? { type: "done", text: lastText, usage: sumUsage(usageParts) }
    : { type: "done", text: lastText };
}

// ——————————————————————————————————————————————————————————————
// 对外命名空间：单词优先（events.of / events.raw / events.console）。
// 内部实现函数保留描述性名（toEvents / fromRaw），仅经下面的 events 对象暴露。
// ——————————————————————————————————————————————————————————————

/** 缺省事件 sink：开发态把工具/错误事件简洁打到 stderr（{@link observe} 中间件的默认）。 */
const consoleSink: EventSink = {
  emit(event: Event): void {
    if (event.type === "tool_start") {
      console.error(`[agent] → ${event.name}`, event.input);
    } else if (event.type === "tool_end") {
      const ms = event.durationMs !== undefined ? ` ${event.durationMs}ms` : "";
      console.error(`[agent] ← ${event.name} ${event.ok ? "ok" : "ERR"}${ms}`);
    } else if (event.type === "error") {
      console.error(`[agent] ! ${event.message}`);
    }
  },
};

/**
 * 事件工具集（单词优先命名空间）：
 *  - {@link events.of}：把 v3 流投影归一化为 {@link Event} 流（主路径）；
 *  - {@link events.raw}：把 v2 裸 streamEvents 流归一化为 Event 流（兜底）；
 *  - {@link events.console}：缺省 sink，把事件打到 stderr。
 */
export const events = {
  of: toEvents,
  raw: fromRaw,
  console: consoleSink,
};
