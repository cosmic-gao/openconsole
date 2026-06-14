# @openconsole/voice

Deepgram Voice Agent + opencode + AI SDK 低延迟语音引擎（路线 B）。

## M1（无需 key）

```bash
pnpm install
VOICE_MOCK=1 pnpm --filter @openconsole/voice dev
pnpm --filter @openconsole/voice probe
```

## M2

1. `opencode serve --port 4096`（工作目录放 `opencode.json`、配模型 key）
2. `.env` 填 `DEEPGRAM_API_KEY`；`ngrok http 8788` → 隧道地址写入 `THINK_PUBLIC_URL`
3. `pnpm --filter @openconsole/voice dev`
4. `pnpm --filter @openconsole/voice gateway "我的工单没人处理"`

## src

`config` 环境 · `agent` opencode+AI SDK · `server` Hono(think/call/reconcile) · `settings` Deepgram · `gateway` Deepgram 客户端
