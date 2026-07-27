# @openconsole/graph

类型化端口的有向图内核：整数索引存储、不可变 CSR、可中断的算法。

## 四层职责

| 层          | 负责       | 形态                                              |
| ----------- | ---------- | ------------------------------------------------- |
| `Graph`     | 编辑       | 整数索引 + 平行数组，邻接是纯数组读取，变更走事件 |
| `Snapshot`  | 计算的输入 | 不可变 CSR，全部数据在 typed-array 里             |
| `Structure` | 算法的契约 | 五个只读字段，谁都能实现                          |
| `Task`      | 调度       | 分步推进，可中断、可续跑、可分帧                  |

算法只吃 `Structure`，不吃图。输入不可变带来三件事：长跑任务中断后恢复不会读到半改的图；
快照能整份搬进 Worker；过滤 / 折叠 / 无向化在编译期一次做完，运行期没有谓词回调或视图转发的开销。

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

**为什么算法收发索引而不是 id**：索引就是数组下标，结果可以直接落在 `Int32Array` 里；换成
`NodeId` 就得为每个节点各付一次字符串哈希，还要在「索引 → 名字 → 查回索引」之间反复往返。
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

五个只读字段，全是纯数据。凡是能凑出这五样的都能跑全套算法——不必先塞进 `Graph` 再编译：

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

`Adjacency` 的字段类型是只读接口 `Ints` / `Reals` 而非 `Int32Array` 本身，因此
SharedArrayBuffer 背书的数组、WASM 导出的内存视图、按需生成的惰性代理都能直接顶上。
`Snapshot` 只是这个接口的默认实现，额外提供索引 ↔ id 的标签层。

配套自由函数对任何实现都成立：`reversed`（O(1) 翻转，共享底层数组）、`merged`、
`outDegree` / `inDegree`、`costOf`、`inboundOf`。

### 只编出向时，需要入向的算法明确报错

`Snapshot.of(graph, { outbound: true })` 省掉一半内存与编译时间，代价是没有反向邻接。
此时 `inDegree` 恒为 0，若放任不管，下列算法都会给出**看起来正常的错答案**——`sources`
把每个节点都算成源、`dominators` 退化成 DFS 树、`components` 按可达性而非弱连通分组、
`prim` 与 `cuts` 漏掉整个分支。因此它们一律先过 `inboundOf` 这道关，缺入向即抛 `Oneway`：

```ts
const half = Snapshot.of(graph, { outbound: true });

settle(toposort(half)); // 只用出边，照常
settle(kruskal(half)); // 只扫出向、每条边正好一次，照常
sinks(half); // 照常

sources(half); // 抛 Oneway
settle(prim(half)); // 抛 Oneway
half.reverse(); // 抛 Oneway
```

受此约束的是 `degrees` / `sources` / `isolated` / `components` / `cuts` / `dominators` /
`prim` / `reversed` / `Snapshot.reverse` / `Neighborhood.predecessors`。

## Graph：编辑层

节点与边都以整数索引寻址，属性存在平行数组里。删除只在索引位上留空并进自由表，
**已发出的索引永不改指**。空位由 `compact()` 显式回收，回收时派发 `compacted`（带旧 → 新映射）。

```ts
graph.addNode(spec); // 返回 NodeId，重复抛 Duplicate
graph.mergeNode(spec); // upsert，新增返回 true
graph.dropNode(id); // 级联删边、子节点提升到祖父
graph.connect(from, to, options); // 返回 EdgeId
graph.disconnect(edge);

graph.weightOf(id); // 零分配读权重
graph.updateNode(id, (weight) => next);
graph.setEdgeWeight(edge, weight);

graph.outNeighbors(id); // 数组，可重复遍历
graph.outEdges(id);
graph.between(a, b); // 全部平行边
graph.forEachOut(id, (target, edge, port) => {}); // 零分配，返回 false 提前停止
graph.forEachNode((id, weight, slot) => {}); // 按存储顺序，不经 id 查表
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

同一份数据三种取法，各有场合：

| 口径                     | 例子                            | 用在       |
| ------------------------ | ------------------------------- | ---------- |
| 按 id（要哈希，给对象）  | `node(id)` / `edge(id)`         | 交互与查询 |
| 按槽位（无哈希，给对象） | `nodeAt(slot)` / `edgeAt(slot)` | 全图扫描   |
| 按槽位（无哈希，给整数） | `forEachLink` / `forEachOutAt`  | 编译与增量 |

编译快照、打包、增量拓扑序全走第三种，因此这些路径上一次字符串哈希都不做。

### 节点与端口是声明，不是状态

`Vertex` 是节点模板，`Port` 是不可变的端口声明——两者都不持有连接状态，边由图独家持有。
因此同一个模板可复用去建多个节点、用在多张图上，也不存在「跨图共享导致度数互相污染」。

```ts
const template = new Vertex<Sockets, Sockets, string>(nodeId("a")).addInput("lhs", Socket.number, { multiple: false, required: true, fallback: 0 }).addOutput("sum", Socket.number);

