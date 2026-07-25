# @openconsole/graph

类型化端口的有向图内核：整数索引存储、不可变快照、可中断的算法。

## 三层职责

| 层               | 负责       | 形态                                              |
| ---------------- | ---------- | ------------------------------------------------- |
| {@link Graph}    | 编辑       | 整数索引 + 平行数组，邻接是纯数组读取，变更走事件 |
| {@link Snapshot} | 计算的输入 | 不可变 CSR，全部数据在 typed-array 里             |
| {@link Task}     | 调度       | 分步推进，可中断、可续跑、可分帧                  |

算法只吃快照，不吃图。输入不可变带来三件事：长跑任务中断后恢复不会读到半改的图；快照能整份搬进
Worker；过滤 / 折叠 / 无向化在编译期一次做完，运行期没有任何谓词回调或视图转发的开销。

## 快速开始

```ts
import { Graph, graphId, nodeId, settle, shortestPath, Snapshot, Socket, toposort, Vertex, type Sockets } from "@openconsole/graph";

const graph = new Graph<string, number>(graphId("demo"));

for (const name of ["a", "b", "c"]) {
  graph.addNode(new Vertex<Sockets, Sockets, string>(nodeId(name), name).addInput("in", Socket.number).addOutput("out", Socket.number));
}
graph.connect([nodeId("a"), "out"], [nodeId("b"), "in"], { weight: 3 });
graph.connect([nodeId("b"), "out"], [nodeId("c"), "in"], { weight: 4 });

const snapshot = Snapshot.of(graph, { weight: (edge) => edge.weight ?? 1 });

settle(toposort(snapshot)); // [a, b, c]
settle(shortestPath(snapshot, nodeId("a"), nodeId("c"))); // { distance: 7, path: [a, b, c] }
```

## Graph：编辑层

节点与边都以整数索引寻址，属性存在平行数组里。删除只在索引位上留空并进入自由表，
**已发出的索引永不改指**——外部持有的下标不会静默指向别的节点。空位由 `compact()` 显式回收。

```ts
graph.addNode(spec); // 返回 NodeId，重复抛 Duplicate
graph.mergeNode(spec); // upsert，新增返回 true
graph.dropNode(id); // 级联删边、子节点提升到祖父
graph.connect(from, to, options); // 返回 EdgeId
graph.disconnect(edge);

graph.weightOf(id); // 零分配读权重
graph.updateNode(id, (w) => next);
graph.setEdgeWeight(edge, w);

graph.outNeighbors(id); // 数组，可重复遍历
graph.outEdges(id);
graph.between(a, b); // 全部平行边
graph.outDegree(id);
graph.forEachOut(id, (target, edge) => {}); // 零分配，返回 false 提前停止
graph.forEachNode((id, weight) => {}); // 按存储顺序，不经 id 查表
graph.forEachEdge((record) => {});

graph.setParent(child, group); // 复合层级，内建环检测
graph.batch(work); // 事务：事件推迟到最外层结束统一派发
graph.compact(); // 回收空位并重新稠密编号
graph.copy() / graph.subgraph(keep) / graph.union(other);
```

### 节点与端口是声明，不是状态

`Vertex` 是节点模板，`Port` 是不可变的端口声明——两者都不持有任何连接状态，边由图独家持有。
因此同一个模板可以复用去建多个节点、用在多张图上，也不存在"跨图共享导致度数互相污染"这回事。

```ts
const template = new Vertex<Sockets, Sockets, string>(nodeId("a")).addInput("lhs", Socket.number, { multiple: false, required: true, fallback: 0 }).addOutput("sum", Socket.number);

graph.addNode(template); // 按值拷入，之后改模板不影响图
```

`connect` 会校验端口存在、Socket 兼容（`Mismatch`）、单连接容量（`Capacity`）。

## Snapshot：计算的输入

```ts
const snapshot = Snapshot.of(graph, {
  weight: (edge) => edge.weight ?? 1, // 带权编译，省略则每条边按 1 计
  node: (id, weight) => keep(id), // 节点过滤
  edge: (edge) => (edge.weight ?? 0) > 5, // 边过滤
  collapse: [groupId], // 把分组折叠成单节点
  undirected: true, // 每条边在两端各出现一次
  outbound: true, // 只编译出向，省一半内存与时间
});

snapshot.reverse(); // O(1)，与原快照共享底层数组
snapshot.verify(); // 源图已变更则抛 Stale
```

