# @openconsole/graph

类型化端口的有向图内核：整数索引存储、不可变 CSR、可中断的算法。

## 三层职责

| 层                | 负责       | 形态                                              |
| ----------------- | ---------- | ------------------------------------------------- |
| {@link Graph}     | 编辑       | 整数索引 + 平行数组，邻接是纯数组读取，变更走事件 |
| {@link Snapshot}  | 计算的输入 | 不可变 CSR，全部数据在 typed-array 里             |
| {@link Structure} | 算法的契约 | 五个只读字段，谁都能实现                          |
| {@link Task}      | 调度       | 分步推进，可中断、可续跑、可分帧                  |

算法只吃 `Structure`，不吃图。输入不可变带来三件事：长跑任务中断后恢复不会读到半改的图；快照能整份搬进
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

const snapshot = Snapshot.of(graph, { weight: (weight) => weight ?? 1 });

// 算法在索引空间里进出，名字在边界上换。
settle(toposort(snapshot)); // Int32Array [0, 1, 2]
snapshot.names(settle(toposort(snapshot))); // [a, b, c]

const route = settle(shortestPath(snapshot, snapshot.indexOf(nodeId("a")), snapshot.indexOf(nodeId("c"))));
route; // { distance: 7, path: Int32Array [0, 1, 2] }
```

**为什么算法收发的是索引而不是 id**：索引就是数组下标，结果可以直接落在 `Int32Array` 里；换成
`NodeId` 就得为每个节点各付一次字符串哈希，还会在「索引 → 名字 → 查回索引」之间反复往返。
边界上一次 `names()` / `indexOf()` 就够了。

## Structure：算法的唯一契约

```ts
interface Structure {
  readonly order: number;
  readonly size: number;
  readonly outbound: Adjacency; // { offset, other, edge }
  readonly inbound: Adjacency | undefined;
  readonly weight: Reals | undefined; // 省略即每条边按 1 计
}
```

五个只读字段，全是纯数据。凡是能凑出这五样的东西都能跑全套算法——不必先塞进 `Graph` 再编译：

```ts
const chain: Structure = {
  order: 3,
  size: 2,
  outbound: { offset: Int32Array.of(0, 1, 2, 2), other: Int32Array.of(1, 2), edge: Int32Array.of(0, 1) },
  inbound: { offset: Int32Array.of(0, 0, 1, 2), other: Int32Array.of(0, 1), edge: Int32Array.of(0, 1) },
  weight: Float64Array.of(3, 4),
};
settle(shortestPath(chain, 0, 2)); // { distance: 7, path: [0, 1, 2] }
```

`Adjacency` 的字段类型是只读接口 `Ints` / `Reals` 而非 `Int32Array` 本身，所以
SharedArrayBuffer 背书的数组、WASM 导出的内存视图、按需生成的惰性代理都能直接顶上。
`Snapshot` 只是这个接口的默认实现，额外提供索引 ↔ id 的标签层。

配套的自由函数对任何实现都成立：`reversed(structure)`（O(1) 翻转，共享底层数组）、
`merged(structure)`、`outDegree` / `inDegree`、`costOf`。

## Graph：编辑层

节点与边都以整数索引寻址，属性存在平行数组里。删除只在索引位上留空并进入自由表，
**已发出的索引永不改指**——外部持有的下标不会静默指向别的节点。空位由 `compact()` 显式回收，
回收时派发 `compacted`（带旧 → 新映射），持有索引的订阅者据此重映射。

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
graph.forEachOut(id, (target, edge, port) => {}); // 零分配，返回 false 提前停止
graph.forEachNode((id, weight, slot) => {}); // 按存储顺序，不经 id 查表
graph.forEachEdge((record, slot) => {});
graph.forEachLink((edge, source, target) => {}); // 纯整数，连字符串都不碰
graph.forEachOutAt(slot, (target, edge) => {}); // 索引空间的邻接遍历

graph.linkedTo(id, "then"); // 某个输出端口的对端，零分配
graph.linkedFrom(id, "value"); // 某个输入端口的来源
graph.reshape(id, { outputs }); // 换端口集合，保住仍然合法的连线

graph.setParent(child, group); // 复合层级，内建环检测（抛 Nested）
graph.batch(work); // 事务：事件推迟到最外层结束统一派发
graph.compact(); // 回收空位并重新稠密编号
graph.copy() / graph.subgraph(keep) / graph.union(other);
```

