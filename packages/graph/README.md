# @opendesign/graph

类型化端口、Trait 解耦、零成本视图与紧凑序列化的有向图核心模型。

## 特性

- **类型化端口模型**：`Vertex` 携带强类型 `Inputs` / `Outputs`；`Socket` 描述端口数据类型并校验边连接的兼容性
- **Trait 与存储解耦**：算法仅依赖 `Catalog` / `Neighbors` / `IntoEdges` / `Walkable` 等能力接口，与具体存储无关
- **两种访问者风格**：状态化遍历器 (`Dfs` / `Bfs` / `Topo` / `DfsPostorder`) 控制推进节奏；事件回调遍历 (`dfsVisit`) 用 `Control` 决定继续 / 剪枝 / 中止
- **零成本视图适配器**：`Reversed` / `NodeFilter` / `EdgeFilter` 仅做 trait 转发，不复制底层数据，可任意嵌套
- **完整算法集**：拓扑排序、强连通分量 (Tarjan / Kosaraju)、Dijkstra 最短路径、DFS / BFS、可达性、邻域、压缩图等
- **增量拓扑**：`IncrementalTopo` 订阅图事件，happy path O(1)，违规时延后做一次性全量重算
- **紧凑序列化与结构化 diff**：元组压缩格式 (~60-70% 字节缩减)、拓扑稳定 ID 重映射、可应用 / 可撤销的图差异
- **变更事件**：基于 `@opendesign/signal` 的强类型 `add` / `remove` 订阅
- **O(1) 节点寻址**：基于内部 `Registry` 的 `at` / `indexOf` / `bound`，删除走 swap-and-pop

## 在本仓库中使用

```json
{
  "dependencies": {
    "@opendesign/graph": "workspace:*"
  }
}
```

## 快速开始

```ts
import { Graph, Socket, Vertex, type NodeId } from '@opendesign/graph';

// 1. 声明端口形态
type AddIn = { lhs: Socket<'number'>; rhs: Socket<'number'> };
type AddOut = { sum: Socket<'number'> };

// 2. 建图、加节点、连边
const graph = new Graph<{ label: string }, void>();

const a = new Vertex<AddIn, AddOut, { label: string }>('a' as NodeId, { label: 'add' });
a.addInput('lhs', Socket.number);
a.addInput('rhs', Socket.number);
a.addOutput('sum', Socket.number);
graph.addNode(a);

const b = new Vertex<AddIn, AddOut>('b' as NodeId);
b.addInput('lhs', Socket.number);
b.addInput('rhs', Socket.number);
b.addOutput('sum', Socket.number);
graph.addNode(b);

graph.connect(['a', 'sum'], ['b', 'lhs']);

// 3. 跑算法
import { toposort, dijkstra } from '@opendesign/graph';

const order = toposort(graph);                 // [NodeId, NodeId]
const dist = dijkstra(graph, a.id, undefined, () => 1);
```

## 核心概念

### Socket

声明端口承载的数据类型，用于校验连接的兼容性。

```ts
Socket.number;   // 'number'
Socket.string;   // 'string'
Socket.exec;     // 'exec'（纯执行流，不传数据）
Socket.any;      // '*'（与任意类型兼容）

const url = new Socket('url', [Socket.string]);  // url <-> string 也兼容

Socket.number.matches(Socket.any);  // true
```

### Vertex / Port (Input | Output)

`Vertex` 是图中的节点，携带类型化端口字典与任意权重载荷。端口是 `Input` 或 `Output` 实例，内部维护与之相连的边 ID 列表 — 邻接关系直接从端口派生，无中央缓存。

### Endpoint / Edge

`Edge` 是有向边，两端用 `Endpoint = { nodeId, portId }` 描述。`Graph.connect(source, target, weight?)` 创建边并触发 Socket 兼容性校验。

### Graph

主容器。继承自 `Model`（储存 + CRUD + 事件订阅）并补充查询层（邻接、度数、序列化）。提供两套边访问 API：

| API                                                                 | 返回                            | 适用                              |
| ------------------------------------------------------------------- | ------------------------------- | --------------------------------- |
| `incoming` / `outgoing` / `incident`                                | `Edge<E>[]`（数组 + 完整 Edge） | 用户面，需要直接读端口 / Endpoint |
| `getEdges` / `getIncoming` / `getOutgoing`                          | `Iterable<EdgeView<E>>`（lazy） | 算法 / 适配器层，跨 trait 复用    |

邻居 API 同理：`predecessors` / `successors` / `adjacencies` 返回数组；`upstream` / `downstream` / `neighbors` 返回 lazy generator。

## Trait（能力接口）

算法仅依赖如下 trait，可与任意自定义存储组合：

| Trait           | 能力                                                   |
| --------------- | ------------------------------------------------------ |
| `Catalog`       | 节点 / 边的集合枚举 (`nodeIds()` / `edgeIds()`)        |
| `Neighbors`     | 邻接查询 (`upstream` / `downstream` / `neighbors`)     |
| `IntoEdges<E>`  | 流式边访问 (`getIncoming` / `getOutgoing` / `getEdges`) |
| `IntoDegree`    | 入度 / 出度查询                                        |
| `Walkable`      | 可遍历（`Catalog` + `Neighbors`）                      |
| `Visitable`     | 访问者绑定（已访问集合）                               |
| `NodeIndexable` | O(1) `at(i)` / `indexOf(id)` 寻址                      |
| `Subscribable`  | 增量算法的事件订阅                                     |

## 算法

```ts
import {
  toposort, topology, cycles, isCyclic, ranks,
  scc, kosaraju, condensation,
  dfs, bfs, postorder,
  reachable, reachableFrom,
  inDegrees, outDegrees,
  neighborhood,
  dijkstra,
  IncrementalTopo,
} from '@opendesign/graph';
```

