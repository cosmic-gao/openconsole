"use client";

import { useChat } from "@ai-sdk/react";
import { MicIcon, SquareIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
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
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

function textOf(message: { parts: Array<{ type: string; text?: string }> }): string {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
}

export default function Page() {
  const { messages, sendMessage, status } = useChat();
  const [recording, setRecording] = useState(false);
  const [speak, setSpeak] = useState(true);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const spoken = useRef<Set<string>>(new Set());

  // 语音输入：录音 → /api/stt → 直接发送
  async function record() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    const rec = new MediaRecorder(media);
    chunks.current = [];
    rec.ondataavailable = (e) => chunks.current.push(e.data);
    rec.onstop = async () => {
      media.getTracks().forEach((t) => t.stop());
      setRecording(false);
      const blob = new Blob(chunks.current, { type: rec.mimeType });
      const res = await fetch("/api/stt", { method: "POST", body: blob });
      const { text } = (await res.json()) as { text?: string };
      if (text?.trim()) void sendMessage({ text });
    };
    recorder.current = rec;
    rec.start();
    setRecording(true);
  }

  // 语音输出：assistant 回复完成后自动朗读
  useEffect(() => {
    if (!speak || status !== "ready") return;
    const last = messages.at(-1);
    if (!last || last.role !== "assistant" || spoken.current.has(last.id)) return;
    const text = textOf(last);
    if (!text.trim()) return;
    spoken.current.add(last.id);
    void (async () => {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const audio = new Audio(URL.createObjectURL(await res.blob()));
      await audio.play().catch(() => {});
    })();
  }, [messages, status, speak]);

  function submit(message: PromptInputMessage) {
    if (message.text?.trim()) void sendMessage({ text: message.text });
  }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col gap-4 p-4">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                {message.parts.map((part, i) =>
                  part.type === "text" ? (
                    <MessageResponse key={i}>{part.text}</MessageResponse>
                  ) : null,
                )}
              </MessageContent>
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={submit}>
        <PromptInputBody>
          <PromptInputTextarea />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            <PromptInputButton
              type="button"
              onClick={record}
              variant={recording ? "default" : "ghost"}
              tooltip={recording ? "停止录音" : "语音输入"}
            >
              {recording ? <SquareIcon size={16} /> : <MicIcon size={16} />}
            </PromptInputButton>
            <PromptInputButton
              type="button"
              onClick={() => setSpeak((v) => !v)}
              variant={speak ? "default" : "ghost"}
              tooltip={speak ? "关闭朗读" : "开启朗读"}
            >
              {speak ? <Volume2Icon size={16} /> : <VolumeXIcon size={16} />}
            </PromptInputButton>
          </PromptInputTools>
          <PromptInputSubmit status={status} />
        </PromptInputFooter>
      </PromptInput>
    </main>
  );
}
