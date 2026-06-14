"use client";

import { AgentEvents, type AgentLiveClient, createClient } from "@deepgram/sdk";
import { Loader2Icon, MessageSquareIcon, PhoneIcon, PhoneOffIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message";

type Status = "idle" | "connecting" | "live" | "error";
type Turn = { id: string; role: "user" | "assistant"; text: string };

// Deepgram Voice Agent 下行音频可能是 Buffer / ArrayBuffer / Blob，统一成 ArrayBuffer。
async function toArrayBuffer(d: unknown): Promise<ArrayBuffer | null> {
  if (!d) return null;
  if (d instanceof ArrayBuffer) return d;
  if (typeof Blob !== "undefined" && d instanceof Blob) return d.arrayBuffer();
  if (ArrayBuffer.isView(d)) {
    const v = d as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  if (typeof d === "object" && "data" in d) return toArrayBuffer((d as { data: unknown }).data);
  return null;
}

export default function VoicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [error, setError] = useState("");

  const agentRef = useRef<AgentLiveClient | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const spkCtxRef = useRef<AudioContext | null>(null);
  const playheadRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const outputRateRef = useRef(24000);

  function addTurn(role: "user" | "assistant", text?: string) {
    if (!text?.trim()) return;
    setTurns((t) => [...t, { id: crypto.randomUUID(), role, text }]);
  }

  // 播放一段下行 PCM：拼到播放头后，保证无缝。
  async function playAudio(data: unknown) {
    const ab = await toArrayBuffer(data);
    if (!ab || ab.byteLength < 2) return;
    let spk = spkCtxRef.current;
    if (!spk) {
      spk = new AudioContext();
      spkCtxRef.current = spk;
    }
    if (spk.state === "suspended") await spk.resume();
    const rate = outputRateRef.current || 24000;
    const i16 = new Int16Array(ab, 0, Math.floor(ab.byteLength / 2));
    const f32 = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
    const buf = spk.createBuffer(1, f32.length, rate);
    buf.getChannelData(0).set(f32);
    const src = spk.createBufferSource();
    src.buffer = buf;
    src.connect(spk.destination);
    const t = Math.max(spk.currentTime, playheadRef.current);
    src.start(t);
    playheadRef.current = t + buf.duration;
    sourcesRef.current.add(src);
    src.onended = () => sourcesRef.current.delete(src);
  }

  // 打断：用户开口时立刻清空未播完的 TTS 队列。
  function flushPlayback() {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {
        // 已结束的源 stop() 会抛，忽略
      }
    }
    sourcesRef.current.clear();
    if (spkCtxRef.current) playheadRef.current = spkCtxRef.current.currentTime;
  }

  async function cleanup() {
    try {
      agentRef.current?.disconnect();
    } catch {
      // ignore
    }
    agentRef.current = null;
    try {
      workletRef.current?.disconnect();
      micSourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    workletRef.current = null;
    micSourceRef.current = null;
    micStreamRef.current?.getTracks().forEach((tr) => tr.stop());
    micStreamRef.current = null;
    try {
      await micCtxRef.current?.close();
    } catch {
      // ignore
    }
    micCtxRef.current = null;
    flushPlayback();
    try {
      await spkCtxRef.current?.close();
    } catch {
      // ignore
    }
    spkCtxRef.current = null;
    playheadRef.current = 0;
  }

  async function startMic(agent: AgentLiveClient, settings: Record<string, unknown>) {
    const stream = micStreamRef.current;
    if (!stream) return;
    const micCtx = new AudioContext({ sampleRate: 16000 });
    micCtxRef.current = micCtx;
    await micCtx.audioWorklet.addModule("/deepgram-capture-worklet.js");

    // 用真实采样率覆盖 Settings（部分浏览器不一定给到 16k），再发 configure。
    const audio = settings.audio as { input?: { sample_rate?: number } } | undefined;
    if (audio?.input) audio.input.sample_rate = micCtx.sampleRate;
    agent.configure(settings as Parameters<AgentLiveClient["configure"]>[0]);

    const source = micCtx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(micCtx, "capture");
    node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      try {
        agent.send(e.data);
      } catch {
        // 连接关闭后的残帧，忽略
      }
    };
    source.connect(node);
    node.connect(micCtx.destination); // worklet 不产出音频，仅维持图运行
    micSourceRef.current = source;
    workletRef.current = node;
  }

  async function start() {
    setError("");
    setTurns([]);
    setStatus("connecting");
    try {
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

      const res = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? `会话创建失败 (${res.status})`);
      }
      const { token, settings, output } = (await res.json()) as {
        token: string;
        settings: Record<string, unknown>;
        output?: { sampleRate?: number };
      };
      outputRateRef.current = output?.sampleRate ?? 24000;

      const dg = createClient({ accessToken: token });
      const agent = dg.agent();
      agentRef.current = agent;

      agent.on(AgentEvents.Open, () => {
        void startMic(agent, settings).then(() => setStatus("live"));
      });
      agent.on(AgentEvents.ConversationText, (msg: { role?: string; content?: string }) => {
        if (msg.role === "user" || msg.role === "assistant") addTurn(msg.role, msg.content);
      });
      agent.on(AgentEvents.UserStartedSpeaking, () => flushPlayback());
      agent.on(AgentEvents.Audio, (data: unknown) => void playAudio(data));
      agent.on(AgentEvents.Error, (e: { message?: string; description?: string }) => {
        console.error("[voice]", e);
        setError(e?.message ?? e?.description ?? "Deepgram 连接出错");
      });
      agent.on(AgentEvents.Close, () => {
        void cleanup();
        setStatus((s) => (s === "error" ? s : "idle"));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      await cleanup();
    }
  }

  async function stop() {
    await cleanup();
    setStatus("idle");
  }

  useEffect(() => {
    return () => {
      void cleanup();
    };
    // 仅卸载时清理；cleanup 只触及 ref，无需依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === "connecting";
  const live = status === "live";

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between border-b pb-3">
        <div>
          <h1 className="text-base font-semibold">实时语音</h1>
          <p className="text-muted-foreground text-xs">
            Deepgram Voice Agent · 大脑 opencode
          </p>
        </div>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm"
        >
          <MessageSquareIcon size={16} />
          文字聊天
        </Link>
      </header>

      <Conversation className="flex-1">
        <ConversationContent>
          {turns.length === 0 ? (
            <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
              <PhoneIcon size={28} className="opacity-40" />
              <p>点击下方按钮开始通话，座席会先向你问候。</p>
              <p className="text-xs opacity-70">直接说话即可，对方说话时你可随时打断。</p>
            </div>
          ) : (
            turns.map((turn) => (
              <Message from={turn.role} key={turn.id}>
                <MessageContent>
                  <MessageResponse>{turn.text}</MessageResponse>
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex flex-col items-center gap-2 pb-2">
        {error ? <p className="text-destructive max-w-prose text-center text-sm">{error}</p> : null}
        <button
          type="button"
          onClick={live || busy ? stop : start}
          disabled={busy}
          aria-label={live ? "结束通话" : "开始通话"}
          className={`flex size-16 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-70 ${
            live ? "bg-destructive hover:opacity-90" : "bg-primary hover:opacity-90"
          }`}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" size={26} />
          ) : live ? (
            <PhoneOffIcon size={26} />
          ) : (
            <PhoneIcon size={26} />
          )}
        </button>
        <span className="text-muted-foreground text-sm">
          {status === "idle" && "未连接"}
          {status === "connecting" && "连接中…"}
          {status === "live" && "通话中 · 麦克风开启"}
          {status === "error" && "出错了，请重试"}
        </span>
      </div>
    </main>
  );
}
