# Analysis · 结构分析算法

[← 回到索引](./index.md)

本文覆盖**桥与割点、支配树、可达性、邻域、度数**五个分析家族。

## 桥与割点 · bridges

```ts
import { bridges } from '@opendesign/graph';

const { bridges: bs, articulations } = bridges(g);

bs;              // [{ from, to }, ...]
articulations;   // [NodeId, ...]
```

定义（**无向语义**）：

- **桥（割边）** —— 删去后会增加连通分量数的边
- **割点（articulation point）** —— 删去后会增加连通分量数的节点

实现要点（[`algorithms/bridges.ts`](../core/algorithms/bridges.ts)）：

- 经典 **Tarjan 1973** 算法 + 迭代 DFS + typed-array
- 维护 `disc`（发现时间）和 `low`（自身或子树通过最多一条后向边能到达的最小 disc）
- 边 `(u, v)`（v 是子树）是桥 ⇔ `low[v] > disc[u]`
- 节点 u 是割点 ⇔ 有子 v 使 `low[v] ≥ disc[u]`，或 u 是根且 ≥ 2 个 DFS 子
- **multi-edge 安全**：用 EdgeId 而非父节点跳过返回边

无向语义对有向图的处理：每条有向边视为一条独立的无向边。例如 `a→b` 和 `b→a` 是两条平行无向边，删一条还有另一条，因此不是桥。

参考：Tarjan, R. (1974). "A note on finding the bridges of a graph." IPL 2(6).

### 典型用途

- 网络拓扑可靠性："哪条链路断了会分裂网络"
- 依赖分析："删哪个模块会让系统裂成两段"
- 社交图：identify "重要的人"

## 支配树 · dominator

```ts
import { dominator } from '@opendesign/graph';

const idom = dominator(g, entry);
idom.get(node);   // node 的直接支配者（immediate dominator）
```

定义：节点 `u` **支配** `v` ⇔ 从 `entry` 到 `v` 的所有路径都必经 `u`。**直接支配者** idom(v) 是离 v 最近的严格支配者。

实现要点（[`algorithms/dominator.ts`](../core/algorithms/dominator.ts)）：

- **Lengauer-Tarjan 1979** 算法
- 迭代 DFS 编号 + 路径压缩
- 复杂度 **O(E · α(V, E))**，α 是反 Ackermann，实际近线性
- entry 自身映射到自己（约定）；不可达节点不出现在结果中

参考：Lengauer, T.; Tarjan, R. (1979). "A fast algorithm for finding dominators in a flowgraph." ACM TOPLAS 1(1).

### 典型用途

- **编译器**：SSA 构造、循环识别、可达性优化
- **依赖分析**："删哪个依赖能解开 X"
- **控制流图分析**：哪些块必经

### 示例：找出"必经节点"

```ts
const idom = dominator(g, entry);

// 收集 v 的所有支配者（沿 idom 链向上）
function dominators(v: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let cur = v;
  while (true) {
    const d = idom.get(cur);
    if (d === undefined || d === cur) break;
    path.push(d);
    cur = d;
  }
  return path;
}
```

## 可达性 · reachable / ancestors / descendants

```ts
import { reachable, ancestors, descendants } from '@opendesign/graph';

reachable(g, src, tgt);        // boolean - 是否可达
ancestors(g, node);            // NodeId[] - 所有能到达 node 的节点
descendants(g, node);          // NodeId[] - 所有 node 能到达的节点
```

### reachable · 双向 BFS

[`algorithms/reachable.ts`](../core/algorithms/reachable.ts) 用 **meet-in-middle**：

- 同时从 `src`（正向）和 `tgt`（反向）做 BFS
- 每轮挑较小的前沿前进 —— 关键技巧，避免分支因子不对称时一侧爆炸
- 相遇即返回 true

```ts
if (reachable(graph, userA, userB)) {
  // 两人之间有有向关系链
}
```

### ancestors / descendants

```ts
// 跨 Reversed 视图复用 DFS
ancestors(g, n)    === dfs(reversed(g), n).slice(1)
descendants(g, n)  === dfs(g, n).slice(1)
```

## 邻域 · neighborhood

```ts
import { neighborhood } from '@opendesign/graph';

const all = neighborhood(g);
all.get(id);   // { predecessors: NodeId[], successors: NodeId[] }
```

**一次性物化**全图的双向邻接表。适合只暴露出边但需要双向访问的图实现。

⚠️ 这不是零成本视图。如果需要反向遍历而原图无 upstream，先 `neighborhood` 一次性建表更划算；否则用 [`reversed`](./adapters.md) 适配器。

## 度数家族 · degrees / sources / sinks / isolated

```ts
import { degrees, sources, sinks, isolated } from '@opendesign/graph';

degrees(g);     // Map<NodeId, { inDegree, outDegree }>
sources(g);     // NodeId[] - inDegree === 0
sinks(g);       // NodeId[] - outDegree === 0
isolated(g);    // NodeId[] - inDegree === 0 && outDegree === 0
```

实现里有 **TS 重载分派的快/慢路径**：

```ts
// 图实现 IntoDegree → 快路径，O(N)
degrees<G extends Catalog & IntoDegree>(graph: G): Map<NodeId, Degree>;

// 否则 → 慢路径，O(N + E)（枚举边计数）
degrees<E, G extends Catalog & IntoEdges<E>>(graph: G): Map<NodeId, Degree>;
```

调用点编译期决定走哪条。Graph / CSR 都实现了 IntoDegree，自动走快路径。

### 典型用途

- 拓扑入口选择：从 `sources(g)` 开始执行
- 找最终结果节点：`sinks(g)` 是结果
- 死节点清理：`isolated(g)` 可删

## 几个组合配方

### "找出哪些节点删了会影响 X"

```ts
const idom = dominator(g, root);

// 所有支配 X 的节点
function influencers(x: NodeId): NodeId[] {
  const result: NodeId[] = [];
  let cur = x;
  while (true) {
    const d = idom.get(cur);
    if (!d || d === cur) break;
    result.push(d);
    cur = d;
  }
  return result;
}
```

### "找出图的关键链路"（割边 + 入度 1 节点）

```ts
const { bridges: bs } = bridges(g);
const critical = bs.filter(({ from, to }) =>
  g.inDegree(to) === 1 || g.outDegree(from) === 1
);
```

### "判断图是否近似树形"

```ts
import { isCyclic } from '@opendesign/graph';
const isTree = !isCyclic(g) && g.edgeCount() === g.nodeCount() - 1;
```

## 下一步

- 拓扑排序 → [toposort](./toposort.md)
- 强连通分量 → [scc](./scc.md)
- 最短路径 → [shortest](./shortest.md)
