# Toposort · 拓扑排序与增量拓扑

[← 回到索引](./index.md)

## API 一览

```ts
import {
  toposort, topology, cycles, isCyclic, ranks,
  Topo, IncrementalTopo,
} from '@opendesign/graph';
```

| API | 返回 | 说明 |
|---|---|---|
| `toposort(g, onCycle?)` | `NodeId[]` | 拓扑顺序数组；默认遇环抛 `Cycle` |
| `topology(g, onCycle?)` | `{ order, cycles }` | 含环路信息 |
| `cycles(g)` | `Cycles` | `{ hasCycle, cycleNodes }` |
| `isCyclic(g)` | `boolean` | 布尔捷径 |
| `ranks(g)` | `Map<NodeId, number>` | 节点 → 拓扑序中位置 |
| `Topo.start(g)` | 状态化遍历器 | 暂停 / 恢复版 |
| `IncrementalTopo` | 类 | 订阅 graph 事件，增量维护 ranks |

## 算法：Kahn

库里所有拓扑相关函数都建立在 `Topo` 遍历器上，遍历器用 Kahn 算法：

1. 初始化每个节点的入度 `pending: Map<NodeId, number>`
2. 入度为 0 的节点入队
3. 每次 pop 一个节点，把它的后继入度 -1；若变 0 则入队
4. 队列空时若 `emitted === total` 则全图排完，否则剩下的就在环上

```ts
const topo = Topo.start(g);
for (const id of topo.iterator(g)) {
  evaluate(id);
}
if (topo.cycleNodes().length > 0) {
  console.warn('cycle:', topo.cycleNodes());
}
```

## 遇环的 onCycle

```ts
import { toposort, Cycle } from '@opendesign/graph';

// 默认：抛 Cycle 错误
try {
  toposort(g);
} catch (e) {
  if (e instanceof Cycle) console.log(e.nodes);   // 环上节点
}

// 自定义：把环上节点追加到尾部（前序部分仍然是拓扑顺序的）
const order = toposort(g, (cycle) => cycle);
```

## ranks 速查

`ranks(g)` 一次扫出节点 → 拓扑序中位置的映射，常用于"按拓扑序对节点列表排序"。

```ts
const r = ranks(g);
[a, b, c].sort((x, y) => (r.get(x) ?? Infinity) - (r.get(y) ?? Infinity));
```

## 增量拓扑 · IncrementalTopo

订阅 graph 的 `nodeAdded` / `edgeAdded` / `removeXxx` 事件，**就地维护**节点 ranks，避免每次结构变更都全图重算。

```ts
import { Graph, Vertex, Socket, IncrementalTopo } from '@opendesign/graph';

const g = new Graph<...>('g');
const topo = new IncrementalTopo(g);

g.addNode(A);                        // rank A = 0
g.addNode(B);                        // rank B = 1
g.connect(['A', 'y'], ['B', 'x']);   // happy path: A.rank < B.rank ✓

topo.rank('A');           // 0
topo.sorted();            // [A, B]

// 违反拓扑：标 dirty，下次 query 时 PK 局部重排 / 全量重算
g.connect(['B', 'y'], ['A', 'x']);
topo.hasCycle;            // true
topo.cycleNodes;          // ['A', 'B']

// 释放对图的事件订阅
topo.dispose();
```

### 三级路径

| 触发 | 路径 | 复杂度 |
|---|---|---|
| `addNode` | 末尾 ++maxRank | **O(1)** |
| `addEdge` 满足 `rank(u) < rank(v)` | 直接通过 | **O(1)** |
| `addEdge` 违反拓扑且无环 | **Pearce-Kelly 局部重排** | **O(\|δ\|)**（\|δ\| 是受影响区域大小） |
| `addEdge` 制造环 / 节点未注册 | 标 dirty，下次查询 `topology()` 全量 | O(V+E) |
| `removeNode` / `removeEdge` | 多数情况什么都不做；删环上节点 → dirty | O(1) 或 O(V+E) |

### Pearce-Kelly 算法要点

参考 Pearce, D.J. & Kelly, P.H.J. (2007). "A Dynamic Topological Sort Algorithm for Directed Acyclic Graphs." ACM JEA 12.

加入违反拓扑的边 `u → v`（即 `rank(v) < rank(u)`）：

1. 从 `v` 出发**正向 DFS**收集 `rank ∈ [rv, ru]` 范围内的节点 `fwd`
2. 从 `u` 出发**反向 DFS**收集同范围的节点 `bwd`
3. 把 `fwd ∪ bwd` 占用的 rank 槽位提取出来排序得到 `slots`
4. **bwd 占小槽位、fwd 占大槽位** —— 重排后 u 必排到 v 之前

正向 DFS 中如果遇到 u 自己，就检测到了环，降级为 dirty。

### sorted() 的性能分支

```ts
topo.sorted()
```

如果当前 ranks 是**稠密**的（无 gap），O(N) 直接按下标填入数组；若有 gap（删节点留下），回退到 `entries + sort` O(N log N)。

## 典型场景

- **依赖驱动调度**：节点是任务，边是依赖。toposort 给出执行顺序。
- **CSS/Sass @use 链解析**：识别循环导入。
- **配置 / 资源加载**：A 依赖 B 时 B 先加载。
- **构建系统增量编译**：源文件变动时只重算受影响的部分（Pearce-Kelly 局部重排正是这场景）。

## 下一步

- 含环图的进阶分析 → [scc](./scc.md)
- 看 Topo 怎么和 Visitor 协作 → [traversal](./traversal.md)
- 大图加载关掉事件风暴 → [events](./events.md)
