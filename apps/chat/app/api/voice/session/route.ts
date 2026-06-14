import { deepgram } from "@/lib/deepgram";
import { voiceAgent } from "@/lib/voice/agent";
import { thinkEndpoint, voiceConfig } from "@/lib/voice/config";
import { voiceSettings } from "@/lib/voice/settings";

export const maxDuration = 30;

// 实时通话引导：建 opencode 会话 + 发 Deepgram 临时令牌（浏览器直连 Voice Agent）
// + 下发 Settings（含 think 回调地址）。浏览器据此用 @deepgram/sdk 建立 WS。
export async function POST(req: Request) {
  if (!thinkEndpoint()) {
    return Response.json(
      {
        error:
          "VOICE_THINK_PUBLIC_URL 未配置：Deepgram 云端需公网回调 think 端点。本地用隧道暴露，如 `ngrok http 3000`，把外网地址填进 .env。",
      },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { context?: string };
  const sessionId = await voiceAgent.create(body.context);

  // 临时令牌（默认 60s TTL）：避免把长期 API key 暴露到浏览器。
  const { result, error } = await deepgram().auth.grantToken({ ttl_seconds: 60 });
  if (error || !result?.access_token) {
    return Response.json(
      { error: error?.message ?? "Deepgram grantToken 失败" },
      { status: 500 },
    );
  }

  return Response.json({
    sessionId,
    token: result.access_token,
    expiresIn: result.expires_in,
    settings: voiceSettings(sessionId),
    output: { sampleRate: voiceConfig.outputRate },
  });
}