### 三套访问口径

同一份数据有三种取法，各有各的场合，不必猜哪个更快：

| 口径                     | 例子                            | 用在       |
| ------------------------ | ------------------------------- | ---------- |
| 按 id（要哈希，给对象）  | `node(id)` / `edge(id)`         | 交互与查询 |
| 按槽位（无哈希，给对象） | `nodeAt(slot)` / `edgeAt(slot)` | 全图扫描   |
| 按槽位（无哈希，给整数） | `forEachLink` / `forEachOutAt`  | 编译与增量 |

编译快照、打包、增量拓扑序全走第三种，因此这些路径上一次字符串哈希都不做。

### 节点与端口是声明，不是状态

`Vertex` 是节点模板，`Port` 是不可变的端口声明——两者都不持有任何连接状态，边由图独家持有。
因此同一个模板可以复用去建多个节点、用在多张图上，也不存在"跨图共享导致度数互相污染"这回事。

```ts
const template = new Vertex<Sockets, Sockets, string>(nodeId("a")).addInput("lhs", Socket.number, { multiple: false, required: true, fallback: 0 }).addOutput("sum", Socket.number);

graph.addNode(template); // 按值拷入，之后改模板不影响图
```

`connect` 会校验端口存在、Socket 兼容（`Mismatch`）、单连接容量（`Capacity`）。

节点上线后还能换端口——`reshape` 尽量保住现有连线，只断三类边：端口消失、Socket 不再兼容、
超出收紧后的单连接容量。它断边而不抛错，因为这是编辑器动作；被断的边照常派发
`edgeDropped`，上层据此提示或计入撤销栈。

```ts
graph.reshape(node, { outputs: { "0": pin, "1": pin } }); // 加一路输出，"0" 上的连线不动
graph.reshape(node, { inputs: {}, outputs: {} }); // 断掉该节点全部连线，节点保留
```

### 删高扇出节点是线性的

`dropNode` 先把关联边整批从**对端**摘掉，再一次性清空自己的两条邻接表。若逐条走
`disconnect`，每条边都要在正在收缩的自身列表上做一次线性查找，删一个高扇出节点就是
O(deg²)：3 万扇出要几百毫秒，10 万扇出到秒级。现在 10 万扇出也在几十毫秒内。

## Snapshot：计算的输入

```ts
const snapshot = Snapshot.of(graph, {
  weight: (weight) => weight ?? 1, // 带权编译，省略则每条边按 1 计
  node: (id, weight) => keep(id), // 节点过滤
  edge: (record) => (record.weight ?? 0) > 5, // 边过滤
  collapse: [groupId], // 把分组折叠成单节点
  undirected: true, // 每条边在两端各出现一次
  outbound: true, // 只编译出向，省一半内存与时间
  reuse: previous, // 增量重编译，见下
});

snapshot.reverse(); // O(1)，与原快照共享底层数组
snapshot.verify(); // 源图已变更则抛 Stale
snapshot.names(indices); // 索引 → NodeId；边序号换 id 直接读 snapshot.edges[i]
```

以前需要嵌套视图适配器（`reversed(new NodeFilter(g, p))`）的场景，现在是一次编译的几个选项。
代价是编译要 O(V+E)，收益是运行期零开销、且不再有"视图上 `order` 是 O(V)"这类陷阱。

`weight` 回调只吃边自己的权重值，不给整条记录——这正是增量重编译能便宜的前提。要按端点算权，
把它烘进 `E` 里。

### 增量重编译

编辑器改的多半是参数而不是连线。传上一份快照进去，结构没变就复用整套 CSR：

