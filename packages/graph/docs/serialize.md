# Serialize · 持久化、ID 重映射、Diff / Undo

[← 回到索引](./index.md)

序列化栈包含三个相互独立、可组合的模块：

| 模块 | API | 用途 |
|---|---|---|
| **紧凑序列化** | `pack` / `unpack` | 紧凑元组格式（节省 60-70% 字节） |
| **ID 重映射** | `packRemap` / `unpackRemap` | 长 UUID → 短整数（额外缩 30-50%） |
| **结构化 diff** | `diff` / `apply` / `invert` | 增量同步、撤销重做 |

## pack / unpack

```ts
import { pack, unpack } from '@opendesign/graph';

// 序列化
const compact = pack(g);     // { v: 1, g: 'graphId', n: [...], e: [...] }
const json = JSON.stringify(compact);

// 反序列化
const restored = unpack(JSON.parse(json));
```

格式（[`serialize/compact.ts`](../core/serialize/compact.ts)）：

```ts
interface Compact {
  v: 1;                 // schema version
  g: GraphId;
  n: CompactNode[];     // [id, weight, inputs, outputs]
  e: CompactEdge[];     // [id, srcNode, srcPort, tgtNode, tgtPort, weight]
}

type CompactNode = [
  NodeId, unknown,
  Array<[string, PortId, string]> | null,   // 输入端口元组数组
  Array<[string, PortId, string]> | null,   // 输出端口元组数组
];

type CompactEdge = [EdgeId, NodeId, PortId, NodeId, PortId, unknown];
```

设计权衡：

- **字段名单字母**（`v` / `g` / `n` / `e`）—— 每条边/节点都不重复键名，体积比 toJson 小 60-70%
- **schema version `v`**：未来字段加减或语义变更升级版本，unpack 会校验，不匹配抛 `Schema`
- **端口元组 `[name, id, socketName]`** —— 比对象格式紧凑

### 自定义 Socket 表

如果用了内置之外的 Socket 名（如 `'url'`），unpack 时需要提供查找表：

```ts
import { Socket, unpack } from '@opendesign/graph';

const url = new Socket('url', [Socket.string]);

const restored = unpack(compact, {
  sockets: new Map([['url', url]]),
});
```

不提供时，unknown socket 名退化为 `Socket.any`（保留连边但失去严格校验）。

### 写入已有图

```ts
unpack(compact, { target: existingGraph });   // 先 clear() 再加载
```

### batch 包裹大幅减事件

`unpack` 内部已用 `graph.batch()` 包裹：

```ts
// 1000 节点 + 2000 边的图，unpack 时
// nodeAdded 事件全部累积，drain 一次性派发
// IncrementalTopo 等订阅者只感知一次终态
```

## packRemap / unpackRemap · ID 重映射

把长 UUID（`"node-abc-123-...-xyz"`）替换为短整数字符串（`"0"`, `"1"`, ...）。在持久化大量节点的场景下可再缩 30-50%。

```ts
import { packRemap, unpackRemap } from '@opendesign/graph';

// 打包：节点按拓扑序编号，端口和边按内部顺序编号
const { compact, remap } = packRemap(g);

// compact 里所有 ID 是 "0", "1", "2", ...
// remap = { nodes: [...], edges: [...], ports: [...] } 反向映射表

// 还原原始 ID
const restored = unpackRemap({ compact, remap });

// 或保留紧凑 ID（如想用整数 ID 跑后续算法）
const restoredCompact = unpackRemap({ compact, remap }, { keepCompactIds: true });
```

### 拓扑稳定的编号

节点按 `topology(g).order` 编号。这意味着：

- DAG 时整数 ID **就是拓扑序的位置**
- 含环时环上节点按原顺序追加在尾部
- 适合"按编号顺序加载/解析"的场景（构造时不用再 toposort）

## diff / apply / invert · 结构化差异

