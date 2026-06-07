<script setup lang="ts">
import { Moon, RotateCcw, SendHorizontal, Square, Sun } from "lucide-vue-next";
import { nextTick, onMounted, ref, watch } from "vue";

import MessageBubble from "@/components/MessageBubble.vue";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChat } from "@/composables/useChat";

const { messages, sending, thread, send, stop, reset } = useChat();
const draft = ref("");
const listRef = ref<HTMLElement | null>(null);
const dark = ref(false);

function scrollToBottom(): void {
  void nextTick(() => {
    const el = listRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}
watch(messages, scrollToBottom, { deep: true });

async function onSend(e?: KeyboardEvent): Promise<void> {
  if (e?.isComposing) return; // 兼容中文输入法组词中的 Enter
  const text = draft.value;
  if (!text.trim() || sending.value) return;
  draft.value = "";
  await send(text);
}

function toggleDark(): void {
  dark.value = !dark.value;
  document.documentElement.classList.toggle("dark", dark.value);
}

onMounted(() => {
  dark.value =
    window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  document.documentElement.classList.toggle("dark", dark.value);
});
</script>

<template>
  <div class="mx-auto flex h-full max-w-3xl flex-col">
    <header
      class="flex items-center justify-between border-b border-border px-4 py-3"
    >
      <div class="flex items-center gap-2">
        <span class="size-2 rounded-full bg-primary" />
        <h1 class="text-sm font-semibold">openconsole · chat</h1>
        <span class="hidden text-xs text-muted-foreground sm:inline">{{
          thread
        }}</span>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="icon" title="切换主题" @click="toggleDark">
          <Sun v-if="dark" class="size-4" />
          <Moon v-else class="size-4" />
        </Button>
        <Button variant="ghost" size="icon" title="新会话" @click="reset">
          <RotateCcw class="size-4" />
        </Button>
      </div>
    </header>

    <main
      ref="listRef"
      class="flex-1 space-y-4 overflow-y-auto px-4 py-6"
    >
      <div
        v-if="!messages.length"
        class="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
      >
        <p class="text-sm">Web 版 opencode —— 问我任何编码或信息问题</p>
        <p class="text-xs">
          经 SSE 连到 @openconsole/agent · 支持多轮 / 思考 / 工具调用
        </p>
      </div>
      <MessageBubble v-for="m in messages" :key="m.id" :message="m" />
    </main>

    <footer class="border-t border-border p-3">
      <div class="flex items-end gap-2">
        <Textarea
          v-model="draft"
          :rows="2"
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          class="max-h-40 flex-1 resize-none"
          @keydown.enter.exact.prevent="onSend"
        />
        <Button
          v-if="sending"
          variant="secondary"
          size="icon"
          title="中断"
          @click="stop"
        >
          <Square class="size-4" />
        </Button>
        <Button
          v-else
          size="icon"
          title="发送"
          :disabled="!draft.trim()"
          @click="onSend()"
        >
          <SendHorizontal class="size-4" />
        </Button>
      </div>
    </footer>
  </div>
</template>
