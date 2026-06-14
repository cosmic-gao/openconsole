import { voiceAgent } from "@/lib/voice/agent";
import { voiceConfig } from "@/lib/voice/config";

export const maxDuration = 60;

// OpenAI 兼容 think 端点：Deepgram Voice Agent 云端回调它取回复。
// 入参是 OpenAI chat.completions 形态，出参是 SSE chunk 流。
function lastUser(messages: Array<{ role?: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const c = messages[i]?.content;
    if (typeof c === "string") return c.trim();
    if (Array.isArray(c)) {
      return c
        .map((p) =>
          typeof p === "string" ? p : String((p as { text?: string })?.text ?? ""),
        )
        .join("")
        .trim();
    }
  }
  return "";
}

export async function POST(req: Request) {
  if (
    voiceConfig.thinkToken &&
    req.headers.get("authorization") !== `Bearer ${voiceConfig.thinkToken}`
  ) {
    return new Response("unauthorized", { status: 401 });
  }

  const sessionId = req.headers.get("x-session-id") ?? "default";
  const body = (await req.json().catch(() => ({}))) as {
    messages?: Array<{ role?: string; content?: unknown }>;
    model?: string;
  };
  const text = lastUser(body.messages ?? []);
  const id = `chatcmpl-${sessionId}`;
  const model = body.model ?? "opencode-voice";
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (delta: object, finish: string | null = null): void => {
        controller.enqueue(
          enc.encode(
            `data: ${JSON.stringify({
              id,
              object: "chat.completion.chunk",
              model,
              choices: [{ index: 0, delta, finish_reason: finish }],
            })}\n\n`,
          ),
        );
      };
      send({ role: "assistant" });
      try {
        for await (const piece of voiceAgent.stream(sessionId, text, req.signal)) {
          send({ content: piece });
        }
      } catch (err) {
        if (!req.signal.aborted) console.error(err);
      }
      send({}, "stop");
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
    cancel() {
      // Deepgram 断开（打断/超时）→ 中止 opencode 生成。
      void voiceAgent.abort(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
