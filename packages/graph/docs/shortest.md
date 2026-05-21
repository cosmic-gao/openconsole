# Shortest · 最短路径家族

[← 回到索引](./index.md)

| 算法 | 适用 | 复杂度 | 备注 |
|---|---|---|---|
| `dijkstra` | 非负权重，单源到多终点 | O((V+E) log V) | PairingHeap + 真 decrease-key |
| `bidijkstra` | 非负权重，**单源单汇** | 实践更快 | 双向搜索 + 提前终止 + 平衡扩展 |
| `astar` | 非负权重，有启发函数 | ≤ Dijkstra | consistent heuristic 保最优 |

> **没有负权？** 用 Dijkstra 家族就够。需要负权请等 Bellman-Ford（暂未提供）。

## 三选一速查

```
有终点 + 有启发函数 → astar
有终点 + 无启发      → bidijkstra
多终点 / 只算距离   → dijkstra
```

## dijkstra

```ts
import { dijkstra } from '@opendesign/graph';

const dist: Map<NodeId, number> = dijkstra(
  g,
  start,
  undefined,                                // 不提前终止
  (edge) => (edge.weight as number) ?? 1,   // 边代价（必须 ≥ 0）
);

const distToA = dist.get('A' as NodeId);  // undefined 表示不可达
```

或带终点提前终止：

```ts
const dist = dijkstra(g, start, end, edgeCost);
const length = dist.get(end);
```

实现要点（[`algorithms/dijkstra.ts`](../core/algorithms/dijkstra.ts)）：

- 使用 `PairingHeap` + 稳定句柄 `PairingNode`，提供 **O(1) 摊销 decrease-key**
- 每个节点在堆中**至多一份**（relax 触发 `update` 而非重复入堆）
- 负权立刻抛 `Negative`，**不静默给出错误答案**

## bidijkstra

```ts
import { bidijkstra } from '@opendesign/graph';

const result = bidijkstra(g, start, end, edgeCost);
if (result) {
  console.log(result.distance);  // 7
  console.log(result.path);      // [start, ..., end]
}
```

实现要点（[`algorithms/bidijkstra.ts`](../core/algorithms/bidijkstra.ts)）：

- 前向 Dijkstra 在原图、后向 Dijkstra 在反向图，**在中间相遇**
- **提前终止**：`topF + topB >= μ`（两堆栈顶之和 ≥ 当前已知最优 μ）→ 未探索区域已没有改进可能
- **平衡扩展**：每轮弹哪边 top 更小走哪边，保持两侧工作量均衡
- 通过 `bwd.dist` 路径合并 + `fwd.link/bwd.link` 反向追溯路径

适用：地图导航、社交图"求两人最短关系链"等单源单汇场景。

参考：arXiv 2410.14638 (2024) — Bidirectional Dijkstra's Algorithm is Instance-Optimal.

## astar

```ts
import { astar } from '@opendesign/graph';

const result = astar(
  g,
  start,
  end,
  (edge) => edge.weight as number,
  (node) => heuristic(node, end),    // 你的启发函数
);

if (result) console.log(result.distance, result.path);
```

实现要点（[`algorithms/astar.ts`](../core/algorithms/astar.ts)）：

- f = g + h；堆按 f 排序
- 默认启发为 `() => 0`，此时 **退化为 Dijkstra**
- 与 dijkstra 共用 PairingHeap + 真 decrease-key

### 启发函数（heuristic）约束

| 性质 | 不等式 | 后果 |
|---|---|---|
| **admissible**（不高估） | `h(v) ≤ realDist(v, end)` | 保证返回最优路径 |
| **consistent / monotone**（更严） | `h(u) ≤ cost(u,v) + h(v)` | 还保证每节点只 settle 一次 |

不一致但仍 admissible 的启发也能给出最优解，但同一节点可能被多次松弛，性能略降。

### 常见启发设计

- **2D 网格 + 欧氏代价**：`h(v) = √((vx-ex)² + (vy-ey)²)` —— admissible, consistent
- **2D 网格 + 仅水平/垂直移动**：`h(v) = |vx-ex| + |vy-ey|`（Manhattan）—— admissible, consistent
- **道路网**：landmark 距离下界 / contraction hierarchies（高级）
- **抽象图**：能算出"两节点最小可能距离"的任何下界都行

参考：Hart, P.E.; Nilsson, N.J.; Raphael, B. (1968). "A Formal Basis for the Heuristic Determination of Minimum Cost Paths." IEEE Trans. SSC 4(2).

## 边权来源的几种姿势

```ts
// 1. 直接读 edge.weight（默认）
const cost = (edge) => edge.weight as number;

// 2. 默认权重 1
const cost = (edge) => (edge.weight as number) ?? 1;

// 3. 用 weighted() helper 简化默认值（仅类型）
import { weighted } from '@opendesign/graph';
const cost = (edge) => weighted(edge, 1).weight;

// 4. 业务级转换
const cost = (edge) => {
  const meta = edge.weight as { distance: number; trafficFactor: number };
  return meta.distance * meta.trafficFactor;
};
```

## 负权 / 等权 / 无权图

| 图特性 | 推荐 |
|---|---|
| 无权（每边代价相同） | `bfs(g, root)` 即可，无需 dijkstra |
| 等权或非负权 | `dijkstra` / `bidijkstra` / `astar` |
| **含负权** | 暂未提供 Bellman-Ford；可在外部实现或先消除负权 |

## 性能笔记

- **PairingHeap > BinaryHeap**：本库 dijkstra/bidijkstra/astar 都用 PairingHeap 提供真 decrease-key，避免 lazy "重复入堆 + pop 时跳过过期"的常数损耗
- **大图 + 多次重跑** → 先 `csr(g, weightFn)` 把图编译成 typed-array，节点循环更快（见 [csr](./csr.md)）
- **图静止 + 重复查询** → 考虑外部 contraction hierarchies / landmark heuristics 配合 `astar`

## 下一步

- 桥与割点、支配树 → [analysis](./analysis.md)
- 高性能 → [csr](./csr.md)
- 错误处理（Negative 等） → [errors](./errors.md)
