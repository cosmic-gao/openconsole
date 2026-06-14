import { createOpencode } from "ai-sdk-provider-opencode-sdk";

export const opencode = createOpencode({
  baseUrl: process.env.OPENCODE_BASE_URL ?? "http://localhost:4096",
  autoStartServer: false,
});

export const model = process.env.CHAT_MODEL ?? "openai/gpt-4o-mini";
