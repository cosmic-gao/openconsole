import type { AgentLiveSchema } from "@deepgram/sdk";

import { thinkEndpoint, voiceConfig } from "./config";

// Deepgram Voice Agent 的 Settings（WS 建立后、发任何音频前下发一条）。
// 关键：think.endpoint.url 指向本应用 /api/voice/think → 再转 opencode；
// 故真正的 model/prompt 由 opencode 的 voice agent 决定（见 opencode.json）。
export function voiceSettings(sessionId: string): AgentLiveSchema {
  return {
    audio: {
      input: { encoding: "linear16", sample_rate: voiceConfig.inputRate },
      output: {
        encoding: "linear16",
        sample_rate: voiceConfig.outputRate,
        container: "none",
      },
    },
    agent: {
      language: voiceConfig.language,
      listen: { provider: { type: "deepgram", model: voiceConfig.listenModel } },
      think: {
        provider: { type: "open_ai", model: "opencode-voice" },
        endpoint: {
          url: thinkEndpoint(),
          headers: {
            "x-session-id": sessionId,
            ...(voiceConfig.thinkToken
              ? { authorization: `Bearer ${voiceConfig.thinkToken}` }
              : {}),
          },
        },
        functions: [],
      },
      speak: { provider: { type: "deepgram", model: voiceConfig.speakModel } },
      greeting: voiceConfig.greeting,
    },
  };
}
