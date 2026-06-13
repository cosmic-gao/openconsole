// `@openconsole/nacos` 顶层 = 框架无关核心。
//
// 这里**不再** import `server-only` —— 核心可被任意 Node 服务端框架
// (Next.js / Hono / NestJS / 裸 Node)消费。Next.js 专属的构建守卫、单例
// 与 `next/*` 接入都收敛在 `@openconsole/nacos/nextjs` 适配器里。
//
// 框架接入请按需引入对应子路径:
//   import { init, client } from "@openconsole/nacos/nextjs";
//   import { createNacos } from "@openconsole/nacos/hono";
//   import { NacosModule } from "@openconsole/nacos/nestjs";

export * from "./core";