```ts
let snapshot = Snapshot.of(graph, { weight: cost });

graph.setEdgeWeight(edge, 42);
snapshot = Snapshot.of(graph, { weight: cost, reuse: snapshot });
// labels / edges / outbound / inbound / 索引表全部原样共享，只有 weight 是新的
```

三档：`revision` 也没动 → 原样返回同一个对象；`shape`（结构版本号）没动 → 复用 CSR、只重算
边权，走的是槽位直读，零哈希；结构变了 → 全量重编译。用了谓词或折叠时自动退回全量——那种编译
的结构不只由 `shape` 决定。传错图的快照、传选项不一致的快照都只是没有加速，不会出错。

实测 V=5000 / E=40000：全量 2.59ms，增量 0.36ms。

### 跨线程

快照的 `data` 只含 typed-array 与字符串数组，可以直接 `postMessage`：

```ts
worker.postMessage(snapshot.data);
// Worker 侧
const snapshot = Snapshot.from(data);
settle(scc(snapshot));
```

id → 索引表是**惰性**的：只跑索引空间算法的一侧从不碰它，因此 Worker 还原一份 V=100 万的快照
不必先付一遍百万次哈希。只在第一次调 `indexOf` / `names` 时建表，`reverse()` 与增量重编译共享同一份。

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
- **查询**：`degrees` / `sources` / `sinks` / `isolated` / `neighborhood`（切 CSR 视图，零分配）/ `roots` / `subtree` / `ancestry`
- **增量**：`Ordering`（Pearce-Kelly 增量拓扑序）

产出一律在索引空间：`toposort` 给 `Int32Array`，`ranks` 给按索引下标的 `Int32Array`，
`dominators` 给 `idom[u]`（入口指向自身，不可达为 -1），`cuts` 给索引对与 `Int32Array`。

### 提前终止不泄漏未收敛的值

`shortestPath` 摸到终点即停，因此它**只**返回那一条路线，不给路径树——类型上就杜绝了
"读提前终止时其他节点的距离"这种误用。需要全树就用 `shortestPaths`，它会跑完整个搜索。

### 权重语义可换

Dijkstra 的贪心只要求 `combine(total, step) >= total`，满足这一点的语义共用同一份实现：

```ts
settle(shortestPaths(snapshot, source)); // 默认 sum：常规最短路
settle(shortestPaths(snapshot, source, { combine: bottleneck })); // 最大边权最小的路线
```

默认的加法语义在内层循环里走特化分支，不付那次间接调用。

边权画像（是否全为非负整数、最大值——用来决定走桶队列还是惰性堆）按结构记在 `WeakMap` 上算一次。
它是不可变结构的属性，只该算一次：不缓存的话，这一遍扫描在 V=5000 / E=40000 上要占单次
Dijkstra 的 17%，多源场景更是白付一个 O(V·E)。

### 增量拓扑序

`Ordering` 订阅图事件就地重排。成环的边不触发重算，而是记入 `conflicts` 并排除在拓扑约束外——
剩下的子图始终是 DAG，顺序始终有效，因此"编辑器里长期带环"不会让每次变更都退化成 O(V+E)。

```ts
const ordering = new Ordering(graph);
ordering.rank(node);
ordering.rankAt(slot); // 零哈希
ordering.sorted();
ordering.cyclic; // O(1)
ordering.cycles(); // 按需 O(V+E)
ordering.dispose();
```

内部状态全按整数槽位存：位次是一条 `Int32Array`，冲突边是数字 `Set`，区域搜索走 `forEachOutAt`。
事件载荷自带 `slot`，`compact()` 后按 `compacted` 给的映射原地搬运而不是整图重算。

## 序列化

```ts
const bundle = pack(graph); // 元组化紧凑格式
const bundle = pack(graph, { intern: true, order: toposorted }); // 短 id + 稳定顺序
const restored = unpack<N, E>(bundle);

const changes = diff(before, after); // 结构化差异
apply(graph, changes);
apply(graph, invert(changes)); // 撤销
```

