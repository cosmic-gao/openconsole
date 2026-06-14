import { createClient } from "@deepgram/sdk";

import { config } from "./config";
import { settings } from "./settings";

const base = `http://localhost:${config.port}`;

interface Connection {
  on(event: string, cb: (data: unknown) => void): void;
  sendAgentV1Settings(s: unknown): void;
  send(d: unknown): void;
  sendAgentV1InjectUserMessage?(m: unknown): void;
  waitForOpen?(): Promise<void>;
  disconnect?(): void;
}

async function open(call: string, context: string): Promise<void> {
  await fetch(`${base}/call`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ call, context }),
  });
}

async function reconcile(call: string, text: string): Promise<void> {
  await fetch(`${base}/reconcile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ call, text }),
  }).catch(() => {});
}

function inject(conn: Connection, text: string): void {
  const m = { type: "InjectUserMessage", content: text };
  if (conn.sendAgentV1InjectUserMessage) conn.sendAgentV1InjectUserMessage(m);
  else conn.send(JSON.stringify(m));
}

function parse(d: unknown): { type?: string; role?: string; content?: string } {
  if (d && typeof d === "object") return d as Record<string, string>;
  if (typeof d === "string") {
    try {
      return JSON.parse(d);
    } catch {
      return {};
    }
  }
  return {};
}

async function main(): Promise<void> {
  if (!config.deepgram) throw new Error("missing DEEPGRAM_API_KEY");
  if (!config.think) {
    console.warn("THINK_PUBLIC_URL 未设：Deepgram 无法回调 think 端点，需隧道暴露");
  }

  const call = `call-${Date.now()}`;
  await open(call, "[来电预取] 技术支持来电。");

  const dg = createClient(config.deepgram) as unknown as {
    agent: { v1: { connect(): Promise<unknown> } };
  };
  const conn = (await dg.agent.v1.connect()) as unknown as Connection;

  let audio = 0;
  let replied = false;

  conn.on("message", (data) => {
    const ev = parse(data);
    if (ev.type === "ConversationText") {
      console.log(`[${ev.role}] ${ev.content ?? ""}`);
      if (ev.role === "assistant") {
        replied = true;
        void reconcile(call, ev.content ?? "");
      }
    } else if (ev.type === "AgentAudioDone") {
      console.log(`audio ${audio}B ${replied && audio > 0 ? "✅" : ""}`);
      setTimeout(() => {
        conn.disconnect?.();
        process.exit(0);
      }, 800);
    } else if (ev.type === "Error" || ev.type === "Warning") {
      console.warn(ev);
    } else if (ev.type) {
      console.log(ev.type);
    }
  });
  conn.on("audio", (b) => {
    const x = b as { byteLength?: number; length?: number };
    audio += x?.byteLength ?? x?.length ?? 0;
  });
  conn.on("error", (e) => console.error(e));

  await conn.waitForOpen?.();
  conn.sendAgentV1Settings(settings(call));

  const text = process.argv.slice(2).join(" ") || "我的工单一直没人处理";
  setTimeout(() => {
    console.log(`> ${text}`);
    inject(conn, text);
  }, 1500);
  setTimeout(() => {
    console.error("timeout");
    process.exit(1);
  }, 20_000);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
