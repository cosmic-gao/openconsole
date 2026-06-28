# @openconsole/graph

类型化端口、Trait 解耦、零成本视图与紧凑序列化的有向图核心模型。

## 特性

- **类型化端口模型**：`Vertex` 携带强类型 `Inputs` / `Outputs`；`Socket` 描述端口数据类型并校验边连接的兼容性
- **Trait 与存储解耦**：算法仅依赖 `Catalog` / `Neighbors` / `IntoEdges` / `Walkable` 等能力接口，与具体存储无关
- **两种访问者风格**：状态化遍历器 (`Dfs` / `Bfs` / `Topo` / `Postorder`) 控制推进节奏；事件回调遍历 (`visit`) 用 `Control` 决定继续 / 剪枝 / 中止
- **零成本视图适配器**：`Reversed` / `Undirected` / `NodeFilter` / `EdgeFilter` 仅做 trait 转发，不复制底层数据，可任意嵌套
- **完整算法集**：拓扑排序、强连通分量 (Pearce 2016 / Kosaraju)、缩点、弱连通分量、DFS / BFS / 后序、可达性与祖先 / 后代、度数、Dijkstra / 双向 Dijkstra / A\* / Bellman-Ford / Floyd-Warshall 最短路、Prim / Kruskal 最小生成树、桥与割点、支配树、CSR 编译等
- **增量拓扑**：`IncrementalTopo` 订阅图事件；不破坏拓扑的变更走 O(1) 快路径，违反拓扑但无环走 Pearce-Kelly O(|δ|) 局部重排，遇环回退到延后的一次性全量重算
- **复合图层次**：`parent` / `children` / `setParent` 表达节点分组 / 子图折叠，环检测内建
- **紧凑序列化与结构化 diff**：元组压缩格式 (~60-70% 字节缩减)、拓扑稳定 ID 重映射、可应用 / 可撤销的图差异
- **变更事件**：基于 `@openconsole/signal` 的强类型 `nodeAdded` / `nodeDropped` / `nodeUpdated` / `edgeAdded` / `edgeDropped` / `edgeUpdated` 订阅
- **O(1) 节点寻址**：基于内部 `Registry` 的 `at` / `indexOf` / `bound`，删除走 swap-and-pop

## 在本仓库中使用

```json
{
  "dependencies": {
    "@openconsole/graph": "workspace:*"
  }
}
```

## 快速开始

```ts
import { Graph, Socket, Vertex, type GraphId, type NodeId } from '@openconsole/graph';

type AddIn = { lhs: Socket<'number'>; rhs: Socket<'number'> };
type AddOut = { sum: Socket<'number'> };
type Weight = { label: string };

const graph = new Graph<Weight, void>('demo' as GraphId);

const a = new Vertex<AddIn, AddOut, Weight>('a' as NodeId, { label: 'add' });
a.addInput('lhs', Socket.number);
a.addInput('rhs', Socket.number);
a.addOutput('sum', Socket.number);
graph.addNode(a);

const b = new Vertex<AddIn, AddOut, Weight>('b' as NodeId, { label: 'add' });
b.addInput('lhs', Socket.number);
b.addInput('rhs', Socket.number);
b.addOutput('sum', Socket.number);
graph.addNode(b);

graph.connect([a.id, 'sum'], [b.id, 'lhs']);

import { toposort, dijkstra, path } from '@openconsole/graph';

const order = toposort(graph);                       // NodeId[]
const tree = dijkstra(graph, a.id, undefined, () => 1); // Map<NodeId, { distance, predecessor }>
const route = path(tree, b.id);                      // NodeId[]，a → b 的最短路径
```

## 核心概念

### Socket

声明端口承载的数据类型，用于校验连接的兼容性。

```ts
Socket.number;   // 'number'
Socket.string;   // 'string'
Socket.boolean;  // 'boolean'
Socket.object;   // 'object'
Socket.array;    // 'array'
Socket.exec;     // 'exec'（纯执行流，不传数据）
Socket.any;      // '*'（与任意类型兼容）

const url = new Socket('url', [Socket.string]); // url <-> string 也兼容

Socket.number.matches(Socket.any); // true
```

### Vertex / Port (Input | Output)