`Compact<N, E>` 带权重泛型，因此还原时不需要任何类型断言。边 id 会被自由表回收复用，所以
`diff` 判定"是不是同一条边"时除了 id 还比端点。

端口结构变了的节点，`diff` 按"删除 + 重建"处理——`apply` 的结果与 `reshape` 等价，但补丁更大
（连带产出那些边的重建操作）。要精确记录引脚变更时，直接把 `reshape` 记进自己的撤销栈。

## 事件

```ts
graph.signal.on("nodeAdded", ({ node, slot }) => {});
graph.signal.on("edgeDropped", ({ edge, slot, source, target, weight }) => {});
graph.signal.on("compacted", ({ nodes, edges }) => {}); // 旧 → 新索引映射
graph.signal.on("flushed", ({ changes }) => {}); // 事务边界
graph.signal.watch((type, payload) => {});
```

十类事件：`nodeAdded` / `nodeDropped` / `nodeUpdated` / `nodeReshaped` / `edgeAdded` /
`edgeDropped` / `edgeUpdated` / `parentChanged` / `compacted` / `flushed`。

- 载荷是值快照而非活对象，因此在事务里缓冲、稍后派发也不会读到已失效的状态。
- 每条载荷都带 `slot`（图内整数索引），按索引维护增量状态的订阅者不必自己查表。
- 派发落在**事务边界**：单次变更自成一段事务，`batch` 是一整段；两者都先按序放出变更事件，
  再放一次 `flushed`。下游据此把一段编辑合并成一次重算，而不是每条变更都重算一遍。
- 载荷只在变更发生时**确有监听者**才构造，因此无人订阅的变更热路径零分配。批量导入几万条
  变更时，这决定了事务里是空的还是堆着几万个载荷对象。
- `clear()` 走删除原语，订阅者不会与图失同步。

## 性能

`pnpm --filter @openconsole/graph bench`。V=5000 / E=39992 的随机 DAG，一台开发机上的
量级参考（单位 ms）：

| 操作                        | 耗时 |
| --------------------------- | ---: |
| 全图邻接遍历 — CSR 直读     | 0.04 |
| 全图邻接遍历 — `forEachOut` | 0.50 |
| `Snapshot.of` 双向带权      |  2.6 |
| `Snapshot.of` 单向带权      |  1.9 |
| **增量重编译（只动权重）**  | 0.36 |
| `toposort`                  |  0.3 |
| `shortestPaths`             |  0.3 |
| `scc` / `components`        |  0.5 |
| `dominators`                |  1.4 |
| `pack`                      |  6.5 |
| `unpack`                    |   35 |

**这些数字只用来看量级，不要拿来做闸门。** 同一台机器上同一份代码跑两轮，绝对值能差
2–4 倍——后台扫描、降频、GC 压力都算数，分配密集的项（编译、序列化）比纯指针追逐的项
（邻接遍历）敏感得多，连"整轮一起变慢"这种简化假设都不成立。

由此得出的两条实践：编译一次约等于 8 次算法运行，所以适用形态是「批量编辑 → 编译一次 →
跑一批算法」；只跑单个算法且图频繁变动时，用 `reuse` 走增量，代价降到不足一次算法运行。

`forEachOut` 比 `outNeighbors` 略慢是因为它额外解析了边 id；它的价值是拿边 id 时不分配数组，
不是比取邻居更快。

`unpack` 是全包最慢的操作：成本在 4.5 万次 `addNode` / `connect` 的端口校验与槽位登记上，
属于正确性开销。`pack` 的钱则花在每个节点的端口元组化（`Object.keys` + 排序 + 建对象）上。

### 复杂度闸门

真正进 CI 的不是耗时基线，而是 `tests/scaling.test.ts` 里的**同进程规模比**断言：规模翻 4 倍，
耗时不许涨过 9 倍。这类比值不受整机快慢影响，因此不会误报，而它要挡的东西——某个 O(n) 悄悄
变回 O(n²)——无论机器多快都会被抓住。目前钉住四条：