以前需要嵌套视图适配器（`reversed(new NodeFilter(g, p))`）的场景，现在是一次编译的几个选项。
代价是编译要 O(V+E)，收益是运行期零开销、且不再有"视图上 `order` 是 O(V)"这类陷阱。

出向与入向各是一个 `Adjacency`（`offset` / `other` / `edge` 三条数组绑在一起），
所以"有没有入向"是一次判断而不是三个各自可空的字段。

### 跨线程

快照的 `data` 只含 typed-array 与字符串数组，可以直接 `postMessage`：

```ts
worker.postMessage(snapshot.data);
// Worker 侧
const snapshot = Snapshot.from(data);
settle(scc(snapshot));
```

## Task：中断 / 分步 / 恢复

所有 O(V+E) 及以上的算法都返回 `Task`，中间状态全在实例上，因此随时可停、可续。

```ts
settle(task); // 同步跑完
settle(task, signal); // 受 AbortSignal 中断，抛 Interrupted
await schedule(task, { budget: 2048, signal, onProgress }); // 分帧推进，不冻结 UI

task.advance(100); // 手动推进 100 步，返回 false 表示已跑完
task.progress; // 0..1
task.settled;
task.result(); // 未跑完抛 Incomplete——中间态一律不对外
```

中断不丢现场：

```ts
try {
  settle(task, signal);
} catch (error) {
  if (error instanceof Interrupted) {
    // 任务停在原处，换个时机继续跑就是了
    const answer = settle(task);
  }
}
```

组合器：`ready(value)` / `chain(first, next)` / `transform(task, convert)`，中断点贯穿组合后的全程。

## 算法

```ts
import { acyclic, ancestors, astar, bellmanFord, bfs, bidirectional, bottleneck, closure, components, condensation, criticalPath, cuts, degrees, descendants, dfs, dominators, floydWarshall, generations, isolated, kruskal, levels, neighborhood, Ordering, postorder, prim, ranks, reachable, reduction, scc, shortestPath, shortestPaths, simpleCycles, sinks, sources, topology, toposort, trace, visit } from "@openconsole/graph";
```

- **拓扑**：`topology`（环单列出来）/ `toposort`（遇环抛 `Cycle`）/ `acyclic` / `ranks` / `generations`（分层，同层可并行）/ `criticalPath`
- **连通**：`components`（弱）/ `scc`（Pearce 2016）/ `condensation` / `simpleCycles`（Johnson）/ `cuts`（桥与割点）/ `dominators`（Lengauer-Tarjan）
- **可达**：`reachable`（双向 BFS）/ `ancestors` / `descendants` / `closure`（按 SCC 存位图）/ `reduction`
- **最短路**：`shortestPaths`（单源全树）/ `shortestPath`（单条）/ `astar` / `bidirectional` / `bellmanFord`（容许负权）/ `floydWarshall`（全源）
- **生成森林**：`prim` / `kruskal`
- **遍历**：`dfs` / `bfs`（生成器）/ `postorder` / `levels` / `visit`（事件式，带边分类）
- **查询**：`degrees` / `sources` / `sinks` / `isolated` / `neighborhood` / `roots` / `subtree` / `ancestry`
- **增量**：`Ordering`（Pearce-Kelly 增量拓扑序）

### 提前终止不泄漏未收敛的值

`shortestPath` 摸到终点即停，因此它**只**返回那一条路线，不给路径树——类型上就杜绝了
"读提前终止时其他节点的距离"这种误用。需要全树就用 `shortestPaths`，它会跑完整个搜索。

### 权重语义可换

Dijkstra 的贪心只要求 `combine(total, step) >= total`，满足这一点的语义共用同一份实现：

```ts
settle(shortestPaths(snapshot, source)); // 默认 sum：常规最短路
settle(shortestPaths(snapshot, source, { combine: bottleneck })); // 最大边权最小的路线
```

### 增量拓扑序

`Ordering` 订阅图事件就地重排。成环的边不触发重算，而是记入 `conflicts` 并排除在拓扑约束外——
剩下的子图始终是 DAG，顺序始终有效，因此"编辑器里长期带环"不会让每次变更都退化成 O(V+E)。

```ts
const ordering = new Ordering(graph);
ordering.rank(node);
ordering.sorted();
ordering.cyclic; // O(1)
ordering.cycles(); // 按需 O(V+E)
ordering.dispose();
```

## 序列化

```ts
const bundle = pack(graph); // 元组化紧凑格式
const bundle = pack(graph, { intern: true, order: toposorted }); // 短 id + 稳定顺序
const restored = unpack<N, E>(bundle);

const changes = diff(before, after); // 结构化差异
apply(graph, changes);
apply(graph, invert(changes)); // 撤销
```

