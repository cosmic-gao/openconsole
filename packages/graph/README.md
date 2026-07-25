# @openconsole/graph

类型化端口、Trait 解耦、零成本视图与紧凑序列化的有向图核心模型。

## 特性

- **类型化端口模型**：`Vertex` 携带强类型 `Inputs` / `Outputs`；`Socket` 描述端口数据类型并校验边连接的兼容性；端口可声明连接重数 / 必填 / 默认值约束
- **Trait 与存储解耦**：算法仅依赖 `Catalog` / `Neighbors` / `IntoEdges` / `Walkable` / `Hierarchy` 等能力接口，与具体存储无关
- **两种访问者风格**：状态化遍历器 (`Dfs` / `Bfs` / `Topo` / `Postorder`) 控制推进节奏；事件回调遍历 (`visit`) 用 `Control` 决定继续 / 剪枝 / 中止
- **零成本视图适配器**：`reversed` / `undirected` / `collapse` / `NodeFilter` / `EdgeFilter` 仅做 trait 转发，不复制底层数据，可任意嵌套
- **完整算法集**：拓扑排序与分层、关键路径、强 / 弱连通分量、缩点、环枚举、传递闭包 / 归约、DFS / BFS / 后序、可达性、度数、Dijkstra / 双向 Dijkstra / A\* / Bellman-Ford / Floyd-Warshall 最短路、Prim / Kruskal 最小生成森林、桥与割点、支配树
- **CSR 热路径**：`csr` 把结构冻结的图编译为 typed-array 快照，`sssp` 在整数下标空间跑原生 Dijkstra（零 `EdgeView` 分配），`bfsLevels` 走 Beamer 方向优化 BFS
- **增量拓扑**：`IncrementalTopo` 订阅图事件，不破坏拓扑的变更走 O(1) 快路径，违反但无环走 Pearce-Kelly 局部重排，遇环延后全量重算
- **复合图层次**：`parent` / `children` / `setParent` 表达节点分组 / 子图，配套层次遍历与折叠视图
- **紧凑序列化与结构化 diff**：元组压缩格式 (~60-70% 字节缩减，守恒端口约束与复合层次)、拓扑稳定 ID 重映射、可应用 / 可撤销的图差异
- **变更事件**：基于 `@openconsole/signal` 的强类型 `nodeAdded` / `nodeDropped` / `nodeUpdated` / `edgeAdded` / `edgeDropped` / `edgeUpdated`
- **O(1) 节点寻址**：`at` / `indexOf` / `bound`；`Graph` 删除走 swap-and-pop（下标会移动），`StableGraph` 走 free-list 空位复用（下标永不移动）
- **完整 TSDoc**：公共 API 带中文文档注释，支持 `typedoc` 生成 + IDE 悬浮提示

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
import { dijkstra, Graph, path, Socket, toposort, Vertex, type GraphId, type NodeId } from "@openconsole/graph";

type AddIn = { lhs: Socket<"number">; rhs: Socket<"number"> };
type AddOut = { sum: Socket<"number"> };
type Weight = { label: string };

const graph = new Graph<Weight, void>("demo" as GraphId);

const a = new Vertex<AddIn, AddOut, Weight>("a" as NodeId, { label: "add" });
a.addInput("lhs", Socket.number);
a.addInput("rhs", Socket.number);
a.addOutput("sum", Socket.number);
graph.addNode(a);

const b = new Vertex<AddIn, AddOut, Weight>("b" as NodeId, { label: "add" });
b.addInput("lhs", Socket.number);
b.addInput("rhs", Socket.number);
b.addOutput("sum", Socket.number);
graph.addNode(b);

graph.connect([a.id, "sum"], [b.id, "lhs"]);

const order = toposort(graph); // NodeId[]
const tree = dijkstra(graph, a.id, undefined, () => 1); // Map<NodeId, { distance, predecessor }>
const route = path(tree, b.id); // a → b 的最短路径
```

## 核心概念

### Socket

声明端口承载的数据类型，用于校验连接的兼容性。

```ts
Socket.number; // "number"
Socket.string; // "string"
Socket.boolean; // "boolean"
Socket.object; // "object"
Socket.array; // "array"
Socket.exec; // "exec"（纯执行流，不传数据）
Socket.any; // "*"（与任意类型兼容）

