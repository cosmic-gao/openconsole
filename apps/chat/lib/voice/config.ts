// 实时语音（Deepgram Voice Agent + opencode think）配置，全部 env 可覆盖。
// 默认英文：Deepgram Aura-2 英文音色开箱即用；中文 TTS 需换 speak provider。
export const voiceConfig = {
  opencodeBaseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
  // Deepgram 云端回调 think 端点的公网根地址（须含协议，不含尾斜杠）。
  // 本地调试：ngrok http 3000，把外网地址填到 VOICE_THINK_PUBLIC_URL。
  thinkPublicUrl: (process.env.VOICE_THINK_PUBLIC_URL ?? "").replace(/\/+$/, ""),
  // think 端点的共享密钥（可选）：Deepgram 在 Settings.headers 里带上，端点校验。
  thinkToken: process.env.VOICE_THINK_TOKEN ?? "",
  // opencode 侧 agent 名（见 opencode.json 的 voice agent：口语化、禁工具）。
  agent: process.env.VOICE_AGENT ?? "voice",
  model: {
    fast: process.env.VOICE_MODEL_FAST ?? "openai/gpt-4o-mini",
    smart: process.env.VOICE_MODEL_SMART ?? "openai/gpt-4o",
    after: Number(process.env.VOICE_MODEL_SMART_AFTER ?? 3),
  },
  language: process.env.VOICE_LANGUAGE ?? "en",
  listenModel: process.env.VOICE_STT_MODEL ?? "nova-3",
  speakModel: process.env.VOICE_TTS_MODEL ?? "aura-2-thalia-en",
  greeting:
    process.env.VOICE_GREETING ??
    "Hello, this is technical support. How can I help you today?",
  // 上行用户音频 / 下行 TTS 音频采样率（linear16）。
  inputRate: 16000,
  outputRate: 24000,
} as const;

export function thinkEndpoint(): string {
  return voiceConfig.thinkPublicUrl
    ? `${voiceConfig.thinkPublicUrl}/api/voice/think`
    : "";
}
