import { extractReasoningMiddleware, streamText, wrapLanguageModel } from "ai";
import { createOpencode } from "ai-sdk-provider-opencode-sdk";
import { createOpencodeClient } from "@opencode-ai/sdk";

import { config } from "./config";

const script =
  "<think>internal reasoning, should not be spoken</think>This is a mock reply for the streaming protocol check.";

export interface Options {
  url: string;
  mock?: boolean;
}

export class Agent {
  private readonly client: ReturnType<typeof createOpencodeClient>;
  private readonly provider: ReturnType<typeof createOpencode>;
  private readonly mock: boolean;
  private readonly sessions = new Map<string, string>();
  private readonly turns = new Map<string, number>();

  constructor(o: Options) {
    this.mock = Boolean(o.mock);
    this.client = createOpencodeClient({ baseUrl: o.url });
    this.provider = createOpencode({ baseUrl: o.url, autoStartServer: false });
  }

  async session(call: string, context?: string): Promise<string> {
    if (this.mock) return call;
    const found = this.sessions.get(call);
    if (found) return found;
    const res = await this.client.session.create({ body: {} });
    const id =
      (res as { data?: { id?: string }; id?: string }).data?.id ??
      (res as { id?: string }).id;
    if (!id) throw new Error("session.create returned no id");
    this.sessions.set(call, id);
    this.turns.set(call, 0);
    if (context) await this.inject(call, context);
    return id;
  }

  async *stream(
    call: string,
    text: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const base = this.mock ? await this.fake() : await this.real(call);
    const model = wrapLanguageModel({
      model: base,
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
    const result = streamText({
      model,
      messages: [{ role: "user", content: text }],
      abortSignal: signal,
    });
    for await (const delta of result.textStream) yield delta;
  }

  private async real(call: string) {
    const session = await this.session(call);
    const turn = this.turns.get(call) ?? 0;
    this.turns.set(call, turn + 1);
    const id = turn < config.model.after ? config.model.fast : config.model.smart;
    return this.provider(id, { sessionId: session, agent: "voice" });
  }

  private async fake() {
    const { MockLanguageModelV2 } = await import("ai/test");
    const parts = [
      { type: "text-start" as const, id: "0" },
      ...[...script].map((c) => ({ type: "text-delta" as const, id: "0", delta: c })),
      { type: "text-end" as const, id: "0" },
      {
        type: "finish" as const,
        finishReason: "stop" as const,
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      },
    ];
    return new MockLanguageModelV2({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
      }),
    });
  }

  async abort(call: string): Promise<void> {
    if (this.mock) return;
    const id = this.sessions.get(call);
    if (id) await this.client.session.abort({ path: { id } }).catch(() => {});
  }

  async inject(call: string, note: string): Promise<void> {
    if (this.mock) return;
    const id = this.sessions.get(call);
    if (id)
      await this.client.session
        .prompt({
          path: { id },
          body: { noReply: true, parts: [{ type: "text", text: note }] },
        })
        .catch(() => {});
  }

  end(call: string): void {
    void this.abort(call);
    this.sessions.delete(call);
    this.turns.delete(call);
  }
}
