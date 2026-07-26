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
| `reconciler.ts` | 对账循环与热更新差异计算 | 编排 |
| `handlers.ts` | MCP 方法与中间件链 | 协议 |
| `middleware.ts` | 内置中间件：审计、限流、重试 | 治理 |
| `http.ts` | Streamable HTTP、会话池与鉴权接线 | 传输 |
| `gateway.ts` | 装配 | 装配 |

`GatewaySpec` 没有可选字段：工具过滤编译成 `exposes(name)`、Origin 白名单编译成 `allowsOrigin(origin)`、命名编译成 `qualify(alias, name)` 与 `disambiguate(name, ordinal)`、端点覆盖编译成 `decorate(tool)`，stdio 参数直接备成 SDK 需要的形状。下游因此不再出现默认值兜底与条件展开。

## 配置

```yaml
port: 8080
reconcileIntervalMs: 60000
allowedOrigins: ['http://localhost:3000'] # 省略即不校验
duplicates: rename # 对外名字撞车时改名保留；reject 则丢弃后来者

endpoints:
  - path: /mcp # 省略 upstreams 表示挂载全部
  - path: /mcp/ops # 分组挂载，客户端连哪个 URL 就只看到哪一组
    upstreams: [kubernetes]
    overrides: # 同一个上游在不同端点可以有不同呈现
      k8s__get_pod:
        name: pod # 改名后仍受 64 字符与字符集校验
        description: 取一个 Pod 的详情
  - path: /mcp/lite # 工具太多时改用渐进式发现
    discovery: progressive

upstreams:
  - id: kubernetes # 稳定标识，进入审计日志
    alias: k8s # 命名空间前缀，需短
    transport:
      type: http
      url: http://k8s-mcp.internal:8080/mcp
      headers: { Authorization: 'Bearer ${K8S_TOKEN}' } # 由进程环境注入
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
    onUnreachable: hide # 默认 keep：保留上次快照，让模型知道是「暂时不可用」
```

`${VAR}` 由进程环境展开，配置文件本身因此不再是密钥载体；引用未定义的变量在加载期就报错。

alias 重复、格式非法、transport 类型缺失、端点引用不存在的上游、`overrides` 改名后自相撞车 —— 一律在加载期抛错。

两层工具过滤的分工：`upstreams[].tools` 按**上游原始名字**筛，决定什么进得来；`endpoints[].overrides` 按**对外名字**改呈现，决定长什么样。

## 重名处置

alias 唯一保证了工具名不会跨上游撞车，但资源不同 —— 资源的身份是 URI，两个上游完全可能给出同一个。

默认 `duplicates: rename`：第一个占住原 URI，后来者加 alias 前缀（`q+mock://twin/config`，与 agentgateway 的 `service+uri` 同形）。被改写的那条 `resource_link` 会失配，但另一个选择是它彻底不可达 —— 少一个能力，模型就再也找不到它。发给上游的始终是原始 URI，改写只在对外这一侧。

`duplicates: reject` 则丢弃后来者。两种模式下撞过车的名字都记进 `/healthz` 的 `collisions`，不只是写日志。

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

**三个会触达上游的方法全部经过它**：`tools/call`、`prompts/get`、`resources/read`。列举类方法不在其中 —— 它们读的是本地快照，不产生上游调用，也就没有可治理的副作用。

```ts
import { audit, createGateway, rateLimit, retry, type Middleware } from '@openconsole/mcp';

// annotations 是风险词汇表而非安全机制，判定依据只能是 token scope
const authorize: Middleware = (ctx, next) => {
  // 取 prompt 与读资源在协议上就没有写语义，只有工具需要看 annotations
  const readOnly = ctx.method !== 'tools/call' || ctx.tool?.annotations?.readOnlyHint === true;
  if (!readOnly && !ctx.auth?.scopes.includes('mcp:write')) {
    throw new McpError(ErrorCode.InvalidRequest, `缺少 mcp:write scope: ${ctx.name}`);
  }
  return next();
};

await createGateway(config, {
  middleware: [
    audit((record) => logger.info(record)), // 只读调用不留参数，写操作留全量
    authorize,
    rateLimit({ perMinute: 60 }), // 默认按「调用方 + 方法 + 目标」计数
    retry({ attempts: 2 }), // 只重试可重放操作的传输故障
  ],
});
```