`Compact<N, E>` 带权重泛型，因此还原时不需要任何类型断言。端口结构变了的节点按"删除 + 重建"
处理；边 id 会被自由表回收复用，所以 `diff` 判定"是不是同一条边"时除了 id 还比端点。

## 事件

```ts
graph.signal.on("nodeAdded", ({ node }) => {});
graph.signal.on("edgeDropped", ({ edge, source, target, weight }) => {});
graph.signal.on("parentChanged", ({ node, before, after }) => {});
graph.signal.watch((type, payload) => {});
```

七类事件：`nodeAdded` / `nodeDropped` / `nodeUpdated` / `edgeAdded` / `edgeDropped` /
`edgeUpdated` / `parentChanged`。载荷是值快照而非活对象，因此在事务里缓冲、稍后派发也不会
读到已失效的状态。`clear()` 走删除原语，订阅者不会与图失同步。

## 性能

`pnpm --filter @openconsole/graph bench`，V=5000 / E=39992 的随机 DAG：

| 操作                          | 均值    |
| ----------------------------- | ------- |
| 全图邻接遍历 — `outNeighbors` | 0.22 ms |
| 全图邻接遍历 — `forEachOut`   | 0.27 ms |
| 全图邻接遍历 — 快照 CSR 直读  | 0.04 ms |
| `Snapshot.of` 双向带权        | 5.41 ms |
| `Snapshot.of` 单向带权        | 4.82 ms |
| `toposort`                    | 0.29 ms |
| `components`                  | 0.33 ms |
| `scc`                         | 0.40 ms |
| `shortestPaths`               | 0.39 ms |

**编译一次约等于 15–20 次算法运行**，所以这套架构的适用形态是「批量编辑 → 编译一次 → 跑一批算法」。
只跑单个算法且图频繁变动时，编译会占掉绝大部分时间——这是"算法只有一套实现"换来的确定性代价，
用 `outbound: true` 可以省掉其中约 15%。

`forEachOut` 比 `outNeighbors` 略慢是因为它额外解析了边 id；它的价值是拿边 id 时不分配数组，
不是比取邻居更快。

## 模块边界

```
core/
├── ident / error / event      品牌 id、错误体系、事件类型
├── socket / vertex            Socket 类型系统、节点模板与端口声明（无状态）
├── slots                      稳定索引分配器，节点与边共用
├── graph                      编辑层：存储 + CRUD + 层级 + 事务 + 事件
├── snapshot                   不可变 CSR + 编译期视图
├── task                       Task / settle / schedule / 组合器
├── algorithm/                 只吃快照，每个算法一套实现
└── serialize/                 紧凑格式与结构化差异
```

依赖单向收敛：`algorithm/` 只认 `Snapshot` 与 `Task`；`serialize/` 是唯一同时依赖 `Graph`
与格式定义的层；`slots` 谁都不认。

## 设计要点

- **可变与不可变分家**：编辑走 `Graph`，计算走 `Snapshot`。算法因此只有一套实现，不存在
  "通用版 + 编译版"两条需要同步维护的代码路径。
- **视图是编译选项，不是运行期包装**：过滤 / 折叠 / 无向化一次做完，运行期零开销。
- **删除后索引稳定**：自由表复用空位，已发出的下标永不改指；要回收空位就显式 `compact()`。
- **不可变在类型层面成立**：快照暴露的是只读的 `Ints` / `Reals`，不是可写的 typed-array。
- **索引访问契约收在一处**：`at()` 供外部查询（越界返回 `undefined`），`label()` / `key()`
  供内部遍历（越界即程序错误），因此算法里没有一处非空断言。
- **中间态不对外**：`result()` 在跑完之前抛 `Incomplete`，提前终止的接口不返回全量结构。
- **端口是声明**：`Vertex` / `Port` 无状态，可复用、可跨图，没有"节点被图独占"这类限制。

## 开发

```bash
pnpm --filter @openconsole/graph test        # vitest run
pnpm --filter @openconsole/graph typecheck   # tsc --noEmit
pnpm --filter @openconsole/graph bench       # vitest bench --run
pnpm --filter @openconsole/graph doc         # typedoc
```

测试以 property-based 对拍为主：随机图上把 `scc` / `toposort` / `dijkstra` / `dominators` /
`cuts` / `closure` 的结果与各自独立的朴素实现逐一比对，覆盖 Task 的中断续跑、快照的编译选项与
跨线程还原、序列化往返与撤销。

## License

MIT
