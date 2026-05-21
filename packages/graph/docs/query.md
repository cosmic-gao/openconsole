# Query · 查询邻居、边、度数

[← 回到索引](./index.md)

`Graph` 提供**两套**邻接/边查询 API，分别面向"用户/业务代码"和"算法/适配器层"。本文教你怎么选。

## 一图选 API

| 我想要... | 用 | 返回 |
|---|---|---|
| 一个节点的所有入边（含完整 Edge 对象、可读 endpoint） | `incoming(id)` | `Edge<E>[]` |
| 同上，但流式不构造数组 | `getIncoming(id)` | `Iterable<EdgeView<E>>` |
| 所有前驱节点（数组） | `predecessors(id)` | `NodeId[]` |
| 所有前驱节点（lazy） | `upstream(id)` | `Iterable<NodeId>` |
| 某节点入度（O(端口数)） | `inDegree(id)` | `number` |
| 全图所有边 | `getEdges()` | `Iterable<EdgeView<E>>` |

**经验法则**：
- **用户代码 / 一次性读**：用数组返回的快捷封装
- **算法 / 适配器 / 跨 trait 复用**：用 lazy generator
- **大图 + 只查度数**：直接 `inDegree/outDegree`（O 端口数）而不是 `incoming.length`

## 节点维度

### 邻居

```ts
g.predecessors(id);   // NodeId[]  — Array.from(upstream)
g.successors(id);     // NodeId[]  — Array.from(downstream)
g.adjacencies(id);    // NodeId[]  — pre + suc（自环出现 2 次）

// lazy 版（算法层用）
for (const u of g.upstream(id))   {}    // 仅前驱
for (const v of g.downstream(id)) {}    // 仅后继
for (const w of g.neighbors(id))  {}    // pre + suc
for (const w of g.neighbors(id, 'input'))  {}  // 仅前驱
for (const w of g.neighbors(id, 'output')) {}  // 仅后继
```

⚠️ **adjacencies vs incident 语义差异**：
- `adjacencies(id)` —— 端点序列：自环节点会 yield **2 次**
- `incident(id)` —— 边集去重：自环边只出现 **1 次**

如果你需要"唯一邻居集合"，用 `new Set(g.adjacencies(id))`。

### 度数

```ts
g.inDegree(id);    // 入度，O(num_inputs)
g.outDegree(id);   // 出度，O(num_outputs)
g.degree(id);      // 总度数
```

实现细节：直接对节点的所有 input/output 端口求 `edges.length`，**不**走完整邻接枚举。

### 边集

```ts
// 数组形式（用户面）
g.incoming(id);    // Edge<E>[]：流入节点的所有边
g.outgoing(id);    // Edge<E>[]：流出节点的所有边
g.incident(id);    // Edge<E>[]：incoming ∪ outgoing，自环只 1 次

// lazy 形式（算法面）
for (const e of g.getIncoming(id)) {}   // EdgeView
for (const e of g.getOutgoing(id)) {}
for (const e of g.getEdges())       {}  // 全图所有边
```

## 边维度

```ts
// 边的两端
g.endpoints(edgeId);    // [NodeId, NodeId] | undefined

// 两节点之间的边
g.findEdge(src, tgt);   // Edge | undefined（多重边只返第一条）
g.between(src, tgt);    // Edge[]：所有 src → tgt
g.connecting(a, b);     // Edge[]：a-b 双向所有（无向语义；自环用 between(a, a)）

// 是否相邻
g.adjacent(src, tgt);   // boolean
```

## 全图集合

```ts
g.nodeCount();              // 节点数
g.edgeCount();              // 边数
g.empty();                  // 节点数 === 0

for (const id of g.nodeIds) {}   // 节点 ID 可迭代
for (const id of g.edgeIds) {}   // 边 ID 可迭代

g.getNode(id);              // Node | undefined
g.getEdge(id);              // Edge | undefined
g.hasNode(id) / g.hasEdge(id);
```

## O(1) 索引访问

`Graph` 实现了 `NodeIndexable` trait，提供稠密索引：

```ts
g.bound();          // 当前索引上界（不一定等于 nodeCount）
g.at(i);            // NodeId | undefined（i 在 [0, bound) 时通常有值）
g.indexOf(id);      // number（不存在返回 -1）
```

适用：Dijkstra 距离数组、Floyd-Warshall 二维矩阵等"数组型算法"。

⚠️ `removeNode` 走 **swap-and-pop**，索引顺序会被打乱。不要假设删除后 `at(i)` 仍是同一个 NodeId。

## EdgeView：算法层的轻量边视图

很多算法只关心 `(source, target, weight)`，不关心 EdgeId 和完整的 Endpoint 对象。`EdgeView<E>` 就是为这类场景设计的轻量值：

```ts
interface EdgeView<E> {
  readonly id: EdgeId;
  readonly source: NodeId;
  readonly target: NodeId;
  readonly weight: E | undefined;
}
```

`getIncoming` / `getOutgoing` / `getEdges` 都返回 `EdgeView`。**适配器**（如 `Reversed`）可以零成本地翻转 source/target 而不重新构造完整 `Edge`。详见 [adapters](./adapters.md)。

## 性能笔记

- **`incoming(id).length` 不如 `inDegree(id)`** —— 前者构造数组，后者只读端口长度
- **算法内层循环**别用 `predecessors(id)`（每次新建数组），改用 `upstream(id)` lazy
- **CSR 视图**对 `upstream/downstream/inDegree/outDegree` 都是 O(1)；多次算法重跑场景下提速 5-20×，见 [csr](./csr.md)

## 下一步

- 把算法解耦于具体存储 → [traits](./traits.md)
- 跑遍历算法 → [traversal](./traversal.md)
- 高性能场景 → [csr](./csr.md)