const url = new Socket("url", [Socket.string]); // url <-> string 也兼容
Socket.number.matches(Socket.any); // true
```

### Vertex / Port

`Vertex` 是节点，携带类型化端口字典与任意权重载荷。端口是 `Input` / `Output` 实例，自持与之相连的边 ID 列表——邻接关系直接从端口派生，无中央缓存。

端口可在 `addInput` / `addOutput` 时声明约束：

```ts
node.addInput("lhs", Socket.number, {
  multiple: false, // 单连接（默认 true 允许多连）；违反时 connect 抛 Capacity
  required: true, // 标记必填（声明性元数据）
  fallback: 0, // 未连接时的默认值（声明性元数据）
});
```

> `multiple` 默认 `true`（不限制连接数）。仅在声明 `multiple: false` 时，向已连接的端口再次连边会抛 `Capacity`。

端口自持边表，因此改动端口结构前必须先断开边——移除或覆盖仍连着边的端口会抛 `Attached`：

```ts
node.removeInput("lhs"); // 该端口仍有边 → 抛 Attached
node.addInput("lhs", Socket.string); // 覆盖仍有边的同名端口 → 抛 Attached

graph.dropEdge(edgeId); // 先断边
node.removeInput("lhs"); // → true
```

### Endpoint / Edge

`Edge` 是有向边，两端用 `Endpoint`（节点 + 端口）描述。`connect(from, to, options?)` 以 `[nodeId, portName]` 元组连接，创建边并触发 Socket 兼容性与端口约束校验。

### Graph

主容器，继承自 `Model`（存储 + CRUD + 权重事件 + 复合图 + 事务）并补充查询层。

**计数与枚举**：`order`（节点数）/ `size`（边数）/ `nodes()` / `edges()`。

**增删改与权重**：

```ts
graph.addNode(vertex); // 严格新增，重复抛 Duplicate；vertex 端口带边抛 Attached
graph.mergeNode(vertex); // upsert：存在则更新权重，否则加入；返回 added
graph.dropNode(id); // 删节点（级联删边、清空其端口、清理层次）
graph.connect([a, "out"], [b, "in"]); // 建边
graph.dropEdge(id);

graph.setNodeWeight(id, w); // 触发 nodeUpdated
graph.updateNode(id, (w) => next); // 函数式更新
graph.setEdgeWeight(id, w); // 触发 edgeUpdated
graph.updateEdge(id, (w) => next);

