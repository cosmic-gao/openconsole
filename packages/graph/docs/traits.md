# Traits · 能力接口与算法解耦

[← 回到索引](./index.md)

`@opendesign/graph` 最核心的设计：**算法不依赖 `Graph` 类，只依赖能力 trait**。

这意味着：

- 你可以写一个完全自定义的存储实现（数据库后端、稀疏矩阵、CSR、外部图引擎...），只要它满足相应 trait，所有内置算法都能直接喂给它跑。
- 适配器（`Reversed` / `NodeFilter` / `EdgeFilter`）也只是 trait 的转发包装，可以层层嵌套。

## Trait 一览

| Trait | 必备方法 | 作用 |
|---|---|---|
| `Catalog` | `nodeIds` / `edgeIds` / `nodeCount` / `edgeCount` | 集合枚举与计数 |
| `Neighbors` | `upstream` / `downstream` / `neighbors(id, dir?)` | 邻接查询 |
| `IntoEdges<E>` | `getEdges` / `getIncoming` / `getOutgoing` | lazy 边视图 |
| `IntoDegree` | `inDegree(id)` / `outDegree(id)` | O(1) 度数 |
| `NodeIndexable` | `bound()` / `at(i)` / `indexOf(id)` | 节点 ↔ 索引互转 |
| `Visitable` | `marks()` / `reset(map)` | 复用已访问位图 |
| `Subscribable<N, E>` | `signal: Signal<Events>` | 事件订阅 |
| `Walkable` | `Catalog & Neighbors` | 算法常用最小约束 |

## 算法的最小约束

每个算法的签名都把它真正依赖的 trait 显式写出来。看一眼就知道能不能接你的图。

```ts
// 拓扑排序：只需要 Walkable
function toposort<G extends Walkable>(graph: G): NodeId[];

// 拓扑可选利用 IntoDegree 快路径（O(N) vs O(N+E)）
function topology<G extends Walkable & Partial<IntoDegree>>(graph: G): Topology;

// Dijkstra：需要边视图
function dijkstra<E, G extends Catalog & IntoEdges<E>>(
  graph: G, start: NodeId, end: NodeId | undefined,
  edgeCost: (edge: EdgeView<E>) => number,
): Map<NodeId, number>;

// 支配树：需要 upstream + downstream
function dominator<G extends Catalog & Neighbors>(
  graph: G, entry: NodeId,
): Map<NodeId, NodeId>;

// 增量拓扑：还需要订阅事件
class IncrementalTopo<N, E> {
  constructor(graph: Walkable & Subscribable<N, E>);
}
```

## 为什么这样设计

### 1. 不绑死 `Graph` 实现

如果算法写成 `function toposort(g: Graph)`，那么自定义存储就用不了它。

```ts
// 自定义稀疏图存储
class SparseGraph implements Catalog, Neighbors {
  // 实现 nodeIds / nodeCount / upstream / downstream / ...
}

// 直接复用所有算法
toposort(sparseGraph);
scc(sparseGraph);
dfs(sparseGraph, root);
```

### 2. 适配器可层层嵌套

`Reversed` 实现 `Walkable + IntoEdges + IntoDegree + Visitable + NodeIndexable`（按 inner 能力探测），所以：

```ts
import { reversed, NodeFilter, dfs, toposort } from '@opendesign/graph';

// 反向图上跑 DFS
for (const ancestor of dfs(reversed(g), id)) {}

// 子图 + 反向图嵌套
const dataGraph = new NodeFilter(g, (id) => g.getNode(id)?.weight?.kind === 'data');
const reversedSubgraph = reversed(dataGraph);
toposort(reversedSubgraph);
```

### 3. 编译视图 = 同一套算法 + 不同后端

CSR 视图（[csr](./csr.md)）也只是实现了 `Walkable + IntoDegree + NodeIndexable`：

```ts
import { csr, toposort, scc } from '@opendesign/graph';

const compiled = csr(g);   // 一次编译成 typed-array
toposort(compiled);        // 同样的算法，5-20× 速度
scc(compiled);
```

## 自己写一个实现：示例

下面演示自定义"邻接矩阵"图，30 行实现 `Walkable + IntoDegree`：

```ts
import type { Catalog, Direction, IntoDegree, Neighbors, NodeId } from '@opendesign/graph';

export class MatrixGraph implements Catalog, Neighbors, IntoDegree {
  constructor(
    private readonly ids: NodeId[],
    private readonly adj: boolean[][],       // adj[i][j] === true ⇔ i → j
  ) {}

  get nodeIds() { return this.ids; }
  readonly edgeIds: Iterable<never> = { *[Symbol.iterator]() {} };
  nodeCount() { return this.ids.length; }
  edgeCount() {
    let n = 0;
    for (const row of this.adj) for (const v of row) if (v) n++;
    return n;
  }

  *upstream(nodeId: NodeId) {
    const j = this.ids.indexOf(nodeId);
    if (j < 0) return;
    for (let i = 0; i < this.ids.length; i++) if (this.adj[i]![j]) yield this.ids[i]!;
  }

  *downstream(nodeId: NodeId) {
    const i = this.ids.indexOf(nodeId);
    if (i < 0) return;
    for (let j = 0; j < this.ids.length; j++) if (this.adj[i]![j]) yield this.ids[j]!;
  }

  *neighbors(nodeId: NodeId, direction?: Direction) {
    if (direction !== 'input')  yield* this.downstream(nodeId);
    if (direction !== 'output') yield* this.upstream(nodeId);
  }

  inDegree(nodeId: NodeId) {
    const j = this.ids.indexOf(nodeId);
    if (j < 0) return 0;
    let n = 0;
    for (const row of this.adj) if (row[j]) n++;
    return n;
  }

  outDegree(nodeId: NodeId) {
    const i = this.ids.indexOf(nodeId);
    if (i < 0) return 0;
    let n = 0;
    for (const v of this.adj[i]!) if (v) n++;
    return n;
  }
}

// 直接喂给所有算法
import { toposort, scc, dfs } from '@opendesign/graph';
const m = new MatrixGraph(['a', 'b', 'c'] as NodeId[], [[false, true, false], [false, false, true], [false, false, false]]);
toposort(m);   // ['a', 'b', 'c']
```

## Trait 的设计纪律

库里几个一致约定：

1. **命名优先单词**（`Catalog` / `Neighbors` / `Walkable`），不得已用 `Into*` 前缀（`IntoEdges` / `IntoDegree`）
2. **方向通过参数传，而非新方法**：`neighbors(id, direction?)` 优于 `inputNeighbors / outputNeighbors`
3. **lazy 优先**：trait 接口返回 `Iterable`，让调用方按需消费而不构造中间数组
4. **能力可选**：算法用 `Partial<IntoDegree>` 表示"有 fast path 就用，没有 fallback"

## 下一步

- 看遍历算法如何使用 trait → [traversal](./traversal.md)
- 看 trait 转发的零成本视图 → [adapters](./adapters.md)
- 看用 trait 加速的 CSR → [csr](./csr.md)
