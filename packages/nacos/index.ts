// 本包**仅**在 Node.js Runtime 下工作 —— 用 `next/headers` / `next/cache` /
// `next/server` 等服务端 API,内含订阅、定时器、网络连接等不应进 client
// bundle 的逻辑。`server-only` 让 Next.js bundler 在客户端组件误 import 时
// 直接抛错,把问题挡在 build 时。
import "server-only";

export * from "./core";