graph.node(id); // 取节点实例
graph.edge(id); // 取边实例
graph.copy(); // 深拷贝（结构 + 权重 + 层次）
graph.subgraph(nodeIds); // 诱导子图（两端都在集合内的边）
graph.union(other); // 并图（重复以本图为准）
graph.emptyCopy();
graph.clear(); // 清空全图，派发全部 dropped 事件
graph.clearEdges(); // 只清边，派发 edgeDropped
```

> **节点由图独占**：`addNode` 直接持有传入的 `Vertex`（不复制），而邻接关系存在端口的边表里——同一实例被两个图共享会让双方度数互相污染，故带连边的 `Vertex` 一律拒绝（抛 `Attached`）。`dropNode` 会清空被删节点的端口，因此"摘出来再放回去"是合法路径。跨图复制请用 `copy` / `subgraph` / `union`，它们会重建端口。

**邻居与边查询**（lazy）：`inNeighbors` / `outNeighbors` / `neighbors`、`inEdges` / `outEdges` / `edgeViews`；`find` / `between` / `adjacent` / `endpoints`；度数 `inDegree` / `outDegree` / `degree`。

## Trait（能力接口）

| Trait           | 能力                                                           |
| --------------- | -------------------------------------------------------------- |
| `Catalog`       | 节点 / 边枚举与计数 (`order` / `size` / `nodes()` / `edges()`) |
| `Neighbors`     | 邻接查询 (`inNeighbors` / `outNeighbors` / `neighbors`)        |
| `IntoEdges<E>`  | 流式边视图 (`inEdges` / `outEdges` / `edgeViews`)              |
| `IntoDegree`    | 入度 / 出度查询                                                |
| `Walkable`      | 可遍历（`Catalog` + `Neighbors`）                              |
| `NodeIndexable` | O(1) `at(i)` / `indexOf(id)` / `bound()` 寻址                  |
| `Hierarchy`     | 复合图层次 (`parent` / `children`)                             |
| `Subscribable`  | 增量算法的事件订阅（暴露 `signal`）                            |

## 算法

```ts
import { ancestors, ancestry, astar, bellmanFord, bfs, bfsLevels, bidijkstra, bridges, components, condensation, criticalPath, csr, Csr, csrPath, cycles, degrees, descendants, dfs, dijkstra, dominator, floydWarshall, generations, IncrementalTopo, isCyclic, isolated, kruskal, neighborhood, path, postorder, prim, ranks, reachable, roots, scc, simpleCycles, sinks, sources, sssp, subtree, topology, toposort, transitiveClosure, transitiveReduction } from "@openconsole/graph";
```

- **拓扑**：`toposort` / `topology` / `cycles` / `isCyclic` / `ranks`（Kahn）；`generations`（拓扑分层，同层可并行）
- **关键路径**：`criticalPath`（DAG 最长路，返回 `{ path, length }`）
- **强连通**：`scc`（Pearce 2016 迭代实现，分量按逆拓扑序返回）；`condensation`（缩点为 DAG）
- **弱连通**：`components`
- **环枚举**：`simpleCycles`（Johnson，枚举所有简单环）
- **遍历**：`dfs` / `bfs` / `postorder`
- **可达 / 传递**：`reachable`（双向 BFS）/ `ancestors` / `descendants`；`transitiveClosure` / `transitiveReduction`（缩点 + 位图单遍传播）
- **度数 / 邻域**：`degrees` / `sources` / `sinks` / `isolated` / `neighborhood`
- **层次**：`roots`（顶层节点）/ `subtree`（子树）/ `ancestry`（祖先链）
- **最短路**：`dijkstra`（非负权，返回 `{ distance, predecessor }`，配 `path` 重建）/ `bidijkstra` / `astar` / `bellmanFord`（容许负权，负环抛 `Cycle`）/ `floydWarshall`（全源，负环抛 `Cycle`）
- **最小生成森林**：`prim` / `kruskal`（均接受 `undirected(graph)` 视图）
- **连通结构**：`bridges`（桥 + 割点）/ `dominator`（Lengauer-Tarjan 支配树）
- **CSR 编译**：`csr` / `Csr.compile`（typed-array 视图，结构冻结后多次跑算法；带权 `IntoEdges` 让最短路也能受益）
- **CSR 原生算法**：`sssp`（整数下标空间的 Dijkstra，配 `csrPath` 重建路径）/ `bfsLevels`（Beamer 方向优化多源 BFS，返回层级数组）
- **增量拓扑**：`IncrementalTopo`

> `transitiveClosure` 返回的是真正的可达集：环上节点（含自环）**包含自身**，无环节点不含自身。只需"后代"语义时用 `descendants`。

### 最短路示例

```ts
const cost = (edge: EdgeView<number>) => edge.weight ?? 1;

const tree = dijkstra(graph, start, undefined, cost); // 到所有可达节点
path(tree, end); // start → end 路径；传 end 时 dijkstra 摸到即提前返回
bidijkstra(graph, start, end, cost); // { distance, path } | undefined
astar(graph, start, end, cost, (n) => heuristic(n));
bellmanFord(graph, start, cost); // 容许负权；负环抛 Cycle
floydWarshall(graph, cost); // Map<NodeId, Map<NodeId, number>>
```

### CSR 热路径示例

结构冻结后编译一次，在同一快照上反复跑算法——距离与前驱都在整数下标空间，无对象分配、无字符串哈希。

```ts
import { bfsLevels, csr, csrPath, sssp } from "@openconsole/graph";

const compiled = csr(graph, (from, to) => weightOf(from, to)); // 带权编译

const tree = sssp(compiled, start); // { dist: Float64Array, prev: Int32Array }
tree.dist[compiled.indexOf(end)]; // 下标即节点索引，不可达为 Infinity
csrPath(compiled, tree, end); // NodeId[]，不可达返回 []

