import "dotenv/config";

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const env = createEnv({
  server: {
    THINK_PORT: z.coerce.number().default(8788),
    THINK_TOKEN: z.string().default(""),
    OPENCODE_BASE_URL: z.string().default("http://localhost:4096"),
    DEEPGRAM_API_KEY: z.string().default(""),
    THINK_PUBLIC_URL: z.string().default(""),
    VOICE_MOCK: z.string().optional(),
    VOICE_MODEL_FAST: z.string().default("openai/gpt-4o-mini"),
    VOICE_MODEL_SMART: z.string().default("openai/gpt-4o"),
    VOICE_MODEL_SMART_AFTER: z.coerce.number().default(3),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: false,
});

export const config = {
  port: env.THINK_PORT,
  token: env.THINK_TOKEN,
  opencode: env.OPENCODE_BASE_URL,
  deepgram: env.DEEPGRAM_API_KEY,
  think: env.THINK_PUBLIC_URL,
  mock: env.VOICE_MOCK === "1",
  model: {
    fast: env.VOICE_MODEL_FAST,
    smart: env.VOICE_MODEL_SMART,
    after: env.VOICE_MODEL_SMART_AFTER,
  },
};