`ctx.method` 判别当前是哪个方法，`ctx.name` 是对外标识（工具与 prompt 是名字，资源是 URI），`ctx.tool` 只在 `tools/call` 时有值。

`retry` 靠 `idempotentHint` / `readOnlyHint` 判定工具的可重放性，`prompts/get` 与 `resources/read` 则天然可重放。做成中间件而非内建在 `Upstream` 里，是因为幂等性属于工具契约，`Upstream` 那一层看不到。

未知目标在路由解析阶段被拒绝，不进入中间件链 —— 此时没有 tool/upstream 上下文。

错误在链上分三层落位，中间件因此能看到真实异常而不是被吞掉的 `isError`：

| 来源 | 处置 |
| --- | --- |
| 上游的业务与参数错误 | 最内层即转 `isError`，交给模型自纠 |
| 上游的传输故障 | 向上抛，`retry` 有机会介入；重试耗尽后在边界转 `isError` |
| 中间件的显式拒绝（`McpError`） | 原样抛出，保持协议错误 —— 限流与鉴权拒绝不该被模型当成"工具坏了"反复重试 |

只有 `tools/call` 有 `isError` 通道可以把失败交给模型自纠。`prompts/get` 与 `resources/read` 在协议上没有这个通道，它们的错误一律保持协议错误。

中间件只能在调用时拦截。要让不同调用者看到不同的列表，用 `visibility` —— 规范允许工具集随请求携带的授权变化：

```ts
await createGateway(config, {
  // 作用于 tools / prompts / resources / resourceTemplates，四者都有 name
  visibility: (item, auth) =>
    !item.name.startsWith('admin_') || auth?.scopes.includes('mcp:admin') === true,
});
```

**裁剪同时作用于调用**：被裁掉的条目在解析阶段就等同不存在，客户端绕过列表直接调用也会被拒。只裁列表不裁调用，裁剪就只是障眼法。

## 热更新

上游、端点、命名规则与限额都能不重启生效，`apply` 是声明式的 —— 传完整配置，网关自己算差异：

```ts
const gateway = await createGateway(config);
await gateway.apply({ ...config, upstreams: [...config.upstreams, newcomer] });
```

差异的处置规则：

| 变化 | 处置 |
| --- | --- |
| 新增上游 | 建连并探测，随下一轮对账进入目录 |
| 移除上游 | 关连接，其条目退出目录 |
| 上游连接参数变了 | 重连（`identity` 比对的就是连接部分） |
| 只改了 `tools` 过滤或 `timeoutMs` | 换 spec，**不断连** |
| 新增端点 | 即时挂载 |
| 移除端点 | 卸载，该端点的会话关闭 |
| 端点改了 `discovery` | 该端点会话失效重连 —— `McpServer` 的注册形状随之改变 |
| 端点改了上游集合或 `overrides` | 保留会话，走 `listChanged` 通知 |
| `port` | 拒绝，抛错而非静默忽略 |

端点实例在更新中被保留而非重建，`version` 因此得以延续 —— 重建会让版本号回退，客户端手上的游标随之错位。

## 上下文预算

工具超过 20 个模型的选择准确率就开始下降，超过 40 个明显劣化（[SEP-993](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/993) 的原话）。两级手段：

**分组挂载** —— 一个端点只挂一组上游，客户端连哪个 URL 就只加载哪一组。

**渐进式发现** —— `discovery: progressive` 的端点不列出任何业务工具，只暴露三个元工具：

| 元工具 | 作用 |
| --- | --- |
| `search_tools(query, limit?)` | 按关键词检索，只返回名字与简介 |
| `describe_tool(name)` | 取完整定义，含参数 JSON Schema |
| `call_tool(name, arguments)` | 执行 |

