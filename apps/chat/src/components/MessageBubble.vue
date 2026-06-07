<script setup lang="ts">
import { Check, Loader2, Wrench, X } from "lucide-vue-next";
import { computed } from "vue";

import type { ChatMessage } from "@/composables/useChat";

const props = defineProps<{ message: ChatMessage }>();

// 去掉首尾空白：MiniMax 在 </think> 后常吐 \n\n\n，纯空白会判真而渲染出空框、
// 真答案也会因此顶部带空隙。trim 后既不渲染空框，正文也贴边。
const answer = computed(() => props.message.answer.trim());
</script>

<template>
  <div :class="message.role === 'user' ? 'flex justify-end' : 'flex justify-start'">
    <!-- 用户消息 -->
    <div
      v-if="message.role === 'user'"
      class="max-w-[80%] whitespace-pre-wrap break-words rounded-lg rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
    >
      {{ message.answer }}
    </div>

    <!-- 助手消息 -->
    <div v-else class="flex w-full max-w-[85%] flex-col gap-2">
      <!-- 推理（暗色、可折叠） -->
      <details
        v-if="message.reasoning"
        class="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
      >
        <summary class="cursor-pointer select-none text-muted-foreground">
          💭 思考过程
        </summary>
        <div class="mt-2 whitespace-pre-wrap break-words text-muted-foreground/80">
          {{ message.reasoning }}
        </div>
      </details>

      <!-- 工具调用 chip -->
      <div v-if="message.tools.length" class="flex flex-wrap gap-1.5">
        <span
          v-for="t in message.tools"
          :key="t.id"
          class="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
        >
          <Wrench class="size-3 opacity-60" />
          {{ t.name }}
          <Loader2 v-if="t.status === 'running'" class="size-3 animate-spin" />
          <Check v-else-if="t.status === 'ok'" class="size-3 text-primary" />
          <X v-else class="size-3 text-destructive" />
        </span>
      </div>

      <!-- 正文 -->
      <div
        v-if="answer"
        class="whitespace-pre-wrap break-words rounded-lg rounded-bl-sm border border-border bg-card px-4 py-2 text-sm text-card-foreground"
      >
        {{ answer }}
      </div>

      <!-- 流式占位（尚无任何输出时） -->
      <div
        v-else-if="
          message.status === 'streaming' &&
          !message.tools.length &&
          !message.reasoning
        "
        class="flex items-center gap-2 px-1 text-sm text-muted-foreground"
      >
        <Loader2 class="size-4 animate-spin" /> 思考中…
      </div>

      <!-- 兜底提示 -->
      <div v-if="message.note" class="px-1 text-xs italic text-muted-foreground">
        {{ message.note }}
      </div>

      <!-- 错误 -->
      <div
        v-if="message.error"
        class="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
      >
        错误：{{ message.error }}
      </div>

      <!-- 用量 -->
      <div
        v-if="message.usage"
        class="px-1 text-[11px] text-muted-foreground/70"
      >
        本轮 {{ message.usage.total }} tok
      </div>
    </div>
  </div>
</template>
