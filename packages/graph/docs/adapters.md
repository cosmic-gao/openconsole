# Adapters · 零成本视图（Reversed / NodeFilter / EdgeFilter）

[← 回到索引](./index.md)

适配器是对图的**包装视图**：

- **不复制底层数据** —— O(1) 内存
- **只做 trait 转发** —— 包装后仍满足 trait，所有算法都能用
- **可任意嵌套** —— 你可以 `Reversed(NodeFilter(EdgeFilter(g, ep), np))`

## Reversed · 反向图

```ts
import { reversed, dfs, toposort } from '@opendesign/graph';

const r = reversed(g);

// 反向上的 DFS = 原图的祖先遍历
for (const ancestor of dfs(r, node)) {}

// 反向拓扑序
toposort(reversed(g));

// 与 Kosaraju 自动协作
import { kosaraju } from '@opendesign/graph';
kosaraju(g);   // 内部自己 reversed 跑第二遍 DFS
```

实现要点（[`adapters/reversed.ts`](../core/adapters/reversed.ts)）：

| 调用 | 转发 |
|---|---|
| `r.upstream(v)` | `g.downstream(v)` |
| `r.downstream(v)` | `g.upstream(v)` |
| `r.getIncoming(v)` | `g.getOutgoing(v)` + 翻转 source/target |
| `r.getOutgoing(v)` | `g.getIncoming(v)` + 翻转 source/target |
| `r.inDegree(v)` | `g.outDegree(v)`（或枚举 fallback） |
| `r.outDegree(v)` | `g.inDegree(v)` |

构造时**一次性探测**内层能力位（`_caps`），运行时分支用 boolean 字段，避免每次调用都做 `typeof === 'function'` 反射。

### 边权重泛型自动推导

```ts
// g: Graph<X, number>
const r = reversed(g);   // r: Reversed<G, number>
// E 通过 EdgeOf<G> 类型推导，无需手动指定
```

### nodeIds / edgeIds 一致性

`reversed` 不影响节点集合，所以 `nodeIds` 直接透传。`edgeIds` 与 `getEdges` 保持同步：内层没有 `getEdges` 时返回空可迭代（不泄漏 inner 的 edgeIds）。

## NodeFilter · 节点过滤

```ts
import { NodeFilter, dfs } from '@opendesign/graph';

const onlyData = new NodeFilter(g, (id) => {
  return g.getNode(id)?.weight?.kind === 'data';
});

// onlyData 上跑算法 = 只看 'data' 节点构成的子图
for (const id of dfs(onlyData, root)) {}
```

行为（[`adapters/filter/node.ts`](../core/adapters/filter/node.ts)）：

- 被隐去的节点不出现在 `nodeIds`
- 邻居 / 边视图中两端都需保留才会 yield
- `predicate` 用 `(id: NodeId) => boolean`

## EdgeFilter · 边过滤

```ts
import { EdgeFilter } from '@opendesign/graph';

// 只看权重 > 0 的边
const positive = new EdgeFilter(g, (e) => (e.weight ?? 0) > 0);

// 只看 type = 'dataflow' 的边
const dataEdges = new EdgeFilter(g, (e) => {
  const meta = e.weight as { type: string };
  return meta?.type === 'dataflow';
});
```

行为（[`adapters/filter/edge.ts`](../core/adapters/filter/edge.ts)）：

- 节点不变，只看保留的边
- 邻居（`upstream/downstream`）由保留的边反推
- 必须依赖 `IntoEdges`（只有边视图才能高效按谓词过滤）

## 嵌套示例

适配器满足相同 trait → 可以包来包去。

```ts
import { reversed, NodeFilter, EdgeFilter, dfs } from '@opendesign/graph';

// 只看 data 节点 + 反向
const view = reversed(new NodeFilter(g, isData));
for (const ancestor of dfs(view, target)) {}

// 子图 + 只看强边 + 反向
const strongAncestors = reversed(
  new EdgeFilter(
    new NodeFilter(g, isActive),
    (e) => (e.weight as number) > 0.5,
  ),
);
```

每层都是 O(1) 包装，不构造任何中间数据结构。

## 适配器实现 trait 的覆盖矩阵

| Adapter | Catalog | Neighbors | IntoEdges | IntoDegree | Visitable | NodeIndexable | Subscribable |
|---|---|---|---|---|---|---|---|
| `Reversed` | ✅ | ✅ | ✅（按 inner 探测） | ✅（按 inner 探测） | ✅（按 inner 探测） | ✅（按 inner 探测） | ❌ |
| `NodeFilter` | ✅ | ✅ | ✅（inner 有就转发） | ❌ | ❌ | ❌ | ❌ |
| `EdgeFilter` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |

**未实现 Subscribable**：因为适配器没有独立的 mutate 入口，事件来源应是原图。如果你包了 Reversed 后想要事件，订阅原图的 `signal` 即可。

## 性能注记

- 适配器层都是 `*Iterable<NodeId>`，循环 yield，不构造数组
- 对热路径，叠加多层适配器会让每次邻居访问多走几层函数 — 通常忽略不计；如果是 inner loop 1M 次的算法，考虑先 `csr(adapter)` 把适配器结果固化成 typed-array（见 [csr](./csr.md)）
- `Reversed` fallback 路径下 `inDegree` 与 `outDegree` 各自枚举邻居，重复调用别忘 cache

## 下一步

- 算法的 trait 解耦原理 → [traits](./traits.md)
- 高性能 CSR 编译 → [csr](./csr.md)
- 事件 + batch → [events](./events.md)
