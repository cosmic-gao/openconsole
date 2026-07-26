# @openconsole/mcp

MCP Gateway。把多个上游 MCP Server 聚合成统一端点，并在这个收敛点上插入命名空间、路由、对账与中间件治理。

对客户端表现为一个 MCP Server，对上游表现为多个 MCP Server 的 Client。

## 快速开始

```bash
pnpm --filter @openconsole/mcp dev     # 按 openmcp.yaml 启动（含两个 mock 上游）
curl http://localhost:8080/healthz
pnpm --filter @openconsole/mcp check   # typecheck + 测试
```

## 模块

| 模块 | 职责 | 层次 |
| --- | --- | --- |
| `config.ts` | 输入 → 完全确定的 `GatewaySpec` | 纯函数 |
| `catalog.ts` | 不可变路由表：命名、排序、指纹 | 纯数据 |
| `upstream.ts` | 单个上游的连接、探测、调用与熔断 | IO |
| `endpoint.ts` | 一个挂载点：一组上游的视图与快照 | 视图 |
| `reconciler.ts` | 对账循环，驱动 upstream 探测与 endpoint 刷新 | 编排 |
| `handlers.ts` | MCP 方法与中间件链 | 协议 |
| `http.ts` | Streamable HTTP、会话池与鉴权接线 | 传输 |
| `gateway.ts` | 装配 | 装配 |

`GatewaySpec` 没有可选字段：工具过滤编译成 `exposes(name)`、Origin 白名单编译成 `allowsOrigin(origin)`、工具改名编译成 `qualify(alias, name)`，stdio 参数直接备成 SDK 需要的形状。下游因此不再出现默认值兜底与条件展开。

## 配置

```yaml
port: 8080
reconcileIntervalMs: 60000
allowedOrigins: ['http://localhost:3000'] # 省略即不校验

endpoints:
  - path: /mcp # 省略 upstreams 表示挂载全部
  - path: /mcp/ops # 分组挂载，客户端连哪个 URL 就只看到哪一组
    upstreams: [kubernetes]

upstreams:
  - id: kubernetes # 稳定标识，进入审计日志
    alias: k8s # 命名空间前缀，需短
    transport: { type: http, url: http://k8s-mcp.internal:8080/mcp }
    tools: { exclude: ['delete_*'] } # glob，exclude 优先于 include
    breaker: { failures: 5, resetMs: 30000 }

  - id: gitlab
    alias: git
    transport:
      type: stdio
      command: node
      args: ['./gitlab-mcp.js']
      stderr: inherit # Logging 废弃后，stderr 是 stdio 上游的诊断通道
    timeoutMs: 60000
```

alias 重复、格式非法、transport 类型缺失、端点引用不存在的上游 —— 一律在加载期抛错。

## 鉴权

`verifier` 由调用方提供，网关只负责接线到 SDK 的 `requireBearerAuth`。校验通过的 `AuthInfo` 会沿 `req.auth → extra.authInfo → ctx.auth` 抵达中间件。

```ts
await createGateway(config, {
  auth: {
    verifier: { verifyAccessToken: async (token) => introspect(token) },
    requiredScopes: ['mcp:read'],
    resourceMetadataUrl: 'https://gateway.example.com/.well-known/oauth-protected-resource',
  },
});
```

## 中间件

治理的唯一挂载点。`ctx` 只给标识与工具定义，不暴露上游对象 —— 中间件无法绕过链路直接发起调用。

```ts
import { createGateway, type Middleware } from '@openconsole/mcp';

const audit: Middleware = async (ctx, next) => {
  const result = await next();
  const readOnly = ctx.tool.annotations?.readOnlyHint === true;
  console.log({
    tool: ctx.name,
    upstream: ctx.upstreamId,
    args: readOnly ? '<omitted>' : ctx.args, // 写操作留完整参数，只读留摘要
    ok: !result.isError,
  });
  return result;
};

const authorize: Middleware = async (ctx, next) => {
  // annotations 是风险词汇表而非安全机制，判定依据只能是 token scope
  if (ctx.tool.annotations?.readOnlyHint !== true && !ctx.auth?.scopes.includes('mcp:write')) {
    throw new Error(`缺少 mcp:write scope: ${ctx.name}`);
  }
  return next();
};

await createGateway(config, { middleware: [audit, authorize] });
```

未知工具在路由解析阶段被拒绝，不进入中间件链 —— 此时没有 tool/upstream 上下文。

## 设计要点