```ts
import { diff, apply, invert } from '@opendesign/graph';

// 计算 before → after 的最小操作序列
const patch = diff(before, after);
// patch.ops 是 6 种操作之一：addNode / removeNode / addEdge / removeEdge / setNodeWeight / setEdgeWeight

// 把 patch 应用到一张图（原地修改）
apply(target, patch);

// undo
apply(target, invert(patch));   // 把 target 从 after 状态变回 before
```

### 操作类型（[`serialize/ops.ts`](../core/serialize/ops.ts)）

```ts
type GraphOp<N, E> =
  | { kind: 'addNode';        data: JsonNode<N> }
  | { kind: 'removeNode';     data: JsonNode<N> }        // 含完整快照，便于 invert 还原
  | { kind: 'addEdge';        data: JsonEdge<E> }
  | { kind: 'removeEdge';     data: JsonEdge<E> }
  | { kind: 'setNodeWeight';  id: NodeId; from; to: N }
  | { kind: 'setEdgeWeight';  id: EdgeId; from; to: E };
```

### apply 顺序保证

`diff` 输出顺序保证 `apply` 可以安全顺序执行：

1. **removeEdge** —— 先解开旧边
2. **removeNode** —— 再删旧节点（此时入/出边已清空）
3. **addNode + setNodeWeight** —— 加新节点 / 更新留存节点权重
4. **addEdge + setEdgeWeight** —— 挂新边 / 更新留存边权重

`apply` 触发标准事件 → IncrementalTopo 等订阅者会跟着更新。

### 权重比较：sameWeight

`diff` 用 `===` + JSON 浅比较判等。复杂对象 / 循环引用建议传 `equals`：

```ts
import { isEqual } from 'lodash';

const patch = diff(before, after, { equals: isEqual });
```

### invert · undo/redo

```ts
const undo = invert(patch);
const redo = patch;

apply(g, undo);   // 还原
apply(g, redo);   // 重做
```

`invert` 把 `add ↔ remove` 互换、`weight from/to` 互换、并**反转操作顺序**，保证 apply 顺序仍然合法。

## 用法配方

### 配方 1：网络同步两端的图

```ts
// 服务端
const patch = diff(serverGraph_old, serverGraph_new);
sendToClients(JSON.stringify(patch));

// 客户端
const patch = JSON.parse(received);
apply(clientGraph, patch);
```

### 配方 2：编辑器 undo/redo 栈

```ts
const undoStack: GraphPatch[] = [];
const redoStack: GraphPatch[] = [];

function commit(work: () => void) {
  const before = clone(g);    // 深拷贝或用 pack 序列化
  work();
  const patch = diff(before, g);
  undoStack.push(patch);
  redoStack.length = 0;
}

function undo() {
  const patch = undoStack.pop();
  if (!patch) return;
  apply(g, invert(patch));
  redoStack.push(patch);
}

function redo() {
  const patch = redoStack.pop();
  if (!patch) return;
  apply(g, patch);
  undoStack.push(patch);
}
```

### 配方 3：增量推送 + 全量快照

```ts
// 每 100 个 patch 一次全量快照（缩短重放链）
let patchCount = 0;
function syncToServer(patch: GraphPatch) {
  if (++patchCount >= 100) {
    server.send({ type: 'full', data: packRemap(g) });
    patchCount = 0;
  } else {
    server.send({ type: 'patch', data: patch });
  }
}
```

## 性能与压缩

```ts
import { compressionRatio } from '@opendesign/graph';

const { originalBytes, compressedBytes, ratio } = compressionRatio(g);
console.log(`原 ${originalBytes} B → 压 ${compressedBytes} B（${ratio.toFixed(2)}×）`);
```

实测典型图（100 节点 / 200 边 / 端口数 2-3）：

- toJson → 约 25 KB
- pack    → 约 9 KB（~2.8×）
- packRemap → 约 5 KB（~5×）

## 下一步

- 错误（Schema mismatch） → [errors](./errors.md)
- 事件 + 增量算法 → [events](./events.md)
- 用 diff 做增量同步示例 → [recipes](./recipes.md)