graph.addNode(template); // 按值拷入，之后改模板不影响图
```

`connect` 校验端口存在、Socket 兼容（`Mismatch`）、单连接容量（`Capacity`）。

节点上线后还能换端口——`reshape` 尽量保住现有连线，只断三类边：端口消失、Socket 不再兼容、
超出收紧后的单连接容量。它断边而不抛错，因为这是编辑器动作；被断的边照常派发 `edgeDropped`。

### 摘链是 O(1)，删边路径不会平方退化

每条边都记着自己在两端邻接表里的下标，摘链因此是「末尾补位 + pop」，不必在列表上 `indexOf`。
`disconnect` / `clearEdges` / `reshape` / `dropNode` 共用这一个原语，于是「清掉一个高扇出
节点的全部连线」是线性的。换成线性查找，每条边都要在**正在收缩的**列表上扫一遍，整件事
退化成 O(deg²)。分组的子表用同一个原语，因此解散大分组也是线性的。

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
snapshot.verify(); // 源图已变更则抛 Stale；源图已被回收则无从判定，不报
snapshot.names(indices); // 索引 → NodeId；边序号换 id 直接读 snapshot.edges[i]
```

以前需要嵌套视图适配器的场景，现在是一次编译的几个选项。代价是编译要 O(V+E)，
收益是运行期零开销、且不再有「视图上 `order` 是 O(V)」这类陷阱。

`weight` 回调只吃边自己的权重值，不给整条记录——这正是增量重编译能便宜的前提。要按端点算权，
把它烘进 `E` 里。回调给出 `NaN` 时编译就抛 `Invalid` 并报出是哪条边：`NaN` 与任何值比较都是
`false`，放过去只会让最短路把明明连通的节点静默报成不可达。

### 增量重编译

编辑器改的多半是参数而不是连线。传上一份快照进去，结构没变就复用整套 CSR：

```ts
let snapshot = Snapshot.of(graph, { weight: cost });

graph.setEdgeWeight(edge, 42);
snapshot = Snapshot.of(graph, { weight: cost, reuse: snapshot });
// labels / edges / outbound / inbound / 索引表全部原样共享，只有 weight 是新的
```

三档：`revision` 也没动 → 原样返回同一个对象；`shape`（结构版本号）没动 → 复用 CSR、只重算
边权，走槽位直读、零哈希；结构变了 → 全量重编译。用了谓词或折叠时自动退回全量。传错图的
快照、传选项不一致的快照、传翻转过的快照，都只是没有加速，不会出错。

### 对源图只持弱引用

快照常常活得比源图久（缓存在算法层、挂在 UI 状态上）。若强引用源图，一份几百 KB 的快照会把
整张图连同全部端口对象一起钉住，量级可能是它的几十倍。因此 `_source.graph` 是 `WeakRef`：

- 源图还在 → `current` / `verify()` 照常判定陈旧；
- 源图已被回收 → 无从判定，`current` 恒为 `true`、`verify()` 不抛。**陈旧只在证据确凿时才报**，
  与跨线程还原的快照同一口径；
- 增量重编译发现源图对不上（换了图，或已回收）→ 退回全量编译，不会出错。

### 跨线程

