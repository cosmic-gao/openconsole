# Traversal · DFS / BFS / Postorder / visit

[← 回到索引](./index.md)

库提供两种遍历风格，选谁取决于**谁控节奏**：

| 风格 | 入口 | 谁控节奏 | 适用 |
|---|---|---|---|
| **生成器** | `dfs(g, root)` / `bfs(g, root)` / `postorder(g)` | 调用方 `for...of` 逐个消费 | 简单遍历、延迟消费 |
| **状态化遍历器** | `Dfs.start(g, r).next(g)` | 调用方手动 `next` | 暂停 / 恢复、moveTo、reset |
| **事件回调** | `visit(g, starts, visitor)` | 库内部驱动，回调返 `Control` | 三色 DFS、环检测、剪枝 |

## 函数式入口（generator）

```ts
import { dfs, bfs, postorder } from '@opendesign/graph';

for (const id of dfs(g, root))     {}   // DFS 顺序
for (const id of bfs(g, root))     {}   // BFS 顺序
for (const id of postorder(g))     {}   // 全图 DFS 后序
for (const id of postorder(g, [a, b])) {}  // 多起点
```

底层全部委托给状态化遍历器（`Dfs` / `Bfs` / `Postorder`）或 `visit`，函数式入口只是为了一行 `for...of`。

## 状态化遍历器

```ts
import { Dfs, Bfs } from '@opendesign/graph';

const it = Dfs.start(g, root);

// 手动推进
while (true) {
  const id = it.next(g);
  if (id === undefined) break;
  if (someCondition(id)) break;        // 中途中止：不再调用 next 即可
}

// 跳到新起点（保留 discovered 集合，避免重复访问）
it.moveTo(another);

// 重置
it.reset();

// 适配为可迭代
for (const id of it.iterator(g)) {}
```

实现要点：

- **Dfs**：栈式，每次 pop 时反向压邻居以保持原顺序
- **Bfs**：用游标推进队列，**不调用 `Array#shift`**（避免 O(n) 拷贝）
- **Postorder**：栈帧 `{node, neighbors: Iterator}`，**无递归**调用 → 深图不栈溢出

## visit · 三色 DFS 事件流

`visit` 是经典的"颜色 + 事件"风格 DFS，用于环检测、SCC、支配关系等高级算法。

```ts
import { visit, Control } from '@opendesign/graph';

visit(g, null, {                 // null = 按 graph.nodeIds 全图扫描
  discover(e)  { /* 节点入栈 */ return Control.Continue; },
  finish(e)    { /* 节点的所有后继都访问完 */ },
  treeEdge(e)  { /* 树边（→ 白色节点） */ },
  backEdge(e)  { /* 后向边（→ 灰色节点，环的指示） */ },
  crossEdge(e) { /* 横/前向边（→ 黑色节点） */ },
});
```

### Control 语义

任意回调可返回：

- `'continue'` —— 继续访问
- `'prune'` —— 保留当前节点，但**不再下钻**后继
- `'break'` —— 立即中止整次遍历

```ts
// 找到目标即停
visit(g, [start], {
  discover: (e) => e.node === target ? Control.Break : Control.Continue,
});
```

### 三色法

- **白色（WHITE）** —— 未访问
- **灰色（GRAY）** —— 在 DFS 栈上
- **黑色（BLACK）** —— 已 finish

边事件按 target 颜色派发：
- target 白 → `treeEdge`
- target 灰 → `backEdge` ⚠️ 环
- target 黑 → `crossEdge`

### 编写"环检测"

```ts
import { visit, Control } from '@opendesign/graph';

function hasCycle(g) {
  let found = false;
  visit(g, null, {
    backEdge() { found = true; return Control.Break; },
  });
  return found;
}
```

### 编写"找路径"

```ts
function shortestUnweighted(g, src, tgt) {
  const parent = new Map();
  let stop = false;
  visit(g, [src], {
    treeEdge(e) {
      parent.set(e.target, e.node);
      if (e.target === tgt) { stop = true; return Control.Break; }
      return Control.Continue;
    },
  });
  if (!stop) return undefined;
  const path = [tgt];
  let cur = tgt;
  while (cur !== src) { cur = parent.get(cur); path.unshift(cur); }
  return path;
}
```

（生产级"无权图最短路径"应用 [`bfs`](./traversal.md) 而不是 DFS；这只是 visit 的演示。）

## 性能与坑

- **DFS 的 reversed 压栈**让出邻居顺序与你期望一致；如果你看到顺序"反了"，多半是这个细节
- **Postorder 的 lazy 入栈**：构造时不立刻读邻居（`_initial` 字段），首次 `next` 才用 graph 拿迭代器
- **visit 是经典三色 DFS**：环检测、SCC、支配，都从这里发散

## 下一步

- 用拓扑序做依赖驱动调度 → [toposort](./toposort.md)
- 强连通分量 → [scc](./scc.md)
- 最短路径 → [shortest](./shortest.md)
