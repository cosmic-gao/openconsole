import { config } from "./config";

export function settings(call: string): Record<string, unknown> {
  return {
    type: "Settings",
    audio: {
      input: { encoding: "linear16", sample_rate: 16000 },
      output: { encoding: "linear16", sample_rate: 24000 },
    },
    agent: {
      language: "en",
      listen: { provider: { type: "deepgram", model: "nova-3" } },
      think: {
        provider: { type: "open_ai", model: "opencode-voice" },
        endpoint: {
          url: config.think,
          headers: {
            "x-session-id": call,
            ...(config.token ? { authorization: `Bearer ${config.token}` } : {}),
          },
        },
        functions: [],
      },
      speak: { provider: { type: "deepgram", model: "aura-2-thalia-en" } },
      greeting: "您好，这里是技术支持，请问有什么可以帮您？",
    },
    flags: { history: false },
  };
}