快照的 `data` 只含 typed-array 与字符串数组，可直接 `postMessage`：

```ts
worker.postMessage(snapshot.data); // 带标签层
worker.postMessage(snapshot.core); // 只有 CSR 与权重
// Worker 侧
const snapshot = Snapshot.from(data);
settle(scc(snapshot));
```

id → 索引表是**惰性**的：只跑索引空间算法的一侧从不碰它，因此 Worker 还原一份百万级快照
不必先付一遍百万次哈希。只在第一次调 `indexOf` / `names` 时建表，`reverse()` 与增量重编译
共享同一份。

标签是字符串数组，结构化克隆时只能逐个深拷贝，在大图上会占掉整份 `data` 克隆耗时的绝大部分。
Worker 只跑索引空间算法时改搬 `core`：结构与权重照旧，`at` / `indexOf` 查不到东西，
`label` / `names` 会明确报错而不是给出可疑答案。

## Task：中断 / 分步 / 恢复

所有 O(V+E) 及以上的算法都返回 `Task`，中间状态全在实例上，因此随时可停、可续。

```ts
settle(task); // 同步跑完
settle(task, signal); // 受 AbortSignal 中断，抛 Interrupted
await schedule(task, { budget: 2048, signal, onProgress }); // 分帧推进，不冻结 UI

task.advance(100); // 手动推进 100 步，返回 false 表示已跑完
task.progress; // 0..1，跑完即为 1
task.settled;
task.result(); // 未跑完抛 Incomplete——中间态一律不对外
```

两条贯穿全部算法的约束：

- **单步压在 O(deg) / O(V)**：`floydWarshall` 一步是一个中转节点的**一行**、`bellmanFord`
  一步是一轮松弛里的**一个节点**、`reduction` 一步是**一条候选边**。否则 `schedule` 的预算
  再小也让不出帧——单步 O(V²) 在 V=1200 时就是几毫秒，一帧默认 4096 步会卡十几秒。
- **构造函数只做 O(V) 级分配**：与算法同阶的准备工作一律摆进推进步里。`kruskal` 因此用惰性堆
  边扫邻接边入堆，而不是先 `sort` 一遍——排序是它的主项，留在构造函数里就等于近一半的工作
  既不受预算约束也中断不了。

`progress` 的归一收在 `Stepwise` 里：各算法自己估的「已处理 / 总数」在提前终止时（摸到终点、
提前收敛、图不连通）到不了分母，跑完统一报 1，进度条才不会永远差一口。

中断不丢现场：

```ts
try {
  settle(task, signal);
} catch (error) {
  if (error instanceof Interrupted) {
    const answer = settle(task); // 任务停在原处，换个时机继续跑就是了
  }
}
```

组合器：`ready(value)` / `chain(first, next)` / `transform(task, convert)`，中断点贯穿组合后的全程。

## 算法

- **拓扑**：`topology`（环单列出来）/ `toposort`（遇环抛 `Cycle`）/ `acyclic` / `ranks` /
  `generations`（分层，同层可并行）/ `criticalPath`
- **连通**：`components`（弱）/ `scc`（Pearce 2016）/ `condensation` / `simpleCycles`（Johnson）/
  `cuts`（桥与割点）/ `dominators`（Lengauer-Tarjan）
- **可达**：`reachable`（双向 BFS）/ `ancestors` / `descendants` / `closure`（按 SCC 存位图）/ `reduction`
- **最短路**：`shortestPaths`（单源全树）/ `shortestPath`（单条）/ `astar` / `bidirectional` /
  `bellmanFord`（容许负权）/ `floydWarshall`（全源）
- **生成森林**：`prim` / `kruskal`
- **遍历**：`dfs` / `bfs`（生成器）/ `postorder` / `levels` / `visit`（事件式，带边分类）
- **查询**：`degrees` / `sources` / `sinks` / `isolated` / `neighborhood`（切 CSR 视图，零分配）/
  `roots` / `subtree` / `ancestry`
- **增量**：`Ordering`（Pearce-Kelly 增量拓扑序）

