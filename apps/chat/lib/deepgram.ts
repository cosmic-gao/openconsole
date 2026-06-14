import { createClient } from "@deepgram/sdk";

let client: ReturnType<typeof createClient> | undefined;

export function deepgram() {
  if (!client) {
    const key = process.env.DEEPGRAM_API_KEY;
    if (!key) throw new Error("DEEPGRAM_API_KEY 未配置");
    client = createClient(key);
  }
  return client;
}
