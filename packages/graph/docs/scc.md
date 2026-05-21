# SCC · 强连通分量与缩点

[← 回到索引](./index.md)

## 什么是 SCC

有向图中，**强连通分量**（Strongly Connected Component, SCC）是节点的极大集合，其中任意两节点 `u`、`v` 都互相可达。

```
   a → b → c
   ↑       ↓
   f ← e ← d
```

`{a, b, c, d, e, f}` 是一个 SCC：每个节点都能沿有向边走到任意其他节点。

DAG 视角下，把每个 SCC 折叠成一个超节点（"缩点 / condensation"），就得到一张无环图。这是很多依赖分析、循环检测的基础。

## API

```ts
import { scc, kosaraju, condensation } from '@opendesign/graph';

scc(g);             // NodeId[][]：各分量数组（分量内按 discover 顺序）
kosaraju(g);        // 同上签名（互为参照实现）
condensation(g);    // { components, index, edges }
```

### scc · Pearce 2016 算法

```ts
const sccs = scc(g);   // [[a, b, c, d, e, f]]
```

实现见 [`algorithms/scc.ts`](../core/algorithms/scc.ts)。要点：

- **单 `rindex: Int32Array`** 编码三态（0 未访问 / >0 在栈 low / <0 已完成分量号）
- 空间约为经典 Tarjan 实现（disc/low/onStack 三数组）的 **1/2**，缓存命中显著更好
- 复杂度：**O(V + E)**
- 迭代 DFS，深图不栈溢出

参考：Pearce, D.J. (2016). "A space-efficient algorithm for finding SCCs." IPL 116(1).

### kosaraju · 两遍 DFS

```ts
const sccs = kosaraju(g);
```

[`algorithms/kosaraju.ts`](../core/algorithms/kosaraju.ts)。流程：

1. 在原图上跑 DFS，收集后序栈（`postorder`）
2. 在反向图（`reversed(g)`）上按后序的**逆序**跑 DFS；每棵 DFS 树就是一个 SCC

复杂度同样 O(V + E)，但常数比 Pearce 稍大（要走两遍 DFS）。`kosaraju` 留作**参照实现**，便于测试和教学。

### condensation · 缩点

```ts
const { components, index, edges } = condensation(g);

// components: NodeId[][]
// index:      Map<NodeId, number>  节点 → 所属分量号
// edges:      Array<{ from: number, to: number }>  分量间的边（去重 + 无自环）
```

**仅返回纯数据描述，不构造新的 Graph 实例**。需要把结果包成新图自行构造即可。

性能细节：`(from, to)` 用 `from * stride + to` 整数编码去重，避免每条候选边都做字符串拼接（[源码](../core/algorithms/condensation.ts)）。

## 适用场景

| 场景 | 用什么 |
|---|---|
| 检测"是否有环" | `isCyclic(g)` 比 `scc(g)` 快 |
| 找出所有环 | `scc(g)` 过滤 `c.length > 1` 即环 |
| 把含环图变成 DAG 跑拓扑 | `condensation(g)` 后再 toposort |
| 依赖分析"哪些模块互相递归依赖" | `scc(g)` 直接给出分组 |
| 教学 / 测试参照 | `kosaraju(g)` |

## 例子：识别 npm 包循环依赖

```ts
import { scc } from '@opendesign/graph';

const components = scc(packageGraph);
const cycles = components.filter((c) => c.length > 1);
for (const cycle of cycles) {
  console.warn('Cycle:', cycle.join(' → '));
}
```

## 例子：缩点后做拓扑

```ts
import { Graph, condensation, toposort, type NodeId } from '@opendesign/graph';

const { components, edges } = condensation(g);

// 构造 SCC 序号图
const dag = new Graph<{ size: number }, void>('dag' as any);
components.forEach((c, i) => {
  const v = new Vertex(String(i) as NodeId, { size: c.length });
  v.addInput('x', Socket.any);
  v.addOutput('y', Socket.any);
  dag.addNode(v);
});
for (const { from, to } of edges) {
  dag.connect([String(from) as NodeId, 'y'], [String(to) as NodeId, 'x']);
}

const order = toposort(dag);   // SCC 序号的拓扑序
```

## 性能笔记

- **scc(g)** 是默认选择：单 typed-array + Pearce 算法，空间最省
- **频繁重跑** → 先 `csr(g)` 再 `scc(csrGraph)`，再省一截常数（见 [csr](./csr.md)）
- **condensation** 内部已调用 `scc`，无需重复算

## 下一步

- 拓扑排序 → [toposort](./toposort.md)
- 最短路径 → [shortest](./shortest.md)
- 桥与割点 → [analysis](./analysis.md)