产出一律在索引空间：`toposort` 给 `Int32Array`，`ranks` 给按索引下标的 `Int32Array`，
`dominators` 给 `idom[u]`（入口指向自身，不可达为 -1），`cuts` 给索引对与 `Int32Array`。

### 稠密结构有内存上限

`floydWarshall` 的矩阵是 `8·V²` 字节、`closure` 的位图是 `count × ⌈V/32⌉` 字——都随 V 平方增长：
V=10000 的矩阵就是 763MB，V=100000 的位图是 1.2GB。两者分配前都过一道闸门，超限抛 `Oversized`
并报出申请量，而不是静默吃掉内存：

```ts
settle(floydWarshall(snapshot)); // 默认上限 CEILING = 512MB
settle(floydWarshall(snapshot, { limit: 2 * 1024 ** 3 })); // 确实要 2GB 就抬闸门
settle(closure(snapshot, { limit })); // reduction 会把 limit 透传下去
```

`closure` 的位图行数是**分量数**，要等 `scc` 跑完才知道，因此它的闸门落在推进途中而不是构造时。

### 提前终止不泄漏未收敛的值

`shortestPath` 摸到终点即停，因此**只**返回那一条路线，不给路径树——类型上就杜绝了
「读提前终止时其他节点的距离」这种误用。需要全树就用 `shortestPaths`，它跑完整个搜索。

### 权重语义可换

Dijkstra 的贪心只要求 `combine(total, step) >= total`，满足这一点的语义共用同一份实现：

```ts
settle(shortestPaths(snapshot, source)); // 默认 sum：常规最短路
settle(shortestPaths(snapshot, source, { combine: bottleneck })); // 最大边权最小的路线
```

默认的加法语义在内层循环里走特化分支，不付那次间接调用。边权画像（是否全为非负整数、最大值——
用来决定走桶队列还是惰性堆）按**权重数组**记在 `WeakMap` 上算一次；以权重数组而非结构对象为键，
`reverse()` 每次产出的新结构才能共享同一份画像。

### 增量拓扑序

`Ordering` 订阅图事件就地重排。成环的边不触发重算，而是记入 `conflicts` 并排除在拓扑约束外——
剩下的子图始终是 DAG，顺序始终有效，因此「编辑器里长期带环」不会让每次变更都退化成 O(V+E)。

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
`diff` 判定「是不是同一条边」时除了 id 还比端点。

端口结构变了的节点，`diff` 按「删除 + 重建」处理——`apply` 的结果与 `reshape` 等价，但补丁更大
（连带产出那些边的重建操作）。要精确记录引脚变更时，直接把 `reshape` 记进自己的撤销栈。

`apply` 分两趟：先结构（增删节点与边）再属性（权重与层级）。`invert` 只是把列表倒序，倒序会把
`reparent` 甩到节点重建之前，那时父节点还不存在、父链就落不下去；分趟之后 `apply` 与列表内的
相对次序无关，正向补丁与逆向补丁走同一条路。

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
  再放一次 `flushed`。下游据此把一段编辑合并成一次重算。
- 载荷只在变更发生时**确有监听者**才构造，因此无人订阅的变更热路径零分配。
- **订阅者相互隔离**：某个 handler 抛错时其余 handler 与其余事件照常派发，错误留到本轮
  派发完再上抛。少了这层隔离，一个坏订阅者会连带掐掉同一事务里其他订阅者的事件——那些事件
  已从队列里摘走、补不回来，按索引维护增量状态的订阅者从此静默错位。

## 错误

全部继承 `GraphError`，`code` 用于分类捕获，`name` 取实际子类名。

| 错误                    | code                    | 何时                                       |
| ----------------------- | ----------------------- | ------------------------------------------ |
| `Duplicate` / `Missing` | `duplicate` / `missing` | id 已存在 / 节点、边、端口不存在           |
| `Mismatch` / `Capacity` | `socket` / `capacity`   | Socket 不兼容 / 单连接端口已占用           |
| `Cycle` / `Nested`      | `cycle`                 | 算法撞上环 / 层级会成环                    |
| `Oneway`                | `oneway`                | 算法需要入向邻接，但结构只编了出向         |
| `Negative` / `Invalid`  | `negative` / `invalid`  | 负权（点名改用 `bellmanFord`）/ `NaN` 权   |
| `Oversized`             | `oversized`             | 稠密结构（全源矩阵、可达位图）超过内存上限 |
| `Stale`                 | `stale`                 | 快照编译后源图又变了                       |
| `Incomplete`            | `incomplete`            | 任务没跑完就取结果                         |
| `Interrupted`           | `interrupted`           | 任务被 `AbortSignal` 中断（现场保留）      |
| `Schema`                | `schema`                | 反序列化时格式版本不匹配                   |