模型从 3 个 schema 起步而不是几百个，用到哪个才取哪个的定义。Anthropic 的 Tool Search 在同一模式下实测削减约 85% token，[fastmcp-gateway](https://github.com/Ultrathink-Solutions/fastmcp-gateway) 与 ida-mcp 都是这个形状。

两点实现约束：

- `call_tool` 与直接调用**共用同一个执行入口**，中间件、熔断、审计全部照常生效 —— 元工具不是绕过治理的后门。
- `call_tool` 的 `annotations` 声明为 `destructiveHint: true`，因为它能调用任意工具，宿主不该因为它自身"看起来无害"而跳过确认。

检索用名字权重 3、描述权重 1 的词项计分，无额外依赖。工具规模到需要向量检索的程度时，替换 `search()` 一个函数即可。

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
| 熔断只计传输层故障 | `InvalidParams` 之类说明上游活着在应答，计入会让客户端连续传错参数就把上游打下线（同 Envoy outlier detection 只对 5xx 计数） |
| 变更信号合并但不顺延 | 顺延式去抖会被持续抖动的上游饿死，对账永不执行 |
| 元工具与直接调用共用执行入口 | 否则 `call_tool` 就是绕过中间件与熔断的后门 |
| 三个执行方法共用同一条中间件链 | 只治理 `tools/call` 的话，`resources/read` 就是数据外泄的免检通道 |
| 可见性裁剪同时作用于解析 | 只裁列表不裁调用，裁剪就只是障眼法 |
| 资源默认保留原 URI，只在撞车时改写 | 改写会让 `resource_link` 失配，但丢弃意味着那个资源彻底不可达 |
| 游标绑定快照版本 | 上游变更后旧游标失效，客户端不会翻到错位的页 |
| 名字按码点排序、超长截断加摘要 | 顺序与名字都稳定，重启后模型学到的名字依然有效 |
| 推送 + 定时轮询双通道 | `listChanged` 会丢，上游可能没声明却在变，恶意上游更会故意不发 |
| 热更新保留端点实例而非重建 | 重建会让 `version` 回退，客户端手上的游标随之错位 |
| 只有连接身份变了才重连上游 | 改一条过滤规则不该打断正在进行的调用 |
| `port` 变更抛错而非忽略 | 静默忽略会让运维以为改生效了 |

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

## stdio 上游的信任边界

**网关不做沙箱。** `type: stdio` 的上游由 `spawn` 直接拉起，以网关进程的身份运行。

隔离的：

- 环境变量走白名单（`PATH` / `HOME` 一类）加上该上游自己的 `env`，网关进程里的其他变量不传递
- 每个上游只看得到配给自己的 `env`，看不到别的上游的

**没有隔离的**：文件系统读写、网络、派生进程、CPU 与内存。这意味着一个被攻陷的上游可以直接读走 `openmcp.yaml` —— 里面有其他所有上游的凭据，环境变量那层隔离就此绕过。

所以 `command` 与 `args` 必须视同部署凭据：只能来自受控的配置文件，绝不可由请求内容或注册表拼装。

要沙箱就把容器写进 `command`，不需要改一行代码：

```yaml
- id: filesystem
  alias: fs
  transport:
    type: stdio
    command: docker
    args:
      - run
      - --rm
      - -i # stdio 传输必须保留标准输入
      - --network=none
      - --read-only
      - --memory=256m
      - --pids-limit=64
      - --cap-drop=ALL
      - -v
      - /work:/work:ro
      - ghcr.io/acme/mcp-filesystem
```

不把它封装成 `sandbox:` 配置项，是因为容器运行时各不相同（docker / podman / nerdctl / gVisor），参数也随场景变化，抽象一层只会挡住需要的人。生产环境更省事的路径是让 [Docker MCP Gateway](https://github.com/docker/mcp-gateway) 托管 stdio 上游，本网关只连它暴露的 HTTP 端点 —— 签名校验、密钥管理、出入站扫描它都做了。

## 对标 agentgateway 与 MetaMCP

两个库的设计各取一部分，也各拒了一部分。

**采自 [MetaMCP](https://github.com/metatool-ai/metamcp)**（TypeScript，namespace + 可插拔中间件）：

- 中间件拦截全部执行方法，而不只是工具调用
- 端点级的工具元数据覆盖（改名、改标题、改描述）
- 配置热更新，以及更新时按需失效会话

**采自 [agentgateway](https://github.com/agentgateway/agentgateway)**（Rust，多路复用 + 响应合并）：

- 重名不再静默丢弃。资源 URI 撞车时加 alias 前缀（`service+uri` 同形），`duplicates` 可切回 reject
- 授权过滤覆盖全部条目类型，而非只有工具
- 上游不可达的降级策略可配置（`onUnreachable`），对应它的 FailureMode

**明确没采纳的两条**：

| 它们的做法 | 为什么不跟 |
| --- | --- |
| agentgateway 每次 list 实时扇出到所有上游、流式合并、不缓存 | 那是 Rust 为流式长连接优化的形状。换到这里会丢掉指纹去噪（击穿 LLM prompt cache）、游标绑定快照、探测失败保留上次快照三样东西，而且尾延迟会被最慢的上游拖住。不可变快照更适合 Node，也更适合「工具列表要稳」这个约束 |
| agentgateway 单目标时不加前缀（`targets.len() > 1` 才多路复用） | 同一个工具会因为挂在单上游端点还是多上游端点而有两个名字。名字稳定性优先 —— 重启后模型学到的名字必须依然有效 |

MetaMCP 的 namespace 作为**可复用**单元也没引入：端点已经能内联表达上游集合与 overrides，多加一层间接只有在多个端点共享同一份配置时才回本。真出现重复，那时再抽。

## 边界

已实现：tools / prompts / resources 聚合与路由、多端点分组、渐进式发现、按调用者裁剪可见性（列表与调用双侧）、对账与扇出、命名空间消歧、重名改名保留、上游不可达降级、熔断、Bearer 鉴权、覆盖三个执行方法的中间件链（内置审计 / 限流 / 重试）、分页、`instructions`、会话上限与空闲回收、Origin 校验、配置热更新、环境变量插值。

未实现，均为有意取舍：

- **多副本部署** — 会话是进程内 `Map`，`sessionIdGenerator` 也不含路由信息。目前只能单副本，或在 L7 按 `mcp-session-id` 做会话亲和；滚动更新会打断既有会话。熔断与限流同样是 per-replica 状态，多副本下配额语义会失真。不自造 Redis 会话层是因为 2026-07-28 的无状态规范正在把这件事标准化，SDK `main` 已是 v2 beta —— 等协议层给答案比先搭一套再拆掉划算
- **per-caller 凭据透传** — 上游连接是全局共享的（N×M 连接收敛成 M 是它的价值所在），代价是所有调用方共用同一份上游凭据，没有 token exchange / on-behalf-of。这把多租户挡在门外；要做就得改成 per-caller 连接池，是架构级改动
- **stdio 沙箱** — 见上节。自研 seccomp / namespace / cgroup 既难写对又重复造轮子，把容器写进 `command` 即可
- **`resources/subscribe`** — 订阅是会话级状态，需要通知回穿与 per-session 上游绑定，与当前的共享连接模型冲突
- **版本翻译（无状态 ⇄ 有状态）** — 需要 `requestState` 的 AEAD 加密、capability 指纹分池、taskId 自包含，属于独立子系统
- **响应缓存** — 2025-11-25 没有 `ttlMs` / `cacheScope` 契约，猜 TTL 不如不做：把 `private` 当 `public` 缓存就是跨用户泄漏，且审计层看不见
- **遥测** — 核心不该绑定具体实现；`audit` 中间件的 `AuditRecord` 直接喂给 OTel 或日志管道即可
- **注册表同步** — 轮询 `updated_since` 的 ETL 更适合独立进程

## 依赖与标准

`@modelcontextprotocol/sdk@1.29.0`（npm `latest`，实现 2025-11-25 规范）。SDK 的 `main` 分支为 v2 beta（2026-07-28 无状态规范），尚未发布到 npm。

工具名上限取 64，对齐 [SEP-986](https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names)（Final）与多数 LLM provider 对 function name 的限制。注意 SEP-986 允许 `/` 而 2025-11-25 规范正文不允许，取交集 `[A-Za-z0-9_-]` 最安全。

两处偏离默认路径，都有硬原因：

- **不用 `registerTool`**，方法注册在 `McpServer` 公开的 `readonly server` 上。`registerTool` 的 schema 只接受 Zod，SDK 生成定义时 `normalizeObjectSchema` 对非 Zod 输入返回 falsy，`inputSchema` 随即回退成 `EMPTY_OBJECT_JSON_SCHEMA` —— 上游的原始 JSON Schema 会被静默丢弃，模型看不到任何参数。附带保住了 `McpServer` 没有的分页与确定性排序。
- **关闭 `exactOptionalPropertyTypes`**（仓库 `strict` 的其余检查全部生效）。SDK 的 `Transport` 把 `onclose` / `sessionId` 声明成 `prop?: T` 却返回 `T | undefined`，三处 `connect(transport)` 无法通过。

上游变更信号用 `ClientOptions.listChanged` 声明而非 `setNotificationHandler`：SDK 会检查上游是否真的声明了对应 capability。配 `autoRefresh: false, debounceMs: 0` 只取信号，列表由 `Reconciler` 统一重拉 —— 跨上游的变更要合并成一轮对账，SDK 的去抖只作用于单个连接。