bfsLevels(compiled, [a, b]); // Int32Array 层级（多源，不可达为 -1）
```

> `Csr` 自身实现了 `Walkable` / `IntoDegree` / `NodeIndexable` / `IntoEdges<number>`，可直接喂给通用算法。注意其 `EdgeView.id` 是合成 id（`e{k}` / `i{k}`），**不对应原图 `EdgeId`**；`weight` 按 `(from, to)` 求值，无法区分平行边。

## 复合图（层次）

```ts
import { ancestry, collapse, roots, subtree } from "@openconsole/graph";

graph.setParent(child, group); // 归入分组（环检测内建）
graph.parent(child); // group | undefined
[...graph.children(group)]; // 直接子节点
graph.unparent(child); // 解除父子关系

roots(graph); // 所有顶层节点（无父）
subtree(graph, group); // group 子树全部节点（含自身）
ancestry(graph, child); // child 的祖先链（自底向上）

// 折叠视图：把 group 当单节点、聚合跨层边，输出仍是合法 Walkable，可喂给任何算法
const folded = collapse(graph, [group]);
toposort(folded);
```

删除节点时，其子节点会自动提升到被删节点的父层。

## 视图适配器（零成本）

适配器只做 trait 转发，不持有底层数据副本；适配后仍满足相同 trait，可层层嵌套。

```ts
import { components, dfs, EdgeFilter, NodeFilter, reversed, undirected } from "@openconsole/graph";

const ancestorsOf = dfs(reversed(graph), target); // 反向图：祖先遍历 / 反向拓扑
const comps = components(graph); // 内部用 undirected 视图
const onlyData = new NodeFilter(graph, (id) => graph.node(id)?.weight?.kind === "data");
const heavy = new EdgeFilter(graph, (edge) => (edge.weight ?? 0) > 10);
const view = reversed(new NodeFilter(graph, isData)); // 可嵌套
```

> `reversed` / `undirected` / `collapse` 均为工厂函数，边权重泛型自动从内层图推导。

## 访问者

```ts
import { Dfs, visit } from "@openconsole/graph";

// 1. 状态化遍历器：调用方控节奏
const it = Dfs.start(graph, root);
for (const id of it.iterator(graph)) {
  /* ... */
}

// 2. 事件回调遍历：回调返回 "continue" / "prune" / "break"
//    起点为 NodeId 序列，或 null = 按 nodes() 全图扫描
visit(graph, [root], {
  discover: (event) => (event.node === target ? "break" : "continue"),
  backEdge: (event) => "continue", // 环检测点
});
```

`Topo` 额外提供一次性消费：`Topo.start(graph).collect(graph, onCycle?)` 直接返回 `{ order, cycles }`，`toposort` / `topology` 就是它的两层封装（分别把 `onCycle` 定为抛错与原样追加）。

## 序列化

```ts
import { apply, diff, invert, pack, packRemap, unpack, unpackRemap } from "@openconsole/graph";

const compact = pack(graph); // 紧凑格式（含端口约束与复合层次）
const restored = unpack(compact);

const { compact: remapped, remap } = packRemap(graph); // 长 UUID → 短整数
const round = unpackRemap({ compact: remapped, remap });

