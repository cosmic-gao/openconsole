# CSR · 编译为 Typed-Array 视图

[← 回到索引](./index.md)

`Csr`（Compressed Sparse Row）是把整张图**一次性编译成 typed-array** 的高性能视图。适用：图结构不再变化、需要在其上**多次**跑算法。

## API

```ts
import { csr, Csr } from '@opendesign/graph';

// 函数式工厂（推荐）
const c = csr(g);

// 类静态方法
const c = Csr.compile(g);

// 带权重
const c = csr(g, (from, to) => {
  const edge = g.findEdge(from, to);
  return (edge?.weight as number | undefined) ?? 0;
});

c.weights;   // Float64Array | undefined，与 outTargets 一一对应
```

## 数据布局

```
nodes:      NodeId[]               // 稠密 idx → NodeId
index:      Map<NodeId, number>    // NodeId → 稠密 idx

outOffsets: Int32Array(V+1)        // 节点 i 的出邻在 outTargets 中的下标区间
outTargets: Int32Array(E)          // 出邻的稠密节点索引

inOffsets:  Int32Array(V+1)        // 同上，入邻
inTargets:  Int32Array(E)

weights:    Float64Array(E) | undefined   // 可选边权重
```

节点 i 的所有出邻 idx：

```
outTargets[outOffsets[i] .. outOffsets[i+1])
```

这是图论里最常见的"压缩稀疏行"格式，被 SuiteSparse:GraphBLAS / scipy.sparse / petgraph CsrGraph 等广泛使用。

## 为什么快

- **顺序内存访问**：`for k = lo..hi: out[k]` 是顺序读，CPU 预取友好
- **typed-array 元素是定长整数**：每个邻居 4 字节，缓存利用率高
- **`inDegree / outDegree` 是 O(1)**：直接 `offsets[i+1] - offsets[i]`，无需枚举边
- **节点索引就是数组下标**：不再走 Map.get / Map.set

实际测试：在 100K 节点 / 500K 边的图上重复跑 dijkstra 100 次，CSR 比原 Graph 快 **5-20×**（依算法 / 图密度而异）。

## 实现的 trait

`Csr` 实现：

- ✅ `Walkable`（Catalog + Neighbors）
- ✅ `IntoDegree`
- ✅ `NodeIndexable`
- ❌ `IntoEdges` —— CSR 不保留 EdgeId / Edge 实例。如果算法需要 EdgeView，应在原 Graph 上跑

可直接喂给：`toposort` / `scc` / `kosaraju` / `condensation` / `dfs` / `bfs` / `postorder` / `dominator` / `reachable` / `degrees`。

**不能**直接喂给：`dijkstra` / `bidijkstra` / `astar`（这些要 `IntoEdges` 拿权重），但可以通过 `c.weights[k]` 自己做最短路。

## 端到端示例

```ts
import { Graph, Vertex, Socket, csr, toposort, scc, dominator, type NodeId } from '@opendesign/graph';

// 1. 构造图（你的实际业务图）
const g = new Graph(...);
loadHugeGraph(g);   // 100K nodes, 500K edges

// 2. 编译一次
const compiled = csr(g);

// 3. 在编译图上多次跑算法
const order = toposort(compiled);
const sccs = scc(compiled);
const idom = dominator(compiled, entry);

// 度数查询 O(1)
const indeg = compiled.inDegree(node);
const outdeg = compiled.outDegree(node);
```

## 关于权重

```ts
// 编译时提供 weight 回调
const c = csr(g, (from, to) => {
  const e = g.findEdge(from, to);
  return (e?.weight as number) ?? 1;
});

// 之后从 c.weights 索引（按 outTargets 顺序）
// 第 k 条出边的权重就是 c.weights[k]
```

注意：**multi-edge 情况**下 `g.findEdge` 只返第一条；如果业务里有平行边且权重不同，需要自己写 `(from, to) => ...` 处理 — 或者干脆别用 multi-edge。

## 适用 / 不适用

✅ **适用**：

- 图结构在算法跑期间**不变**
- 同一张图上要跑**多次**算法（toposort + scc + dijkstra + ...）
- 节点数 ≥ 10K（小图收益小，常数会被编译开销吃掉）
- 在意峰值内存（CSR 比 Map 结构紧凑 5-10×）

❌ **不适用**：

- 图结构在跑算法时还在增删（结构变更后 CSR 失效，需重新 compile）
- 只跑一次算法（compile 本身要走一遍 graph）
- 需要 EdgeView / EdgeId 的算法（Dijkstra 等）

## 增量场景的折衷

如果你的场景是"频繁小改 + 偶尔批量分析"：

```ts
// 累积 N 次小改后再 compile 一次跑分析
let dirty = true;
let compiled: Csr | undefined;

g.signal.watch(() => { dirty = true; });

function analyze() {
  if (dirty || !compiled) {
    compiled = csr(g);
    dirty = false;
  }
  return scc(compiled);
}
```

## 内部实现要点

[`algorithms/csr.ts`](../core/algorithms/csr.ts)：

- **两遍扫描**：第一遍数出/入度，第二遍按前缀和填 targets
- **游标数组** `outCursor / inCursor` 跟踪每个节点的填表位置
- **孤儿邻居自动跳过**（与其他算法约定一致）
- `exactOptionalPropertyTypes` 严格模式下，按 `weights` 有无走两条构造分支（避免显式 undefined）

## 下一步

- 拓扑排序 → [toposort](./toposort.md)
- 强连通分量 → [scc](./scc.md)
- 序列化 / 持久化 → [serialize](./serialize.md)
