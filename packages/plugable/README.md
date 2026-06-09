# @openconsole/plugable

通用插件系统内核:类型化多策略 hook 引擎 + 基于 [`@openconsole/graph`](../graph/README.md) 的图驱动顺序计算。Host 无关 —— 同一引擎可驱动任意需要"可扩展插入点"的系统。

## 特性

- **四种 hook 策略**:`SeriesHook`(串行副作用)/ `ParallelHook`(并行)/ `WaterfallHook`(链式改写)/ `BailHook`(熔断首胜)。
- **过滤式 tap**:`filter` 谓词 + `filter.id` / `filter.code` 助手,只对命中的输入执行。
- **两种改写语义**:`WaterfallHook` 默认原地改写;注入 immer `produce` 即获不可变快照。
- **图驱动顺序**:`enforce` 硬分相 + `pre` / `post` 依赖,经 `@openconsole/graph` 增量维护拓扑序、成环精确报错;产出 `bucket.layer.sequence` 顺序码。
- **作用域生命周期**:单插件**热重载** `reload` / 精确 `unload` / `onDispose` / `signal` / `expose`·`useExposed`。

## 安装

```json
{ "dependencies": { "@openconsole/plugable": "workspace:*" } }
```

## 快速开始

### 1. Host 声明 hooks

```ts
import { BailHook, ParallelHook, SeriesHook, WaterfallHook } from "@openconsole/plugable";

export function createBuildHooks() {
  return {
    buildStart: new SeriesHook<{ root: string }>("buildStart"),
    resolveId: new BailHook<{ id: string; importer?: string }, { id: string }>("resolveId"),
    load: new BailHook<{ id: string }, { code: string }>("load"),
    transform: new WaterfallHook<{ id: string }, { code: string }>("transform"),
    buildEnd: new ParallelHook<{ durationMs: number }>("buildEnd"),
  };
}
export type BuildHooks = ReturnType<typeof createBuildHooks>;
```

### 2. 写插件

```ts
import { definePlugin, filter, type HostContext } from "@openconsole/plugable";

const alias = definePlugin<BuildHooks, HostContext, { entries: Record<string, string> }>({
  name: "alias",
  enforce: "pre",
  setup(api, options) {
    api.hooks.resolveId.tap(
      { name: api.name, filter: filter.id(Object.keys(options.entries)) },
      ({ id }) => ({ id: options.entries[id]! }),
    );
  },
});

const stripDebugger = definePlugin<BuildHooks>({
  name: "strip-debugger",
  enforce: "post",
  setup(api) {
    api.hooks.transform.tap(
      { name: api.name, filter: filter.id(/\.[jt]sx?$/) },
      (_input, output) => void (output.code = output.code.replace(/\bdebugger;?/g, "")),
    );
  },
});
```

### 3. Host 装配并派发

```ts
import { PluginManager } from "@openconsole/plugable";

const manager = new PluginManager(createBuildHooks(), { cwd: process.cwd(), mode: "build" });
await manager.use([[alias, { entries: { "@/x": "/abs/x.ts" } }], stripDebugger]);

await manager.hooks.buildStart.call({ root: process.cwd() });
const resolved = await manager.hooks.resolveId.call({ id: "@/x" });        // 熔断:首胜
const loaded = resolved && (await manager.hooks.load.call({ id: resolved.id }));
const out = loaded && (await manager.hooks.transform.call({ id: resolved!.id }, { code: loaded.code }));

await manager.reload("strip-debugger"); // 单插件热重载
console.table([...manager.codes()].map(([name, c]) => ({ name, ...c })));
```

## 四种策略

| 策略 | 语义 | 典型用途 |
| --- | --- | --- |
| `BailHook` | 首个非空结果胜出、短路 | 解析 / 加载 / 权限(deny 短路) |
| `WaterfallHook` | 输出顺着 taps 链式改写 | 转换 / 配置 / 参数 |
| `SeriesHook` | 串行副作用,错误隔离 | 生命周期 / 事件 |
| `ParallelHook` | 并行副作用 | 并发收尾 |

`tap` 的 `order`(`"pre" | "default" | "post"`)控制单 hook 内的局部次序;`filter` 谓词控制命中。

## 顺序码

每个插件算出 `OrderCode = { bucket, layer, sequence, code }`:

- **`bucket`** — `enforce` 硬分相:`pre`(0)→ 默认(1)→ `post`(2)。
- **`layer`** — 相内依赖子图最长路径深度;同 `(bucket, layer)` 互不依赖 → 可并行 setup。
- **`sequence`** — 全局拓扑序号,即 setup 顺序与每个 hook 内 tap 的默认权重。
- `pre` / `post` 是硬边,成环抛 `CycleError`(给出强连通分量)。

顺序由 `@openconsole/graph` 增量维护:加点 / 不破坏拓扑的边走快路径,违反但无环走局部重排,遇环降级一次性重算。

## API

- 引擎:`Hook` · `SeriesHook` · `ParallelHook` · `WaterfallHook` · `BailHook` · `TapOptions` · `TapOrder` · `Produce`
- 过滤:`filter.{ id, code, and, or, not, test }` · `filter.Pattern`
- 插件:`Plugin` · `PluginContext` · `definePlugin` · `HostContext` · `Hooks` · `Tappable` · `Logger`
- 顺序:`PluginGraph` · `OrderNode` · `OrderCode` · `Enforce` · `CycleError`
- 管理:`PluginManager`
- 加载:`loadPlugin`

## 开发

```bash
pnpm --filter @openconsole/plugable check   # tsc --noEmit + vitest run
pnpm --filter @openconsole/plugable test
```

## License

MIT
