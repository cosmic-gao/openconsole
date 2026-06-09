import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 工作区 TS 包(@openconsole/graph)以源码内联,避免 node_modules 不转译。
    server: { deps: { inline: [/@openconsole\//] } },
  },
});
