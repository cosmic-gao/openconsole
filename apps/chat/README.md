# @openconsole/chat

Web 版 opencode：Next.js + AI SDK Elements，opencode 当大脑。两种交互：

- **文字聊天**（`/`）：打字，或「录音 → 转写 → 发送」，回复可自动朗读。
- **实时语音**（`/voice`）：Deepgram Voice Agent 全托管 STT→LLM→TTS，浏览器直连、可打断；大脑仍是 opencode。

## 架构

文字聊天：浏览器 `useChat` → `/api/chat`（`streamText` + opencode）→ UIMessage 流；语音走 `/api/stt`、`/api/tts`（Deepgram 预录转写 / Aura 合成）。

实时语音（Deepgram Voice Agent，路线 C2）：

```
浏览器 /voice ──(@deepgram/sdk + 临时令牌)── Deepgram Voice Agent（云端 VAD/STT/编排/TTS/打断）
                                                  │ think 回调（OpenAI 兼容，须公网可达）
                                                  ▼
                                   /api/voice/think ──► opencode :4096（会话/历史/LLM）
```

- 浏览器先 `POST /api/voice/session` 拿 **Deepgram 临时令牌 + Settings**，再用浏览器 SDK 直连 Voice Agent；音频 WebSocket **不经本服务**（低延迟）。
- Deepgram 云端回调 `/api/voice/think` 取回复 → 该路由转 opencode（剥离 `<think>`、按轮次 fast/smart 切换模型）。
- **think 须公网可达**：本地用隧道，如 `ngrok http 3000`，把外网根地址填进 `VOICE_THINK_PUBLIC_URL`。

## 运行

1. 起 opencode（在本目录，以加载这里的 voice agent 配置）：`opencode serve --port 4096`（配模型 key）。
2. `.env`（见 `.env.example`）：至少 `DEEPGRAM_API_KEY`；用实时语音还需 `VOICE_THINK_PUBLIC_URL`（隧道外网地址）。
3. `pnpm --filter @openconsole/chat dev` → http://localhost:3000 ，实时语音在 `/voice`。

## 结构

```
app/page.tsx              文字聊天（录音→发送 / 回复朗读）
app/voice/page.tsx        实时语音页（Deepgram 浏览器 SDK 直连 Voice Agent）
app/api/chat              streamText + opencode → UIMessage 流
app/api/stt · api/tts     Deepgram 预录转写 / Aura 合成
app/api/voice/session     建会话 + 临时令牌 + Settings
app/api/voice/think       OpenAI 兼容 think 端点（Deepgram 回调 → opencode）
app/api/voice/reconcile   对账「实际说出口」回写会话历史（可选）
lib/voice/*               agent（opencode 会话/流式/双模型/剥 think）· settings · config
lib/opencode · lib/deepgram
opencode.json             voice agent（口语短句、禁工具）
public/deepgram-capture-worklet.js  麦克风 PCM 采集
```

## 实时语音的语言 / TTS

默认英文（`aura-2-thalia-en`，开箱即用）。语言/音色由 `.env` 控制：`VOICE_LANGUAGE`、`VOICE_STT_MODEL`、`VOICE_TTS_MODEL`、`VOICE_GREETING`。

中文 TTS：Deepgram Aura 对中文支持有限。需要中文时把 `lib/voice/settings.ts` 里的 `speak.provider` 换成支持中文的第三方（如 `eleven_labs`/`cartesia`），STT 的 `nova-3` 可用 `multi` 自动识别。
