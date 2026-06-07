import { reactive, ref } from "vue";

import { makeThinkFilter, type Usage, type WireEvent } from "@/lib/events";

/** 一条工具调用在 UI 上的状态。 */
export interface ToolCall {
  id: string;
  name: string;
  status: "running" | "ok" | "error";
}

/** 一条聊天消息（用户或助手）。 */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  /** 可见正文（已剥离 <think>）。 */
  answer: string;
  /** 推理内容（暗色、可折叠）。 */
  reasoning: string;
  /** 本轮工具调用。 */
  tools: ToolCall[];
  status: "streaming" | "done" | "error";
  /** 出错信息。 */
  error?: string;
  /** 兜底提示：本轮模型只思考、未作答时显示。 */
  note?: string;
  /** token 用量。 */
  usage?: Usage;
}

let seq = 0;
const newId = (): string => `m${++seq}_${Math.floor(performance.now())}`;
const newThread = (): string => `web-${Math.floor(performance.now())}-${++seq}`;

/**
 * 聊天会话状态机。POST /api/chat 拿到 SSE 流，按 {@link WireEvent} 增量更新当前助手消息：
 * token 经 think 拆分器分流到 answer/reasoning，工具调用渲染为 chip，done 时对「只思考无正文」兜底。
 */
export function useChat() {
  const messages = reactive<ChatMessage[]>([]);
  const sending = ref(false);
  const thread = ref(newThread());
  let abort: AbortController | undefined;

  /** 解析 SSE 文本块（可能含多条 `data:` 行）为一个 payload 字符串。 */
  function payloadOf(block: string): string {
    return block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("\n");
  }

  function apply(ev: WireEvent, msg: ChatMessage, filter: ReturnType<typeof makeThinkFilter>): void {
    switch (ev.type) {
      case "token": {
        const { answer, reasoning } = filter.push(ev.text);
        if (reasoning) msg.reasoning += reasoning;
        if (answer) msg.answer += answer;
        break;
      }
      case "think":
        // 独立 reasoning 流（部分模型走这里）
        msg.reasoning += ev.text;
        break;
      case "tool_start":
        msg.tools.push({ id: ev.id, name: ev.name, status: "running" });
        break;
      case "tool_end": {
        const t = msg.tools.find((x) => x.id === ev.id);
        if (t) t.status = ev.ok ? "ok" : "error";
        break;
      }
      case "error":
        msg.status = "error";
        msg.error = ev.message;
        break;
      case "done": {
        const { answer, reasoning } = filter.flush();
        if (reasoning) msg.reasoning += reasoning;
        if (answer) msg.answer += answer;
        if (ev.usage) msg.usage = ev.usage;
        // 兜底：既无正文也无工具（模型只输出 <think> 就收尾）——优先用 done.text 恢复正文，
        // 实在没有才给提示，避免「回复内容丢失」的观感。
        if (!msg.answer.trim() && msg.tools.length === 0) {
          const ft = (ev.text ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
          if (ft) msg.answer = ft;
          else msg.note = "本轮模型只思考、未给出回答；可重述需求或再发一次。";
        }
        break;
      }
      default:
        break;
    }
  }

  async function send(text: string): Promise<void> {
    const input = text.trim();
    if (!input || sending.value) return;
    sending.value = true;

    messages.push({
      id: newId(),
      role: "user",
      answer: input,
      reasoning: "",
      tools: [],
      status: "done",
    });
    messages.push({
      id: newId(),
      role: "assistant",
      answer: "",
      reasoning: "",
      tools: [],
      status: "streaming",
    });
    const msg = messages[messages.length - 1] as ChatMessage;
    const filter = makeThinkFilter();
    abort = new AbortController();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, thread: thread.value }),
        signal: abort.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const payload = payloadOf(block);
          if (!payload || payload === "[DONE]") continue;
          let ev: WireEvent;
          try {
            ev = JSON.parse(payload) as WireEvent;
          } catch {
            continue;
          }
          apply(ev, msg, filter);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        msg.status = "error";
        msg.error = e instanceof Error ? e.message : String(e);
      } else {
        msg.note = "（已中断）";
      }
    } finally {
      if (msg.status === "streaming") msg.status = "done";
      sending.value = false;
      abort = undefined;
    }
  }

  /** 中断当前生成。 */
  function stop(): void {
    abort?.abort();
  }

  /** 开新会话：换 thread、清空消息。 */
  function reset(): void {
    stop();
    messages.splice(0, messages.length);
    thread.value = newThread();
  }

  return { messages, sending, thread, send, stop, reset };
}