- **拓扑排序**：`toposort` / `topology` / `ranks`（Kahn 算法 + `Topo` 状态化遍历）
- **强连通分量**：`scc` (Tarjan, 一遍 DFS) / `kosaraju`（两遍 DFS，第二遍在 `Reversed` 上）
- **压缩图**：`condensation` 把每个 SCC 折叠成一个超节点，结果是 DAG
- **遍历**：`dfs` / `bfs` / `postorder` 函数式入口，底层复用 `Dfs` / `Bfs` / `DfsPostorder` 遍历器
- **可达性**：`reachable` / `reachableFrom`
- **度数**：`inDegrees` / `outDegrees`（图实现 `IntoDegree` 时走 O(1)，否则回退到边枚举）
- **邻域**：`neighborhood(graph, start, k)` k-跳邻域
- **最短路**：`dijkstra`（非负权重，二叉堆 + lazy decrease-key，O((V+E) log V)）

### 增量拓扑

```ts
import { IncrementalTopo } from '@opendesign/graph';

const topo = new IncrementalTopo(graph);

graph.addNode(A);                        // rank A = 0
graph.addNode(B);                        // rank B = 1
graph.connect(['A', 'y'], ['B', 'x']);   // happy path, O(1)

topo.rank('A' as NodeId);   // 0
topo.sorted();              // [A, B]

graph.connect(['B', 'y'], ['A', 'x']);   // 违规，标记 dirty
topo.hasCycle;              // true（查询时触发延后重算）

topo.dispose();             // 取消订阅
```

## 视图适配器（零成本）

适配器只做 trait 转发，不持有底层数据副本；适配后仍满足相同 trait，可层层嵌套。

```ts
import { Reversed, NodeFilter, EdgeFilter } from '@opendesign/graph';

// 反向图：祖先遍历 / 反向拓扑 / Kosaraju 第二遍
const ancestors = dfs(new Reversed(graph), target);

// 节点过滤
const onlyData = new NodeFilter(graph, (id) => graph.at(id)?.weight?.kind === 'data');

// 嵌套：data 节点 + 反向
const view = new Reversed(new NodeFilter(graph, isData));
```

## 访问者

```ts
import { Dfs, Bfs, Topo, dfsVisit, Control } from '@opendesign/graph';

// 1. 状态化遍历器：调用方控节奏
const it = Dfs.start(graph, root);
for (const id of it.iterator(graph)) { /* ... */ }
it.reset();
it.moveTo(another);

// 2. 事件回调遍历：用 Control 决定继续 / 剪枝 / 中止
dfsVisit(graph, root, {
  discover: (id) => (id === target ? Control.Stop : Control.Continue),
  treeEdge: (e) => Control.Continue,
  backEdge: (e) => Control.Continue,     // 环检测点
  finish:   (id) => Control.Continue,
});
```

## 序列化

```ts
import { pack, unpack, packRemap, unpackRemap, diff, apply, invert } from '@opendesign/graph';

// 紧凑序列化（约 60-70% 字节缩减）
const compact = pack(graph);
const restored = unpack(compact);

// 拓扑稳定 ID 重映射（UUID → 短整数，用于网络 / 持久化）
const { compact: c, remap } = packRemap(graph);
const round = unpackRemap(c, remap);

// 结构化 diff，可应用 / 可撤销
const ops = diff(before, after);
apply(target, ops);
apply(target, invert(ops));   // undo
```

## 变更事件

```ts
graph.signal.on('node:add', ({ node }) => { /* ... */ });
graph.signal.on('node:remove', ({ id }) => { /* ... */ });
graph.signal.on('edge:add', ({ edge }) => { /* ... */ });
graph.signal.on('edge:remove', ({ id }) => { /* ... */ });

// 任意事件
graph.signal.watch((type, payload) => { /* ... */ });
```

底层走 [`@opendesign/signal`](../signal/README.md)，支持 `AbortSignal` / `Symbol.dispose` / `rescue` 等能力。

## 模块边界

```
core/
├── types/        - 品牌 ID、Socket、Trait 与访问者事件（类型层）
├── classic/      - Socket / Port / Vertex / Endpoint / Edge / Graph（运行时元模型）
├── algorithms/   - toposort / scc / dijkstra / bfs / dfs ...（仅依赖 trait）
├── visitors/     - Dfs / Bfs / Topo 状态化遍历器 + dfsVisit 事件遍历
├── adapters/     - Reversed / NodeFilter / EdgeFilter 零成本视图
├── serialize/    - pack / unpack / diff / remap 紧凑序列化
└── internal/     - 内部工具（堆、度数缓存、端口序列化）
```

`index.ts` 把 `core/*` 全量重导出，使用方统一从包名引入：

```ts
import { Graph, Socket, Vertex, toposort, dijkstra, Reversed } from '@opendesign/graph';
```

## 设计要点

- **无中央邻接缓存**：邻接关系直接由端口的 `edges` 列表派生，结构变更立刻反映新状态，没有失效钩子
- **拓扑 / SCC 等算法不挂在 Graph 上**：保持核心类轻，算法通过 trait 解耦，方便测试与组合
- **swap-and-pop 删除**：`removeNode` O(1) 但**会打乱节点索引顺序**，调用方不应依赖删除后的 `at(i)` 稳定性
- **方向通过参数传**：`incoming(id, direction?)` 优于 `incoming` / `outgoing` 两个方法 — 命名 trait 时也遵循该约定

## 开发

```bash
pnpm --filter @opendesign/graph check       # tsc --noEmit + vitest run
pnpm --filter @opendesign/graph test
pnpm --filter @opendesign/graph test:watch
pnpm --filter @opendesign/graph typecheck
```

## License

MIT