`Vertex` 是图中的节点，携带类型化端口字典与任意权重载荷。端口是 `Input` 或 `Output` 实例，内部维护与之相连的边 ID 列表 — 邻接关系直接从端口派生，无中央缓存。

### Endpoint / Edge

`Edge` 是有向边，两端用 `Endpoint`（节点 + 端口）描述。`Graph.connect(from, to, options?)` 以 `[nodeId, portName]` 元组连接，创建边并触发 Socket 兼容性校验。

### Graph

主容器。继承自 `Model`（储存 + CRUD + 权重更新 + 事件 + 复合图）并补充查询层（邻接、边视图、度数、序列化）。

**计数与枚举**：`order`（节点数）/ `size`（边数）/ `nodes()`（NodeId 迭代）/ `edges()`（EdgeId 迭代）。

**邻居与边查询**：

| API                                     | 返回                       | 适用                       |
| --------------------------------------- | -------------------------- | -------------------------- |
| `inNeighbors` / `outNeighbors` / `neighbors` | `Iterable<NodeId>`（lazy） | 邻居遍历                   |
| `inEdges` / `outEdges` / `edgeViews`    | `Iterable<EdgeView>`（lazy）| 算法 / 适配器，跨 trait 复用 |
| `find` / `between` / `adjacent` / `endpoints` | `Edge` / `Edge[]` / `boolean` | 按端点查边                 |
| `node` / `edge` / `hasNode` / `hasEdge` | 实例 / `boolean`           | 按 ID 取实例 / 存在性       |

### 增删改与权重

```ts
graph.addNode(vertex);                  // 严格新增，重复抛 Duplicate
graph.mergeNode(vertex);                // upsert：存在则更新权重，否则加入；返回 added
graph.dropNode(id);                     // 删节点（级联删边、清理层次）
graph.connect([a, 'out'], [b, 'in']);   // 建边
graph.dropEdge(id);                     // 删边

graph.setNodeWeight(id, weight);        // 替换权重，触发 nodeUpdated
graph.updateNode(id, (w) => next);      // 函数式更新，触发 nodeUpdated
graph.setEdgeWeight(id, weight);        // 触发 edgeUpdated
graph.updateEdge(id, (w) => next);

graph.copy();        // 深拷贝（结构 + 权重 + 层次）
graph.emptyCopy();   // 同 id 的空图
graph.clearEdges();  // 仅清边，保留节点
```

## Trait（能力接口）

算法仅依赖如下 trait，可与任意自定义存储组合：

| Trait           | 能力                                                      |
| --------------- | --------------------------------------------------------- |
| `Catalog`       | 节点 / 边枚举与计数 (`order` / `size` / `nodes()` / `edges()`) |
| `Neighbors`     | 邻接查询 (`inNeighbors` / `outNeighbors` / `neighbors`)   |
| `IntoEdges<E>`  | 流式边视图 (`inEdges` / `outEdges` / `edgeViews`)         |
| `IntoDegree`    | 入度 / 出度查询                                           |
| `Walkable`      | 可遍历（`Catalog` + `Neighbors`）                         |
| `NodeIndexable` | O(1) `at(i)` / `indexOf(id)` / `bound()` 寻址             |
| `Hierarchy`     | 复合图层次 (`parent` / `children`)                        |
| `Subscribable`  | 增量算法的事件订阅（暴露 `signal`）                       |

## 算法

```ts
import {
  toposort, topology, cycles, isCyclic, ranks,
  scc, kosaraju, condensation, components,
  dfs, bfs, postorder,
  reachable, ancestors, descendants,
  degrees, sources, sinks, isolated,
  neighborhood,
  dijkstra, bidijkstra, astar, bellmanFord, floydWarshall, path, weighted,
  prim, kruskal,
  bridges, dominator,
  csr, Csr,
  IncrementalTopo,
} from '@openconsole/graph';
```