| 决策 | 原因 |
| --- | --- |
| `Catalog` 不可变，每轮对账整体替换 | 列举与分页读到同一份快照，不会被并发对账改写 |
| 指纹相同则不推进版本、不通知 | 工具列表位于 prompt 最前部，无差别扇出会反复击穿 LLM prompt cache |
| `annotations` 参与指纹 | `destructiveHint` 由 true 改 false 是契约变更，不是外观变更 |
| 各挂载点独立计指纹与版本 | 某组上游没变，就不该惊动连着另一组的客户端 |
| 探测失败保留上次快照 | 清空列表会让模型认为「能力不存在」并改变整条行为路径 |
| 上游故障返回 `isError` | 而非协议错误，让模型知道是「暂时不可用」而非「工具不存在」 |
| 熔断只拦调用，不拦探测 | 探测同时充当半开探测：一次成功即清零并自动闭合 |
| 资源只改显示名，URI 原样保留 | 改写 URI 会让工具结果里的 `resource_link` 失配 |
| 游标绑定快照版本 | 上游变更后旧游标失效，客户端不会翻到错位的页 |
| 名字按码点排序、超长截断加摘要 | 顺序与名字都稳定，重启后模型学到的名字依然有效 |
| 推送 + 定时轮询双通道 | `listChanged` 会丢，上游可能没声明却在变，恶意上游更会故意不发 |

## 客户端如何知道背后有哪些上游

两层，都不依赖私有扩展：

1. **工具名前缀** —— `k8s__get_pod` 自身即出处。这与 [Envoy AI Gateway](https://aigateway.envoyproxy.io/docs/0.5/capabilities/mcp/) 的 `github__issue_read` 和 [SEP-993](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/993) 提议的 `<namespace>__<tool>` 一致。
2. **`instructions`** —— 握手时按当前上游状态生成，补上「`k8s__` 到底是什么、现在通不通」：

```
本网关聚合以下上游，工具名前缀标识来源：
  k8s__* → kubernetes（12 个工具）
  git__* → gitlab（当前不可达，其工具暂不可用）
```

不额外往 `Tool._meta` 塞出处：前缀是所有客户端都能直接读的，私有 `_meta` key 只有认识它的客户端能用。若 SEP-993 转入正式规范，`namespaces/list` 是增量改动 —— 现有的 `__` 分隔符与 alias 概念可直接映射。

## 边界

已实现：tools / prompts / resources 聚合与路由、多端点分组、对账与扇出、命名空间消歧、上游不可达降级、熔断、Bearer 鉴权、中间件链、分页、`instructions`、Origin 校验。

未实现，均为有意取舍：

- **`resources/subscribe`** — 订阅是会话级状态，需要通知回穿与 per-session 上游绑定，与当前的共享连接模型冲突
- **版本翻译（无状态 ⇄ 有状态）** — 需要 `requestState` 的 AEAD 加密、capability 指纹分池、taskId 自包含，属于独立子系统
- **响应缓存** — 2025-11-25 没有 `ttlMs` / `cacheScope` 契约，猜 TTL 不如不做：把 `private` 当 `public` 缓存就是跨用户泄漏，且审计层看不见
- **重试** — 需要按 `idempotentHint` 判定，那是 handlers 层的信息，塞进 `Upstream` 会污染分层；中间件里实现更合适
- **限流 / 遥测** — 中间件可加，核心不该绑定具体实现
- **注册表同步** — 轮询 `updated_since` 的 ETL 更适合独立进程

## 依赖与标准

`@modelcontextprotocol/sdk@1.29.0`（npm `latest`，实现 2025-11-25 规范）。SDK 的 `main` 分支为 v2 beta（2026-07-28 无状态规范），尚未发布到 npm。

工具名上限取 64，对齐 [SEP-986](https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names)（Final）与多数 LLM provider 对 function name 的限制。注意 SEP-986 允许 `/` 而 2025-11-25 规范正文不允许，取交集 `[A-Za-z0-9_-]` 最安全。

两处偏离默认路径，都有硬原因：

- **不用 `registerTool`**，方法注册在 `McpServer` 公开的 `readonly server` 上。`registerTool` 的 schema 只接受 Zod，SDK 生成定义时 `normalizeObjectSchema` 对非 Zod 输入返回 falsy，`inputSchema` 随即回退成 `EMPTY_OBJECT_JSON_SCHEMA` —— 上游的原始 JSON Schema 会被静默丢弃，模型看不到任何参数。附带保住了 `McpServer` 没有的分页与确定性排序。
- **关闭 `exactOptionalPropertyTypes`**（仓库 `strict` 的其余检查全部生效）。SDK 的 `Transport` 把 `onclose` / `sessionId` 声明成 `prop?: T` 却返回 `T | undefined`，三处 `connect(transport)` 无法通过。

上游变更信号用 `ClientOptions.listChanged` 声明而非 `setNotificationHandler`：SDK 会检查上游是否真的声明了对应 capability。配 `autoRefresh: false, debounceMs: 0` 只取信号，列表由 `Reconciler` 统一重拉 —— 跨上游的变更要合并成一轮对账，SDK 的去抖只作用于单个连接。
