import { extractReasoningMiddleware, streamText, wrapLanguageModel } from "ai";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { createOpencode } from "ai-sdk-provider-opencode-sdk";

import { voiceConfig } from "./config";

// opencode 作为「大脑」：管理会话、流式生成、剥离 <think>（M2 会把推理内联进
// content，TTS 必须只读出可朗读文本），并按轮次在 fast/smart 模型间切换。
class VoiceAgent {
  private readonly client = createOpencodeClient({
    baseUrl: voiceConfig.opencodeBaseUrl,
  });
  private readonly provider = createOpencode({
    baseUrl: voiceConfig.opencodeBaseUrl,
    autoStartServer: false,
  });
  // 会话轮次（决定 fast→smart 升档）。键即 opencode 会话 id。
  private readonly turns = new Map<string, number>();

  /** 新建 opencode 会话，返回其 id（直接作为 Deepgram think 的 x-session-id）。 */
  async create(context?: string): Promise<string> {
    const res = await this.client.session.create({ body: {} });
    const id =
      (res as { data?: { id?: string }; id?: string }).data?.id ??
      (res as { id?: string }).id;
    if (!id) throw new Error("session.create 未返回 id");
    this.turns.set(id, 0);
    if (context) await this.inject(id, context);
    return id;
  }

  /** 针对一句用户输入，流式产出回复文本片段（已剥离 <think>）。 */
  async *stream(
    sessionId: string,
    text: string,
    signal?: AbortSignal,
  ): AsyncIterable<string> {
    const turn = this.turns.get(sessionId) ?? 0;
    this.turns.set(sessionId, turn + 1);
    const modelId =
      turn < voiceConfig.model.after
        ? voiceConfig.model.fast
        : voiceConfig.model.smart;
    const model = wrapLanguageModel({
      model: this.provider(modelId, {
        sessionId,
        agent: voiceConfig.agent,
      }),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });
    const result = streamText({
      model,
      messages: [{ role: "user", content: text }],
      abortSignal: signal,
    });
    for await (const delta of result.textStream) yield delta;
  }

  /** 注入一条不触发回复的上下文/旁注，写入会话历史。 */
  async inject(sessionId: string, note: string): Promise<void> {
    await this.client.session
      .prompt({
        path: { id: sessionId },
        body: { noReply: true, parts: [{ type: "text", text: note }] },
      })
      .catch(() => {});
  }

  /** 打断：中止该会话正在进行的生成。 */
  async abort(sessionId: string): Promise<void> {
    await this.client.session.abort({ path: { id: sessionId } }).catch(() => {});
  }
}

// 单例：跨 Next.js 路由共享会话轮次表，并避免 dev 热重载重复实例化。
const slot = globalThis as unknown as { __voiceAgent?: VoiceAgent };
export const voiceAgent = (slot.__voiceAgent ??= new VoiceAgent());