- **拓扑排序**：`toposort` / `topology` / `cycles` / `isCyclic` / `ranks`（Kahn 算法）
- **强连通分量**：`scc`（Pearce 2016，单 `Int32Array`）；`kosaraju`（两遍 DFS，第二遍在 `reversed` 视图上）
- **缩点 / 连通**：`condensation`（SCC 折叠为 DAG 描述）；`components`（弱连通分量）
- **遍历**：`dfs` / `bfs` / `postorder`
- **可达性**：`reachable`（双向 BFS）/ `ancestors` / `descendants`
- **度数**：`degrees` / `sources` / `sinks` / `isolated`；单节点用 `Graph` 的 `inDegree` / `outDegree` / `degree`
- **邻域**：`neighborhood` 一次性物化所有节点的 `{ predecessors, successors }` 快照
- **最短路**：`dijkstra`（非负权，配对堆 + decrease-key，返回 `{ distance, predecessor }`，配 `path` 重建路径）/ `bidijkstra`（双向）/ `astar`（启发式）/ `bellmanFord`（容许负权，负环抛 `Cycle`）/ `floydWarshall`（全源距离矩阵）
- **最小生成树**：`prim`（配对堆，单分量）/ `kruskal`（并查集，整图 / 森林）；均接受 `undirected(graph)` 视图
- **连通结构**：`bridges`（Tarjan 桥 + 割点）/ `dominator`（Lengauer-Tarjan 支配树）
- **CSR 编译**：`csr` / `Csr.compile` 把图压成 CSR typed-array 视图（实现 `Walkable` + `IntoDegree` + `NodeIndexable` + 带权 `IntoEdges`，结构冻结后可多次跑算法，最短路也能受益）
- **权重补全**：`weighted(edge, defaultWeight)`

### 最短路示例

```ts
import { dijkstra, bidijkstra, astar, bellmanFord, path } from '@openconsole/graph';

const cost = (edge: EdgeView<number>) => edge.weight ?? 1;

const tree = dijkstra(graph, start, undefined, cost); // Map<NodeId, { distance, predecessor }>
path(tree, end);                                      // NodeId[]，start → end
dijkstra(graph, start, end, cost);                    // 摸到 end 即提前终止
bidijkstra(graph, start, end, cost);                  // { distance, path } | undefined
astar(graph, start, end, cost, (n) => heuristic(n));  // 带启发函数
bellmanFord(graph, start, cost);                      // 容许负权；负环抛 Cycle
```

### 增量拓扑

```ts
import { Graph, IncrementalTopo, type GraphId } from '@openconsole/graph';

const graph = new Graph('g' as GraphId);
const topo = new IncrementalTopo(graph);

graph.addNode(a);
graph.addNode(b);
graph.connect([a.id, 'y'], [b.id, 'x']); // 满足拓扑，O(1)

topo.rank(a.id);   // 0
topo.sorted();     // [a.id, b.id]

graph.connect([b.id, 'y'], [a.id, 'x']); // 违反拓扑 → 标记 dirty
topo.hasCycle;     // true（查询时触发重算）

topo.dispose();    // 取消订阅
```

## 复合图（层次）

```ts
graph.setParent(child, group);   // 把 child 归入 group（环检测内建，自环 / 成环抛 Cycle）
graph.parent(child);             // group | undefined
[...graph.children(group)];      // [child, ...]
```

删除节点时，其子节点自动提升到被删节点的父层。

## 视图适配器（零成本）

适配器只做 trait 转发，不持有底层数据副本；适配后仍满足相同 trait，可层层嵌套。

```ts
import { reversed, undirected, NodeFilter, EdgeFilter, dfs, components } from '@openconsole/graph';

// 反向图：祖先遍历 / 反向拓扑 / Kosaraju 第二遍
const ancestorsOf = dfs(reversed(graph), target);

// 无向视图：弱连通分量 / 最小生成树 / 桥
const comps = components(graph);
const view = undirected(graph);

// 节点过滤
const onlyData = new NodeFilter(graph, (id) => graph.node(id)?.weight?.kind === 'data');

// 边过滤（需要 IntoEdges）
const heavy = new EdgeFilter(graph, (edge) => (edge.weight ?? 0) > 10);

// 嵌套：data 节点 + 反向
const nested = reversed(new NodeFilter(graph, isData));
```

> `reversed(graph)` / `undirected(graph)` 是工厂函数；边权重泛型自动从内层图推导。

## 访问者