- `dropNode` 随扇出线性，不随平方；
- `Snapshot.of` 随边数线性；
- 增量重编译只随改动量走，且必须快过全量；
- 单源最短路的耗时不随图里**无关的**边数增长（边权画像被缓存的可观测后果）。

## 模块边界

```
core/
├── ident / error / event      品牌 id、错误体系、事件类型
├── socket / vertex            Socket 类型系统、节点模板与端口声明（无状态）
├── slots                      稳定索引分配器，节点与边共用
├── graph                      编辑层：存储 + CRUD + 层级 + 事务 + 事件
├── snapshot                   Structure 契约 + 不可变 CSR + 编译期视图 + 增量重编译
├── task                       Task / settle / schedule / 组合器
├── algorithm/                 只吃 Structure，每个算法一套实现
└── serialize/                 紧凑格式与结构化差异
```

依赖单向收敛：`algorithm/` 只认 `Structure` 与 `Task`，**运行期完全不依赖 `graph`**（只有
`Ordering` 需要活图，且只作类型导入）；`serialize/` 是唯一同时依赖 `Graph` 与格式定义的层；
`slots` 谁都不认。

子路径导出据此切分，Worker 侧可以只引算法层，不把编辑层带进包里：

```ts
import { scc, settle } from "@openconsole/graph/algorithm";
import { pack } from "@openconsole/graph/serialize";
```

## 设计要点

- **可变与不可变分家**：编辑走 `Graph`，计算走 `Structure`。算法因此只有一套实现，不存在
  "通用版 + 编译版"两条需要同步维护的代码路径。
- **算法对接口编程**：`Structure` 是五个只读字段，不是一个类。自定义存储、跨语言内存、
  惰性生成的图都能直接跑算法，不必先物化成 `Graph`。
- **索引是公开的一等公民**：算法在索引空间进出，事件载荷带槽位，图同时提供 id / 槽位 / 纯整数
  三套访问口径。字符串哈希只在人机边界上付。
- **视图是编译选项，不是运行期包装**：过滤 / 折叠 / 无向化一次做完，运行期零开销；结构没变时
  连编译都能省掉大半。
- **删除后索引稳定**：自由表复用空位，已发出的下标永不改指；要回收空位就显式 `compact()`，
  并且会发事件告诉订阅者索引怎么变了。
- **不可变在类型层面成立**：快照暴露的是只读的 `Ints` / `Reals`，不是可写的 typed-array。
- **索引访问契约收在一处**：`at()` 供外部查询（越界返回 `undefined`），`label()` / `key()`
  供内部遍历（越界即程序错误），因此算法里没有一处非空断言。
- **中间态不对外**：`result()` 在跑完之前抛 `Incomplete`，提前终止的接口不返回全量结构。
- **端口是声明**：`Vertex` / `Port` 无状态，可复用、可跨图，没有"节点被图独占"这类限制。
- **不预设编排形态**：`Socket.exec` 只是个预置常量名，图本身不认识它的含义；`N` / `E` 完全
  不透明；连线可以成环（只有层级禁环）。执行语义留给上层，n8n 式数据流、Node-RED 式消息流、
  蓝图式 exec/data 双轨都能落在同一个底座上。

## 开发

```bash
pnpm --filter @openconsole/graph test        # vitest run
pnpm --filter @openconsole/graph typecheck   # tsc --noEmit
pnpm --filter @openconsole/graph bench       # vitest bench --run
pnpm --filter @openconsole/graph doc         # typedoc
```

测试以 property-based 对拍为主：随机图上把 `scc` / `toposort` / `dijkstra` / `dominators` /
`cuts` / `closure` 的结果与各自独立的朴素实现逐一比对，覆盖 Task 的中断续跑、快照的编译选项、
增量重编译的三档判定与跨线程还原、序列化往返与撤销，以及自定义 `Structure` 实现上的全套算法。

## License

MIT
