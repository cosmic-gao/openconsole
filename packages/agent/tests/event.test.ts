import { describe, expect, it } from "vitest";

import { events, type Event, type RunStream } from "../src/event";

function stream<T>(...items: T[]): AsyncIterable<T> {
  async function* g(): AsyncIterable<T> {
    for (const it of items) yield it;
  }
  return g();
}

async function drain(src: AsyncIterable<Event>): Promise<Event[]> {
  const out: Event[] = [];
  for await (const ev of src) out.push(ev);
  return out;
}

describe("toEvents", () => {
  it("normalizes a v3 run into token + tool + done events", async () => {
    const run: RunStream = {
      messages: stream({
        text: stream("Hel", "lo"),
        usage: Promise.resolve({
          input_tokens: 3,
          output_tokens: 2,
          total_tokens: 5,
        }),
        node: "agent",
      }),
      toolCalls: stream({
        name: "web_search",
        callId: "c1",
        input: { query: "x" },
        output: Promise.resolve({ content: "result", artifact: { results: [] } }),
        status: Promise.resolve("finished"),
      }),
      output: Promise.resolve({ messages: [{ text: "Hello" }] }),
    };
    const out = await drain(events.of(run));
    const types = out.map((e) => e.type);
    expect(types).toContain("token");
    expect(types).toContain("tool_start");
    expect(types).toContain("tool_end");
    expect(types).toContain("done");

    const tokens = out
      .filter((e): e is Extract<Event, { type: "token" }> => e.type === "token")
      .map((e) => e.text)
      .join("");
    expect(tokens).toBe("Hello");

    const toolEnd = out.find(
      (e): e is Extract<Event, { type: "tool_end" }> => e.type === "tool_end",
    );
    expect(toolEnd?.ok).toBe(true);
    expect(toolEnd?.data).toEqual({ results: [] }); // artifact 透出为 data

    const done = out.find(
      (e): e is Extract<Event, { type: "done" }> => e.type === "done",
    );
    expect(done?.text).toBe("Hello");
    expect(done?.usage).toEqual({ input: 3, output: 2, total: 5 });
  });

  it("preserves all events under backpressure (exceeds highWaterMark)", async () => {
    // 制造远超默认水位线(256)的 token 数，验证背压下不丢事件、顺序保持
    const n = 1000;
    const chunks = Array.from({ length: n }, (_, i) => `${i},`);
    const run: RunStream = {
      messages: stream({ text: stream(...chunks) }),
      output: Promise.resolve({ messages: [{ text: "end" }] }),
    };
    const out = await drain(events.of(run));
    const tokens = out.filter(
      (e): e is Extract<Event, { type: "token" }> => e.type === "token",
    );
    expect(tokens).toHaveLength(n);
    expect(tokens[0]?.text).toBe("0,");
    expect(tokens[n - 1]?.text).toBe(`${n - 1},`);
  });
});

describe("fromRaw", () => {
  it("normalizes v2 raw events into an Event stream", async () => {
    const raw = stream(
      {
        event: "on_chat_model_stream",
        data: {
          chunk: {
            text: "Hi",
            usage_metadata: {
              input_tokens: 1,
              output_tokens: 1,
              total_tokens: 2,
            },
          },
        },
        metadata: { langgraph_node: "agent" },
      },
      {
        event: "on_tool_end",
        name: "web_search",
        run_id: "r1",
        data: { output: { content: "ok", status: "success" } },
      },
    );
    const out = await drain(events.raw(raw));
    expect(out.map((e) => e.type)).toEqual(
      expect.arrayContaining(["token", "tool_end", "done"]),
    );
  });
});
