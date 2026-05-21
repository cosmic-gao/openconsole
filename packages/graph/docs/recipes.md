# Recipes · 实战配方与 FAQ

[← 回到索引](./index.md)

围绕常见场景的代码片段集合。每个配方都是端到端、可直接复制粘贴改业务字段即用的形态。

---

## 1. 依赖驱动构建（DAG 流水线）

```ts
import { Graph, Socket, Vertex, toposort, type NodeId, type GraphId } from '@opendesign/graph';

type Task = { name: string; run: () => Promise<unknown> };

const g = new Graph<Task, void>('build' as GraphId);

function task(name: string, deps: string[], run: () => Promise<unknown>) {
  const v = new Vertex(name as NodeId, { name, run });
  v.addInput('in', Socket.exec);
  v.addOutput('out', Socket.exec);
  g.addNode(v);
  for (const d of deps) g.connect([d as NodeId, 'out'], [name as NodeId, 'in']);
}

task('compile', [], async () => { /* ... */ });
task('test',    ['compile'], async () => { /* ... */ });
task('bundle',  ['compile'], async () => { /* ... */ });
task('publish', ['test', 'bundle'], async () => { /* ... */ });

// 按拓扑序依次执行
for (const id of toposort(g)) {
  const data = g.getNode(id)!.weight!;
  console.log('▶', data.name);
  await data.run();
}
```

---

## 2. 检测循环依赖并报出环

```ts
import { isCyclic, scc, type NodeId } from '@opendesign/graph';

if (isCyclic(g)) {
  for (const cycle of scc(g)) {
    if (cycle.length > 1) {
      console.warn('Cycle:', cycle.join(' → '));
    }
  }
}
```

---

## 3. "影响面分析"：改了 A 会影响谁

```ts
import { descendants, type NodeId } from '@opendesign/graph';

const downstream = descendants(g, 'A' as NodeId);
console.log(`改 A 会影响 ${downstream.length} 个下游：`, downstream);
```

---

## 4. "依赖追溯"：A 依赖谁

```ts
import { ancestors, type NodeId } from '@opendesign/graph';

const upstream = ancestors(g, 'A' as NodeId);
console.log(`A 依赖于：`, upstream);
```

---

## 5. 子图过滤 + 反向

```ts
import { NodeFilter, reversed, dfs, type NodeId } from '@opendesign/graph';

// 只看"active"节点 + 反向
const view = reversed(
  new NodeFilter(g, (id) => g.getNode(id)?.weight?.status === 'active'),
);

// 找 target 在 active 子图里的所有祖先
for (const ancestor of dfs(view, target)) {
  console.log(ancestor);
}
```

---

## 6. 增量拓扑维护（编辑器场景）

```ts
import { IncrementalTopo } from '@opendesign/graph';

const topo = new IncrementalTopo(g);

editor.on('addNode', (v) => g.addNode(v));     // → topo 自动更新
editor.on('addEdge', (e) => g.addEdge(e));     // → topo 自动更新

// 用户随时查询拓扑序
function renderInOrder() {
  if (topo.hasCycle) showCycleWarning(topo.cycleNodes);
  for (const id of topo.sorted()) render(id);
}

// 编辑器关闭时
editor.on('close', () => topo.dispose());
```

---

## 7. 单源最短路 → 一组目标

```ts
import { dijkstra, type NodeId } from '@opendesign/graph';

const dist = dijkstra(g, 'home' as NodeId, undefined, (e) => e.weight as number);

['office', 'gym', 'shop'].forEach((id) => {
  console.log(`${id}: ${dist.get(id as NodeId) ?? '不可达'}`);
});
```

---

## 8. A* 在 2D 网格

```ts
import { astar, type NodeId } from '@opendesign/graph';

const start = 'r0c0' as NodeId;
const end = 'r9c9' as NodeId;

const parseRC = (id: NodeId): [number, number] => {
  const m = String(id).match(/r(\d+)c(\d+)/)!;
  return [Number(m[1]), Number(m[2])];
};

const [er, ec] = parseRC(end);
const result = astar(
  g,
  start,
  end,
  (e) => e.weight as number,
  (node) => {
    const [r, c] = parseRC(node);
    return Math.abs(r - er) + Math.abs(c - ec);   // Manhattan
  },
);
```

---

## 9. 大图加载（事件 + 性能优化）

```ts
import { unpack } from '@opendesign/graph';

// unpack 内部已用 graph.batch() 包裹
// → IncrementalTopo 等订阅者只感知一次终态
// → 减少 N×事件分发开销
const g = unpack(compactData);
```

显式批量加载更多操作：

```ts
g.batch(() => {
  for (const item of huge) {
    g.addNode(buildVertex(item));
  }
  for (const link of links) {
    g.connect([link.from as NodeId, 'out'], [link.to as NodeId, 'in']);
  }
});
```

---

## 10. 高性能多算法分析

```ts
import { csr, toposort, scc, dominator, type NodeId } from '@opendesign/graph';

const compiled = csr(g);   // 一次编译

const order = toposort(compiled);
const sccs = scc(compiled);
const idom = dominator(compiled, 'root' as NodeId);

// CSR 上的算法通常比原 Graph 快 5-20×
```

