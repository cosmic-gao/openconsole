<script setup lang="ts">
import { Primitive, type PrimitiveProps } from "reka-ui";
import type { HTMLAttributes } from "vue";

import { cn } from "@/lib/utils";
import { buttonVariants, type ButtonVariants } from ".";

// 显式声明 as/asChild（而非 extends PrimitiveProps）：避免 defineProps 解析外部类型不稳，
// 确保 as 默认 "button" 真正生效——否则 Primitive 会退回默认 div。
interface Props {
  as?: PrimitiveProps["as"];
  asChild?: boolean;
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: HTMLAttributes["class"];
}

const props = withDefaults(defineProps<Props>(), { as: "button" });
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
