# @openconsole/mcp

最小 MCP Gateway。把多个上游 MCP Server 聚合成单一端点，并在这个收敛点上插入命名空间、路由、对账与中间件治理。

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
| `upstream.ts` | 单个上游的连接、探测与状态 | IO |
| `reconciler.ts` | 对账循环，编排 upstream 与 catalog | 编排 |
| `handlers.ts` | MCP 方法与中间件链 | 协议 |
| `http.ts` | Streamable HTTP 与会话池 | 传输 |
| `gateway.ts` | 装配 | 装配 |

`GatewaySpec` 没有可选字段：工具过滤编译成 `exposes(name)`、Origin 白名单编译成 `allowsOrigin(origin)`、工具改名编译成 `qualify(alias, name)`，stdio 参数直接备成 SDK 需要的形状。下游因此不再出现默认值兜底与条件展开。

## 配置

```yaml
port: 8080
path: /mcp
reconcileIntervalMs: 60000
allowedOrigins: ['http://localhost:3000'] # 省略即不校验

upstreams:
  - id: kubernetes # 稳定标识，进入审计日志
    alias: k8s # 命名空间前缀，需短
    transport: { type: http, url: http://k8s-mcp.internal:8080/mcp }
    tools: { exclude: ['delete_*'] } # glob，exclude 优先于 include

  - id: gitlab
    alias: git
    transport:
      type: stdio
      command: node
      args: ['./gitlab-mcp.js']
      stderr: inherit # Logging 废弃后，stderr 是 stdio 上游的诊断通道
    timeoutMs: 60000
```

alias 重复、格式非法、transport 类型缺失一律在加载期抛错。

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
  const scopes = (ctx.auth as { scopes?: string[] })?.scopes ?? [];
  if (ctx.tool.annotations?.readOnlyHint !== true && !scopes.includes('mcp:write')) {
    throw new Error(`缺少 mcp:write scope: ${ctx.name}`);
  }
  return next();
};

await createGateway(config, [audit, authorize]);
```

未知工具在路由解析阶段被拒绝，不进入中间件链 —— 此时没有 tool/upstream 上下文。

## 设计要点

| 决策 | 原因 |
| --- | --- |
| `Catalog` 不可变，每轮对账整体替换 | 列举与分页读到同一份快照，不会被并发对账改写 |
| 指纹相同则不推进版本、不通知 | 工具列表位于 prompt 最前部，无差别扇出会反复击穿 LLM prompt cache |
| `annotations` 参与指纹 | `destructiveHint` 由 true 改 false 是契约变更，不是外观变更 |
| 探测失败保留上次快照 | 清空列表会让模型认为「能力不存在」并改变整条行为路径 |
| 上游故障返回 `isError` | 而非协议错误，让模型知道是「暂时不可用」而非「工具不存在」 |
| 游标绑定快照版本 | 上游变更后旧游标失效，客户端不会翻到错位的页 |
| 名字按码点排序、超长截断加摘要 | 顺序与名字都稳定，重启后模型学到的名字依然有效 |
| 推送 + 定时轮询双通道 | `listChanged` 会丢，上游可能没声明却在变，恶意上游更会故意不发 |

## 边界

已实现：tools / prompts 聚合与路由、对账与扇出、命名空间消歧、上游不可达降级、中间件链、分页、Origin 校验。

未实现，均为有意取舍：

- **OAuth Resource Server** — SDK 的 `server/auth` 接成 Express 中间件即可
- **版本翻译（无状态 ⇄ 有状态）** — 需要 `requestState` 的 AEAD 加密、capability 指纹分池、taskId 自包含，属于独立子系统
- **resources** — 与 prompts 同构，加进来只是重复
- **响应缓存** — 2025-11-25 没有 `ttlMs` / `cacheScope` 契约，猜 TTL 不如不做：把 `private` 当 `public` 缓存就是跨用户泄漏，且审计层看不见
- **熔断 / 限流** — 中间件可加，内建反而难调
- **注册表同步** — 轮询 `updated_since` 的 ETL 更适合独立进程

## 依赖与标准

`@modelcontextprotocol/sdk@1.29.0`（npm `latest`，实现 2025-11-25 规范）。SDK 的 `main` 分支为 v2 beta（2026-07-28 无状态规范），尚未发布到 npm。

两处偏离默认路径，都有硬原因：

- **不用 `registerTool`**，四个方法注册在 `McpServer` 公开的 `readonly server` 上。`registerTool` 的 schema 只接受 Zod，SDK 生成定义时 `normalizeObjectSchema` 对非 Zod 输入返回 falsy，`inputSchema` 随即回退成 `EMPTY_OBJECT_JSON_SCHEMA` —— 上游的原始 JSON Schema 会被静默丢弃，模型看不到任何参数。附带保住了 `McpServer` 没有的分页与确定性排序。
- **关闭 `exactOptionalPropertyTypes`**（仓库 `strict` 的其余检查全部生效）。SDK 的 `Transport` 把 `onclose` / `sessionId` 声明成 `prop?: T` 却返回 `T | undefined`，三处 `connect(transport)` 无法通过。

上游变更信号用 `ClientOptions.listChanged` 声明而非 `setNotificationHandler`：SDK 会检查上游是否真的声明了对应 capability。配 `autoRefresh: false, debounceMs: 0` 只取信号，列表由 `Reconciler` 统一重拉 —— 跨上游的变更要合并成一轮对账，SDK 的去抖只作用于单个连接。

升级到 2026-07-28 时：`http.ts` 切 `sessionIdGenerator: undefined` 并删除 `SessionPool`；`upstream.ts` 的 `probe()` 改用 `server/discover`；`reconciler.ts` 以上游返回的 `ttlMs` 驱动刷新；`handlers.ts` 的列表结果附 `ttlMs` 与 `cacheScope`，扇出前检查客户端是否开了 `subscriptions/listen`；新增 `InputRequiredResult` 转发与 `requestState` 加密封装。
