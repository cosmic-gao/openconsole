# @opendesign/graph 教程索引

类型化端口、trait 解耦、零成本视图、紧凑序列化的有向图核心模型。

本目录是按主题拆分的教程；每篇围绕**一个概念或一类算法**展开，并尽量给出"WHY/HOW/WHEN"三段式说明。

---

## 推荐学习路径

### 🟢 新手（30 分钟内跑起来）

1. [intro](./intro.md) — 安装、第一个图、跑一次拓扑排序
2. [model](./model.md) — Socket / Port / Vertex / Edge / Graph 五件套
3. [query](./query.md) — 边和邻居怎么读，两套 API 怎么选

### 🟡 进阶（理解抽象 + 算法选型）

4. [traits](./traits.md) — 算法为何不依赖 `Graph` 而依赖 trait
5. [traversal](./traversal.md) — DFS / BFS / Postorder + visit 三色事件流
6. [toposort](./toposort.md) — 拓扑排序家族 + 增量拓扑
7. [scc](./scc.md) — Pearce / Kosaraju + 缩点
8. [shortest](./shortest.md) — Dijkstra / 双向 Dijkstra / A*
9. [analysis](./analysis.md) — 桥与割点、支配树、可达性、邻域、度数

### 🔵 高阶（视图、性能、持久化、集成）

10. [adapters](./adapters.md) — Reversed / NodeFilter / EdgeFilter 零成本视图
11. [events](./events.md) — Signal 事件订阅 + batch 事务
12. [csr](./csr.md) — 编译为 typed-array CSR 加速热路径
13. [serialize](./serialize.md) — pack / unpack / remap / diff / apply / invert
14. [errors](./errors.md) — 类型化错误层与 catch 策略

### 🧰 速查

15. [recipes](./recipes.md) — 常见场景配方与 FAQ

---

## 全图导航

```
intro ─── model ─── query ─┬─ traits ─── traversal ─── toposort
                            │                            └── (Topo 遍历器)
                            │
                            ├─ scc ─── condensation
                            │
                            ├─ shortest ─── (dijkstra ↔ bidijkstra ↔ astar)
                            │
                            ├─ analysis ─── (bridges/dominator/reachable/...)
                            │
                            ├─ adapters ─── (Reversed/NodeFilter/EdgeFilter)
                            │
                            ├─ events ─── batch ─── 增量算法（IncrementalTopo）
                            │
                            ├─ csr ─── 给算法层提速 5-20×
                            │
                            └─ serialize ─── diff/apply/invert （undo/redo）
```

---

## 设计哲学（一页摘要）

| 维度 | 选择 | 原因 |
|---|---|---|
| **节点存储** | `Map<NodeId, Node>` + `Registry` 双向索引 | O(1) 寻址，删除 swap-and-pop |
| **邻接** | 端口自带 `edges: EdgeId[]` | 无中央缓存，无失效问题 |
| **算法接口** | 依赖 `Walkable` / `IntoEdges` 等 trait | 不绑死实现，CSR 等自定义存储可复用算法 |
| **事件** | 类型化 `Signal<Events>` | `nodeAdded` / `edgeAdded` 等强类型订阅；增量算法基石 |
| **错误** | `GraphError` + 7 个具体子类 | `instanceof Duplicate` / `Missing` 精准分支 |
| **视图** | trait 转发、不复制数据 | `Reversed(NodeFilter(g))` 可任意嵌套 |
| **算法** | 经典论文实现 + 迭代 + typed-array | 深图不栈溢出，cache-friendly |

---

## 包的位置

```
@opendesign/graph
├── 依赖：@opendesign/heap（Dijkstra/A* 用 PairingHeap）
├── 依赖：@opendesign/signal（事件总线）
└── 被依赖：@opendesign/flow（Node-RED + LangGraph 风格运行时）
```

完整源码结构见根 [README](../README.md) "模块边界"小节。
