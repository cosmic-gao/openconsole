import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import { Agent } from "./agent";
import { config } from "./config";

const agent = new Agent({ url: config.opencode, mock: config.mock });
const app = new Hono();

function lastUser(messages: Array<{ role?: string; content?: unknown }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const c = messages[i]?.content;
    if (typeof c === "string") return c.trim();
    if (Array.isArray(c)) {
      return c
        .map((p) => (typeof p === "string" ? p : String((p as { text?: string })?.text ?? "")))
        .join("")
        .trim();
    }
  }
  return "";
}

app.get("/health", (c) => c.json({ ok: true }));

app.post("/v1/chat/completions", async (c) => {
  if (config.token && c.req.header("authorization") !== `Bearer ${config.token}`) {
    return c.text("unauthorized", 401);
  }
  const call = c.req.header("x-session-id") ?? "default";
  const body = (await c.req.json().catch(() => ({}))) as {
    messages?: Array<{ role?: string; content?: unknown }>;
    model?: string;
  };
  const text = lastUser(body.messages ?? []);
  const id = `chatcmpl-${call}`;
  const model = body.model ?? "opencode-voice";

  c.header("x-accel-buffering", "no");
  return streamSSE(c, async (sse) => {
    const ac = new AbortController();
    sse.onAbort(() => {
      ac.abort();
      void agent.abort(call);
    });
    const send = (delta: object, finish: string | null = null): Promise<void> =>
      sse.writeSSE({
        data: JSON.stringify({
          id,
          object: "chat.completion.chunk",
          model,
          choices: [{ index: 0, delta, finish_reason: finish }],
        }),
      });
    await send({ role: "assistant" });
    try {
      for await (const piece of agent.stream(call, text, ac.signal)) await send({ content: piece });
    } catch (err) {
      if (!ac.signal.aborted) console.error(err);
    }
    await send({}, "stop");
    await sse.writeSSE({ data: "[DONE]" });
  });
});

app.post("/call", async (c) => {
  const { call, context } = (await c.req.json().catch(() => ({}))) as {
    call?: string;
    context?: string;
  };
  const id = call || `call-${Date.now()}`;
  await agent.session(id, context);
  return c.json({ call: id });
});

app.post("/reconcile", async (c) => {
  const { call, text } = (await c.req.json().catch(() => ({}))) as {
    call?: string;
    text?: string;
  };
  if (!call) return c.json({ error: "missing call" }, 400);
  await agent.inject(call, `[实际说出口：${text ?? ""}]`);
  return c.json({ ok: true });
});

serve({ fetch: app.fetch, port: config.port }, (i) =>
  console.log(`voice :${i.port} ${config.mock ? "mock" : config.opencode}`),
);