---

## 11. 撤销/重做栈

```ts
import { Graph, diff, apply, invert, pack, unpack, type GraphPatch } from '@opendesign/graph';

class History<N, E> {
  private undoStack: GraphPatch<N, E>[] = [];
  private redoStack: GraphPatch<N, E>[] = [];

  constructor(private g: Graph<N, E>) {}

  commit(work: () => void) {
    const before = unpack<N, E>(pack(this.g));   // 深拷贝
    work();
    const patch = diff(before, this.g);
    if (patch.ops.length === 0) return;
    this.undoStack.push(patch);
    this.redoStack.length = 0;
  }

  undo() {
    const patch = this.undoStack.pop();
    if (!patch) return;
    apply(this.g, invert(patch));
    this.redoStack.push(patch);
  }

  redo() {
    const patch = this.redoStack.pop();
    if (!patch) return;
    apply(this.g, patch);
    this.undoStack.push(patch);
  }
}
```

---

## 12. 安全建图：分类 catch

```ts
import { Cycle, Duplicate, GraphError, Missing, SocketMismatch } from '@opendesign/graph';

try {
  buildGraphFromInput(input);
} catch (err) {
  if (err instanceof Duplicate)     return userError('duplicate', err.message);
  if (err instanceof Missing)       return userError('missing',   err.message);
  if (err instanceof Cycle)         return userError('cycle',     err.nodes);
  if (err instanceof SocketMismatch) return userError('type',     err.message);
  if (err instanceof GraphError)    return userError('graph',     err.code);
  throw err;
}
```

---

## 13. 序列化到 LocalStorage

```ts
import { pack, unpack, packRemap, unpackRemap } from '@opendesign/graph';

// 写
localStorage.setItem('graph', JSON.stringify(packRemap(g)));

// 读
const raw = localStorage.getItem('graph');
const g = raw ? unpackRemap(JSON.parse(raw)) : new Graph(...);
```

---

## 14. 跨网络增量同步

```ts
// 服务端（每次结构变更）
const patch = diff(serverGraphOld, serverGraphNew);
ws.broadcast({ type: 'graphPatch', data: patch });

// 客户端
ws.on('graphPatch', ({ data }) => {
  apply(clientGraph, data);
});
```

---

## 15. 节点权重批量更新

```ts
g.batch(() => {
  for (const [id, w] of updates) {
    const node = g.getNode(id);
    if (node) node.weight = w;
  }
});
// 注意：直接改 weight 不触发 edgeAdded 等事件；
// 如果你的下游需要感知 weight 变化，自己用 signal.emit 或维护派生缓存
```

---

## FAQ

### Q：为什么 `removeNode` 后 `at(i)` 返回不一样的节点？

A：swap-and-pop 删除把末尾节点搬到被删位置。如果需要顺序稳定，可以在删除前 `topology(g).order` 拿一次顺序数组使用。

### Q：删了节点的边在 `signal` 上是 `edgeRemoved` 还是 `nodeRemoved` 先？

A：先全部 `edgeRemoved`（每条相邻边各一次），最后 `nodeRemoved`。

### Q：`clear()` 为什么不触发事件？

A：批量清空场景下事件风暴反而碍事。如果订阅者需要感知，可以在 `clear()` 前后自己 emit。

### Q：可以在 handler 里 `addNode` / `addEdge` 吗？

A：可以，handler 内部的 mutate 不影响当次 emit（emit 前对 handler 列表做了 `slice`）。但**事件原子性**就要自己注意了 —— 嵌套修改产生新的事件队列。

### Q：CSR 上能跑 Dijkstra 吗？

A：直接喂不行（CSR 不实现 `IntoEdges`，没法返回 EdgeView）。但你可以基于 `compiled.weights` 自己写最短路 —— 数组下标对应 `outTargets` 的顺序。

### Q：序列化格式怎么演进？

A：升级 `compact.ts` 里的 `VERSION` 常量；`unpack` 看到旧版本会抛 `Schema`。要兼容旧版本，要么在 unpack 前做迁移、要么在 unpack 里加分支。

### Q：自定义存储能用所有算法吗？

A：取决于实现了哪些 trait。最低要求是 `Walkable`（Catalog + Neighbors），覆盖了 BFS / DFS / toposort / scc / postorder / reachable / kosaraju。要跑 Dijkstra 之类的需要再实现 `IntoEdges`。详见 [traits](./traits.md)。

### Q：增量算法（IncrementalTopo）的 happy path 真的 O(1) 吗？

A：是的。新节点 `++maxRank`、不违反拓扑的新边 `rank(u) < rank(v)` 直接通过。违反才走 Pearce-Kelly 局部重排 O(|δ|)；遇环降级 dirty，下次查询全量 O(V+E)。

---

继续探索：

- 索引 → [index](./index.md)
- 错误类型 → [errors](./errors.md)
- 高性能 → [csr](./csr.md)
