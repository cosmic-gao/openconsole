import OpenAI from "openai";

import { config } from "../src/config";

const client = new OpenAI({
  baseURL: `http://localhost:${config.port}/v1`,
  apiKey: config.token || "x",
});

async function main(): Promise<void> {
  const stream = await client.chat.completions.create(
    {
      model: "opencode-voice",
      stream: true,
      messages: [{ role: "user", content: "你好，帮我查一下工单状态" }],
    },
    { headers: { "x-session-id": "probe-1" } },
  );

  let content = "";
  let chunks = 0;
  let first = 0;
  const start = Date.now();
  for await (const c of stream) {
    const d = c.choices[0]?.delta?.content;
    if (d) {
      if (!first) first = Date.now() - start;
      content += d;
      chunks += 1;
      process.stdout.write(d);
    }
  }

  const ok =
    chunks > 1 &&
    !content.includes("<think>") &&
    !content.includes("reasoning") &&
    content.includes("mock reply");
  console.log(
    `\nchunks=${chunks} first=${first}ms think=${content.includes("<think>") ? "leak" : "stripped"}`,
  );
  console.log(ok ? "M1 ✅" : "M1 ❌");
  process.exit(ok ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