```ts
import { Dfs, visit } from '@openconsole/graph';

// 1. 状态化遍历器：调用方控节奏
const it = Dfs.start(graph, root);
for (const id of it.iterator(graph)) { /* ... */ }
it.reset();
it.moveTo(another);

// 2. 事件回调遍历：回调收到 DfsEvent，返回 'continue' / 'prune' / 'break'
//    起点参数是 NodeId 的可迭代序列（或 null = 按 nodes() 全图扫描）
visit(graph, [root], {
  discover: (event) => (event.node === target ? 'break' : 'continue'),
  treeEdge: (event) => 'continue',
  backEdge: (event) => 'continue',   // 环检测点
  finish:   (event) => 'continue',
});
```

`Control` 是字符串联合类型 `'continue' | 'prune' | 'break'`。

## 序列化

```ts
import { pack, unpack, packRemap, unpackRemap, diff, apply, invert } from '@openconsole/graph';

// 紧凑序列化（约 60-70% 字节缩减）
const compact = pack(graph);
const restored = unpack(compact);

// 拓扑稳定 ID 重映射（长 UUID → 短整数，用于网络 / 持久化）
const { compact: remapped, remap } = packRemap(graph);
const round = unpackRemap({ compact: remapped, remap });

// 结构化 diff，可应用 / 可撤销
const ops = diff(before, after);
apply(target, ops);
apply(target, invert(ops));   // undo
```

`Graph.toJSON()` 输出纯对象快照（`JSON.stringify` 自动调用）。

## 变更事件

```ts
graph.signal.on('nodeAdded', ({ node }) => { /* ... */ });
graph.signal.on('nodeDropped', ({ node }) => { /* ... */ });
graph.signal.on('nodeUpdated', ({ node, before, after }) => { /* ... */ });
graph.signal.on('edgeAdded', ({ edge }) => { /* ... */ });
graph.signal.on('edgeDropped', ({ edge }) => { /* ... */ });
graph.signal.on('edgeUpdated', ({ edge, before, after }) => { /* ... */ });

// 任意事件（通配）
graph.signal.watch((type, payload) => { /* ... */ });
```

底层走 [`@openconsole/signal`](../signal/README.md)，支持 `AbortSignal` / `Symbol.dispose` / `once` / `rescue` 等能力。`Model.batch(work)` 可把一批 CRUD 产生的事件推迟到事务末尾统一派发。

## 模块边界

```
core/
├── types/        - 品牌 ID、Socket 字典、能力 trait、访问者事件（纯类型层）
├── classic/      - Socket / Port / Vertex / Endpoint / Edge / Model / Graph（运行时元模型）
├── algorithms/   - toposort / scc / dijkstra / mst / bridges / dominator / csr ...（仅依赖 trait）
├── visitors/     - Dfs / Bfs / Topo / Postorder 状态化遍历器 + visit 事件遍历
├── adapters/     - Reversed / Undirected / NodeFilter / EdgeFilter 零成本视图
├── serialize/    - pack / unpack / diff / remap 紧凑序列化
└── internal/     - 包内共享工具（入度计算、端口查找 / 序列化），不对外导出
```

`index.ts` 把 `core/*` 全量重导出，使用方统一从包名引入：

```ts
import { Graph, Socket, Vertex, toposort, dijkstra, reversed, undirected } from '@openconsole/graph';
```

## 设计要点

- **无中央邻接缓存**：邻接关系直接由端口的 `edges` 列表派生，结构变更立刻反映新状态，没有失效钩子
- **算法不挂在 Graph 上**：拓扑 / SCC / 最短路等通过 trait 解耦为独立函数，保持核心类轻、方便测试与组合
- **swap-and-pop 删除**：`dropNode` O(1) 但**会打乱节点索引顺序**，调用方不应依赖删除后的 `at(i)` 稳定性
- **方向通过参数传**：`neighbors(id, direction?)` 优于拆成两个方法 — 命名 trait 时也遵循该约定
- **无向用视图而非改模型**：端口天生有向；`undirected(graph)` 适配器为 `components` / `prim` / `kruskal` 等无向算法统一提供合并方向的视图

## 开发

```bash
pnpm --filter @openconsole/graph typecheck   # tsc --noEmit
```

## License

MIT
