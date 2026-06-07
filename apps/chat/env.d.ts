/// <reference types="vite/client" />

// 让纯 tsc / 编辑器认识 .vue 单文件组件（vue-tsc 自身不需要，但保留以兼容）。
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}
