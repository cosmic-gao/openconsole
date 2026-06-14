import { voiceAgent } from "@/lib/voice/agent";

// 对账：把「实际说出口」的文本写回 opencode 历史，让大脑与 TTS 真实输出对齐
// （被打断时 TTS 可能只读了一部分）。可选，非必需。
export async function POST(req: Request) {
  const { sessionId, text } = (await req.json().catch(() => ({}))) as {
    sessionId?: string;
    text?: string;
  };
  if (!sessionId) return Response.json({ error: "missing sessionId" }, { status: 400 });
  await voiceAgent.inject(sessionId, `[实际说出口：${text ?? ""}]`);
  return Response.json({ ok: true });
}