这些位置恰是「给个看起来正常的答案」最容易骗过人的地方——`NaN` 尤其典型：它与任何值比较都是
`false`，于是连通节点被报成不可达。

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

子路径导出据此切分，Worker 侧可以只引算法层：

```ts
import { scc, settle } from "@openconsole/graph/algorithm";
import { pack } from "@openconsole/graph/serialize";
```

## 设计要点

- **可变与不可变分家**：编辑走 `Graph`，计算走 `Structure`。算法因此只有一套实现，不存在
  「通用版 + 编译版」两条需要同步维护的代码路径。
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
- **可疑输入不静默通过**：负权抛 `Negative`、`NaN` 权抛 `Invalid`、源图变更后 `verify()` 抛
  `Stale`、缺入向抛 `Oneway`、没搬标签就问名字明确报错。宁可报错，也不给一个看起来正常的答案。
- **端口是声明**：`Vertex` / `Port` 无状态，可复用、可跨图，没有「节点被图独占」这类限制。
- **不预设编排形态**：`Socket.exec` 只是个预置常量名，图本身不认识它的含义；`N` / `E` 完全
  不透明；连线可以成环（只有层级禁环）。执行语义留给上层，n8n 式数据流、Node-RED 式消息流、
  蓝图式 exec/data 双轨都能落在同一个底座上。

## 开发

```bash
pnpm --filter @openconsole/graph test              # 单元 + 集成
pnpm --filter @openconsole/graph test:unit         # 只跑 tests/unit
pnpm --filter @openconsole/graph test:integration  # 只跑 tests/integration
pnpm --filter @openconsole/graph bench             # tests/bench
pnpm --filter @openconsole/graph typecheck         # tsc --noEmit
pnpm --filter @openconsole/graph doc               # typedoc，输出到 docs/（已 gitignore）
```

```
tests/
├── support.ts        构建器与断言助手
├── naive.ts          各算法的独立参照实现，只用公开查询、照定义直写
├── unit/             逐模块：图、事件、端口、快照、契约、任务、序列化、增量序、算法、上限
├── integration/      跨层：编辑器全链路、计算侧端到端、复杂度闸门
└── bench/            量级参考，不作闸门
```

**算法层靠差分对拍**：随机图上把 `scc` / `components` / `dominators` / `cuts` / `closure` /
最短路的结果与 `naive.ts` 里各自独立的朴素实现逐一比对，8 个 seed 各跑一遍。那边是 Pearce /
Tarjan / Lengauer-Tarjan 这类带巧思的迭代版本，这边是能一眼看懂的笨办法，任一侧出错都会暴露。

**闸门只钉不受机器快慢影响的量**，且按判据的信噪比分三种：

- **计数**（最可靠）——单步粒度数推进步数，「有没有为每个节点付固定重成本」数 `JSON.stringify`
  调用次数。退化前后常常同阶、只是常数不同，耗时比与噪声完全重叠，唯有计数分得开。
- **同机同轮的对照量**——删边路径拿**建图**当标尺：排干一张图理应比建它便宜得多。实测健康时
  排干只占建图的 15%–60%，退化成平方则是 4.3–8.3 倍，两侧各有一个数量级余量。
- **同进程的规模比**（翻 4 倍不许涨过 9 倍）——只用在编译与最短路这类比值确实稳定的地方。

反面教材留在注释里：删边路径曾用规模比，但缓存与 GC 让线性操作的常数随数据量一起长，4 倍规模
实测能涨到 9.1×，与平方的 16× 贴在一起，并行跑整个工作区时必然误报。

## License

MIT
