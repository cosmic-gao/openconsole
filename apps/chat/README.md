# @openconsole/chat

Next.js + AI SDK Elements 聊天，opencode 大脑，Deepgram 语音输入/输出。

## 运行

1. 起 opencode：`opencode serve --port 4096`（配模型 key）
2. `.env`：`DEEPGRAM_API_KEY=...`、`OPENCODE_BASE_URL=http://localhost:4096`
3. `pnpm --filter @openconsole/chat dev` → http://localhost:3000

## 结构

```
app/page.tsx           useChat + AI Elements + 语音（录音→发送 / 回复自动朗读）
app/api/chat           streamText + opencode → UIMessage 流
app/api/stt            Deepgram Nova 转写（录音 → 文字）
app/api/tts            Deepgram Aura 合成（回复 → 朗读）
components/ai-elements  Conversation / Message / PromptInput
lib/opencode · lib/deepgram
```