const ops = diff(before, after); // 结构化差异（节点 / 边 / 权重 / 端口结构 / 层次变更）
apply(target, ops);
apply(target, invert(ops)); // undo
```

`Graph.toJSON()` 输出纯对象快照（含层次与端口约束）；`compressionRatio(graph)` 估算压缩率。

## 变更事件

```ts
graph.signal.on("nodeAdded", ({ node }) => {});
graph.signal.on("nodeDropped", ({ node }) => {});
graph.signal.on("nodeUpdated", ({ node, before, after }) => {});
graph.signal.on("edgeAdded", ({ edge }) => {});
graph.signal.on("edgeDropped", ({ edge }) => {});
graph.signal.on("edgeUpdated", ({ edge, before, after }) => {});
graph.signal.watch((type, payload) => {}); // 通配
```

底层走 [`@openconsole/signal`](../signal/README.md)，支持 `AbortSignal` / `Symbol.dispose` / `once` / `rescue`。`Model.batch(work)` 把一批 CRUD 事件推迟到事务末尾统一派发。

`clear()` / `clearEdges()` 走 `dropNode` / `dropEdge` 原语，会派发完整的 dropped 事件（合并在一个事务里），因此 `IncrementalTopo` 等订阅者不会与图失同步。层级变更（`setParent` / `unparent`）不派发事件，需要时用 `diff` 捕获。

## 模块边界

```
core/
├── types/        - 品牌 ID、Socket 字典、能力 trait、事件、序列化形态（纯类型层）
├── model/        - Socket / Port / Vertex / Endpoint / Edge / Model / Graph / StableGraph（运行时元模型）
├── traverse/     - Dfs / Bfs / Topo / Postorder 遍历器 + visit 事件遍历
├── view/         - reversed / undirected / collapse / NodeFilter / EdgeFilter 零成本视图
│                  （Forwarding 基类统一转发节点集合与下标寻址）
├── algorithms/   - 仅依赖 trait，按职责分组：
│   ├── traversal.ts   dfs / bfs / postorder
│   ├── topology/      toposort / generations / criticalPath / IncrementalTopo
│   ├── connectivity/  components / scc / condensation / simpleCycles / bridges / dominator
│   ├── path/          dijkstra / bidijkstra / astar / bellmanFord / floydWarshall
│   ├── spanning.ts    prim / kruskal
│   ├── query/         degrees / neighborhood / hierarchy / reachable / transitive
│   └── compiled/      csr / sssp / bfsLevels（CSR 快照上的原生实现）
├── serialize/    - pack / unpack / remap / diff 紧凑序列化
│                  （kernel 提供打包/还原内核，pack 与 packRemap 只差一层 id 映射）
└── support/      - 包内共享支撑：能力探测、节点索引、端口与 JSON 导出（不对外导出）
```

依赖方向单向收敛：`view/` 只认 trait（完全不知道 `Graph` 存在），`algorithms/` 只在抛错时反向引用 `model/` 的错误类，`serialize/` 是唯一同时依赖具体类与算法的层。

## 设计要点

- **无中央邻接缓存**：邻接关系直接由端口的边列表派生，结构变更立刻反映，无失效钩子
- **算法不挂在 Graph 上**：通过 trait 解耦为独立函数，核心类轻、易测试与组合
- **节点由图独占**：端口自持边表，跨图共享同一 `Vertex` 会污染双方度数，故带连边的节点不能加入图、仍连边的端口不能移除或覆盖（均抛 `Attached`）
- **删除后的下标语义二选一**：`Graph` 走 swap-and-pop（O(1) 但**会打乱下标**），需要长期持有下标引用时用 `StableGraph`（free-list 空位复用，`at(i)` 稳定，代价是 `bound()` 计入空位、`at()` 可能返回 `undefined`）
- **能力探测统一在一处**：trait 是可选实现，视图与算法运行时嗅探（`hasEdges` / `hasDegree` / `hasIndex`），命中走直通快路径、否则退化通用实现，两条路结果一致
- **无向用视图而非改模型**：端口天生有向；`undirected(graph)` 为 `components` / `prim` / `kruskal` 等无向算法统一提供合并方向的视图
- **热路径用 CSR**：端口模型的邻接查询有一层边解引用开销；结构冻结后用 `csr(graph)` 编译为 typed-array 视图再跑算法
- **视图上的计数不是 O(1)**：`NodeFilter.order` / `EdgeFilter.size` / `Collapsed.order` 都是遍历实现，别放进循环条件里

## 开发

```bash
pnpm --filter @openconsole/graph typecheck   # tsc --noEmit
pnpm --filter @openconsole/graph doc         # typedoc 生成 API 文档
```

基准（`tests/agroup.bench.ts`，V=5000 / E≈40000，`vitest bench` 运行）：

```bash
pnpm --filter @openconsole/graph exec vitest bench --run
```

同一张图上单源最短路，CSR 原生 `sssp` 比 `Graph` 上的稠密快路快 **9.7x**、比通用 Map/Set 实现快 **13.4x**；但一次 CSR 编译的成本约等于 3.5 次 `Graph` 上的 Dijkstra——**编译一次多次查询才划算**。

## License

MIT
