# petgraph 深度解析

> Rust 通用图数据结构库 | 四种图实现 | 丰富算法 | 零成本抽象

---

## 1. 概述与背景

### 1.1 什么是 petgraph

petgraph 是 Rust 语言的**通用图数据结构库**，诞生于 2014 年，特点是：

- **多种图实现并存**：不强迫用户接受单一实现
- **零成本抽象**：编译期泛型，无运行时开销
- **丰富的内置算法**：Dijkstra、拓扑排序、强连通分量等
- **可选特性**：通过 Cargo features 按需开启

### 1.2 核心定位

> petgraph **不是**逻辑编排引擎，但**几乎所有用 Rust 写编排引擎的项目都把它作为底层存储**。

```
逻辑编排引擎
    │
    │  用 petgraph 作为存储层
    ▼
┌──────────────────┐
│   petgraph       │  ← 图数据结构（存储）
│   Graph          │
│   StableGraph    │
│   GraphMap       │
│   MatrixGraph   │
└──────────────────┘
    │
    │  自己实现执行逻辑
    ▼
用户自定义执行引擎  ← 编排语义（执行）
```

### 1.3 Cargo 配置

```toml
# Cargo.toml
[dependencies]
petgraph = "0.6"

# 启用可选特性
[features]
default = ["graphmap", "stable_graph"]
serde-1 = ["dep:serde"]  # 序列化支持
rayon = ["dep:rayon"]     # 并行算法
```

---

## 2. 四种图实现

这是 petgraph 最有教学价值的部分。**不同的图实现 = 不同的内存布局 = 不同的性能权衡**。

### 2.1 对比表

| 类型 | 内部表示 | 索引稳定性 | 空间复杂度 | 边遍历 | 节点删除 | 适用场景 |
|------|---------|-----------|-----------|--------|---------|---------|
| **Graph** | 邻接链表 | ❌ 删除会移位 | O(\|V\|+\|E\|) | O(e') | O(e') | 临时图、不需要持久索引 |
| **StableGraph** | 邻接链表 + 空洞 | ✅ 删除不影响 | O(\|V\|+\|E\|) | O(e') | O(e') | 需要持久索引 |
| **GraphMap** | HashMap | ✅ 节点为 key | 较高 | O(1) 平均 | O(e') | 稀疏图、需要快速查找 |
| **MatrixGraph** | 邻接矩阵 | ✅ | O(\|V\|²) | O(1) | O(\|V\|) | 稠密图、需要矩阵运算 |
| **Csr** | 压缩稀疏行 | ❌ 仅追加 | O(\|V\|+\|E\|) 紧凑 | 快 | 不支持删除 | 静态图、增量构建 |

### 2.2 Graph - 基础邻接表

**适用场景**：大多数通用场景，性能优先

```rust
// 内部结构（简化）
pub struct Graph<N, E, Ty = Directed, Ix = DefaultIx> {
    nodes: Vec<Node<N, Ix>>,    // 节点数组
    edges: Vec<Edge<E, Ix>>,    // 边数组
    ty: PhantomData<Ty>,
}

pub struct Node<N, Ix = DefaultIx> {
    pub weight: N,                  // 节点关联数据
    next: [EdgeIndex<Ix>; 2],       // 出边链表头 + 入边链表头
}

pub struct Edge<E, Ix = DefaultIx> {
    pub weight: E,                  // 边关联数据
    next: [EdgeIndex<Ix>; 2],       // 同节点下一条出边 + 下一条入边
    node: [NodeIndex<Ix>; 2],       // [起点, 终点]
}
```

**关键洞察**：邻接链表不是节点持有 `Vec<Edge>`，而是节点存"第一条出边的索引"，边存"同节点下一条边的索引"——这是经典的**邻接链表数组实现**。

```rust
use petgraph::graph::{DiGraph, NodeIndex, EdgeIndex};

let mut g: DiGraph<&str, &str> = DiGraph::new();

// 添加节点，返回 NodeIndex
let a = g.add_node("A");
let b = g.add_node("B");
let c = g.add_node("C");

// 添加边
g.add_edge(a, b, "AB");
g.add_edge(b, c, "BC");
g.add_edge(a, c, "AC");

// 遍历
for node in g.node_indices() {
    println!("{:?}: {:?}", node, g[node]);
}

for edge in g.edge_indices() {
    let (s, t) = g.edge_endpoints(edge).unwrap();
    println!("{:?} -> {:?}: {:?}", s, t, g[edge]);
}
```

### 2.3 StableGraph - 索引稳定

**适用场景**：需要持久化节点 ID，或节点会被删除

```rust
use petgraph::stable_graph::{StableDiGraph, NodeIndex};

let mut g: StableDiGraph<&str, i32> = StableDiGraph::new();

let a = g.add_node("A");
let b = g.add_node("B");

// 删除节点后，索引保持有效
g.remove_node(b);  // StableGraph 允许

let c = g.add_node("C");
// c 的索引与 b 无关，不受影响
```

**与 Graph 的区别**：
- 删除节点时，原位置保留"空洞"（stub node）
- 新增节点优先填空洞，但索引空间可能膨胀
- 所有现存 `NodeIndex` 保持有效

### 2.4 GraphMap - HashMap 实现

**适用场景**：稀疏图、需要按节点引用查找

```rust
use petgraph::graphmap::{DiGraphMap, NodeTrait};

let mut g: DiGraphMap<&str, i32> = DiGraphMap::new();

// 节点可以是任意 Hash + Eq 类型
g.add_edge("A", "B", 1);
g.add_edge("B", "C", 2);
g.add_edge("A", "C", 3);

// O(1) 查找节点和边
if g.contains_edge("A", "B") {
    println!("A -> B exists, weight = {:?}", g.edge_weight("A", "B"));
}

// 遍历所有边（出/入）
for (a, b, w) in g.all_edges() {
    println!("{:?} -> {:?}: {:?}", a, b, w);
}
```

### 2.5 MatrixGraph - 邻接矩阵

**适用场景**：稠密图、需要快速判断两点是否连通

```rust
use petgraph::matrix_graph::MatrixGraph;

let mut g: MatrixGraph<&str, (), Undir> = MatrixGraph::new();

let a = g.add_node("A");
let b = g.add_node("B");
let c = g.add_node("C");

g.add_edge(a, b, ());
g.add_edge(b, c, ());

// O(1) 边查询
assert!(g.contains_edge(a, b));
assert!(!g.contains_edge(c, a));

// 获取所有邻居
let neighbors: Vec<_> = g.neighbors(a).collect();
```

### 2.6 选择指南

```
需要索引稳定？
  ├─ 是 → StableGraph
  └─ 否 → Graph

是稀疏图还是稠密图？
  ├─ 稀疏（边 << 节点²）→ Graph + algo
  ├─ 稠密（边 ≈ 节点²）→ MatrixGraph
  └─ 需要 Hash 查找 → GraphMap

需要序列化？
  └─ 是 → 启用 serde-1 特性
```

---

## 3. 数据结构详解

### 3.1 索引类型

```rust
// NodeIndex - 节点索引
let node_id: NodeIndex<u32> = NodeIndex::new(0);
let raw = node_id.index();  // 获取原始 u32 值

// EdgeIndex - 边索引
let edge_id: EdgeIndex<u32> = EdgeIndex::new(0);

// 两个索引都实现了 Copy、Clone、Hash、Eq、Ord
```

**设计原因**：
- 新类型包装避免与普通整数混淆
- 默认 `u32`（大多数场景够用，4 字节）
- 可通过 `DefaultIx` 切换为 `u64`

### 3.2 节点和边权重

```rust
// N = 节点权重类型，E = 边权重类型
let mut g: Graph<String, Vec<i32>> = Graph::new();

let node = g.add_node(String::from("hello"));
g[node] = String::from("world");  // 修改节点权重

let edge = g.add_edge(node, node, vec![1, 2, 3]);
g[edge].push(4);  // 修改边权重
```

### 3.3 有向 vs 无向

```rust
use petgraph::graph::{DiGraph, Graph};
use petgraph::EdgeType;

// 有向图
let mut dg: DiGraph<i32, ()> = DiGraph::new();
dg.add_edge(0, 1, ());
// 只从 0 出边到 1，不包含反向

// 无向图
let mut ug: Graph<i32, (), Undir> = Graph::new();
ug.add_edge(0, 1, ());
// 0-1 互通
```

---

## 4. 核心代码示例

### 4.1 基础操作

```rust
use petgraph::graph::{DiGraph, NodeIndex, EdgeIndex};
use petgraph::EdgeType;

fn main() {
    let mut g: DiGraph<&str, &str> = DiGraph::new();

    // 添加节点，返回 NodeIndex
    let a = g.add_node("A");
    let b = g.add_node("B");
    let c = g.add_node("C");

    // 添加边，返回 EdgeIndex
    let e1 = g.add_edge(a, b, "AB");
    let e2 = g.add_edge(b, c, "BC");
    let e3 = g.add_edge(a, c, "AC");

    // 节点数量
    println!("Nodes: {:?}", g.node_count());

    // 边数量
    println!("Edges: {:?}", g.edge_count());

    // 检查边是否存在
    println!("Has edge a->b: {:?}", g.contains_edge(a, b));

    // 获取边的权重
    println!("Edge weight: {:?}", g.edge_weight(e1));

    // 查找边
    if let Some(e) = g.find_edge(a, b) {
        println!("Found edge: {:?}", e);
    }

    // 删除边
    g.remove_edge(e2);

    // 遍历节点
    for idx in g.node_indices() {
        println!("Node {:?}: {:?}", idx, g[idx]);
    }

    // 遍历边
    for idx in g.edge_indices() {
        let (s, t) = g.edge_endpoints(idx).unwrap();
        println!("Edge {:?}: {:?} -> {:?}", idx, g[s], g[t]);
    }
}
```

### 4.2 拓扑排序

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::toposort;

let mut g: DiGraph<&str, ()> = DiGraph::new();

let a = g.add_node("A");
let b = g.add_node("B");
let c = g.add_node("C");

g.add_edge(a, b, ());  // A -> B
g.add_edge(b, c, ());  // B -> C

// 拓扑排序
match toposort(&g, None) {
    Ok(order) => {
        // order: [NodeIndex(0), NodeIndex(1), NodeIndex(2)]
        for node in order {
            println!("{:?}", g[node]);
        }
    }
    Err cycle) => {
        println!("Cycle detected at: {:?}", cycle.node_id());
    }
}
```

### 4.3 Dijkstra 最短路径

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::dijkstra;
use std::collections::HashMap;

let mut g: DiGraph<&str, i32> = DiGraph::new();

let a = g.add_node("A");
let b = g.add_node("B");
let c = g.add_node("C");
let d = g.add_node("D");

g.add_edge(a, b, 4);
g.add_edge(a, c, 2);
g.add_edge(b, c, 1);
g.add_edge(b, d, 5);
g.add_edge(c, d, 8);

// 从 A 到所有节点的最短路径
let distances: HashMap<_, _> = dijkstra(&g, a, None, |e| *e.weight());

println!("{:?}", distances);
// {D: 9, C: 2, A: 0, B: 4}
```

### 4.4 DFS / BFS 遍历

```rust
use petgraph::graph::DiGraph;
use petgraph::algo::{dfs, bfs};
use petgraph::visit::{Dfs, Bfs, Walker};

let g: DiGraph<(), ()> = DiGraph::from_edges(&[
    (0, 1), (0, 2), (1, 2), (1, 3), (2, 3)
]);

// DFS
let mut dfs = Dfs::new(&g, 0.into());
while let Some(node) = dfs.next(&g) {
    println!("DFS: {:?}", node);
}

// BFS
let mut bfs = Bfs::new(&g, 0.into());
while let Some(node) = bfs.next(&g) {
    println!("BFS: {:?}", node);
}
```

---

## 5. 用作逻辑编排的存储后端

这是 petgraph 最常见的用法——作为编排引擎的图存储层。

### 5.1 定义节点语义

```rust
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::toposort;
use std::collections::HashMap;

// 定义节点类型
#[derive(Debug, Clone)]
enum NodeKind {
    // 源节点（常量）
    Constant { value: i64 },

    // 运算节点
    Add,
    Multiply,

    // 输出节点
    Print,
}

// 定义边端口（用于多输入/多输出）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Port {
    Left,
    Right,
}

// 构建图
let mut graph: DiGraph<NodeKind, Port> = DiGraph::new();

// 创建节点
let const1 = graph.add_node(NodeKind::Constant { value: 3 });
let const2 = graph.add_node(NodeKind::Constant { value: 4 });
let add = graph.add_node(NodeKind::Add);
let mul = graph.add_node(NodeKind::Multiply);
let print = graph.add_node(NodeKind::Print);

// 连接边（带端口信息）
graph.add_edge(const1, add, Port::Left);
graph.add_edge(const2, add, Port::Right);
graph.add_edge(const1, mul, Port::Left);
graph.add_edge(add, mul, Port::Right);
graph.add_edge(mul, print, Port::Left);

// 执行：拓扑排序 + 求值
let order = toposort(&graph, None).expect("Graph has cycle");
let mut values: HashMap<NodeIndex, i64> = HashMap::new();

for node_idx in order {
    let result = match &graph[node_idx] {
        NodeKind::Constant { value } => *value,

        NodeKind::Add => {
            let mut left = 0i64;
            let mut right = 0i64;
            for edge in graph.edges_directed(node_idx, petgraph::Incoming) {
                let val = values[&edge.source()];
                match edge.weight() {
                    Port::Left => left = val,
                    Port::Right => right = val,
                }
            }
            left + right
        }

        NodeKind::Multiply => {
            let mut left = 0i64;
            let mut right = 0i64;
            for edge in graph.edges_directed(node_idx, petgraph::Incoming) {
                let val = values[&edge.source()];
                match edge.weight() {
                    Port::Left => left = val,
                    Port::Right => right = val,
                }
            }
            left * right
        }

        NodeKind::Print => {
            let val = graph.edges_directed(node_idx, petgraph::Incoming)
                .next()
                .map(|e| values[&e.source()])
                .unwrap_or(0);
            println!("Result = {}", val);
            val
        }
    };

    values.insert(node_idx, result);
}

// 输出: Result = 28  ((3 + 4) * 4)
```

### 5.2 执行引擎封装

```rust
use petgraph::graph::{DiGraph, NodeIndex};
use petgraph::algo::toposort;
use std::collections::HashMap;

// 简化的执行引擎
struct GraphExecutor<N, E> {
    graph: DiGraph<N, E>,
    values: HashMap<NodeIndex, Box<dyn std::any::Any>>,
}

impl<N: Clone, E: Clone> GraphExecutor<N, E> {
    fn new() -> Self {
        GraphExecutor {
            graph: DiGraph::new(),
            values: HashMap::new(),
        }
    }

    fn add_node(&mut self, node: N) -> NodeIndex {
        self.graph.add_node(node)
    }

    fn add_edge(&mut self, from: NodeIndex, to: NodeIndex, port: E) {
        self.graph.add_edge(from, to, port);
    }

    // 用户需要提供求值函数
    fn execute<F>(&mut self, mut eval: F)
    where
        F: FnMut(&N, &[(E, &Box<dyn std::any::Any>)]) -> Box<dyn std::any::Any>,
    {
        let order = toposort(&self.graph, None).expect("Graph has cycle");

        for node_idx in order {
            // 收集输入
            let inputs: Vec<_> = self.graph
                .edges_directed(node_idx, petgraph::Incoming)
                .map(|e| (e.weight().clone(), self.values.get(&e.source()).unwrap()))
                .collect();

            // 求值
            let result = eval(&self.graph[node_idx], &inputs);

            // 存储结果
            self.values.insert(node_idx, result);
        }
    }
}
```

---

## 6. Visitor Traits 设计

petgraph 把算法与具体图实现解耦的核心机制。

### 6.1 核心 Traits

```rust
// 能列出直接邻居
trait IntoNeighbors {
    fn neighbors(self, NodeId) -> Self::Neighbors;
}

// 能列出所有出边
trait IntoEdges {
    fn edges(self, NodeId) -> Self::Edges;
}

// 能列出所有边引用
trait IntoEdgeReferences {
    fn edge_references(self) -> Self::EdgeRefs;
}

// 节点可映射到整数索引
trait NodeIndexable {
    fn node_bound(&self) -> usize;
    fn from_index(idx: usize) -> Self;
    fn to_index(&self) -> usize;
}

// 能维护"已访问"集合
trait Visitable: Sized {
    type Map;
    fn visit_map(&self) -> Self::Map;
}
```

### 6.2 算法如何使用 Traits

```rust
// dijkstra 算法签名
pub fn dijkstra<G, F, I>(
    graph: G,
    start: G::NodeId,
    end: Option<G::NodeId>,
    edge_cost: F,
) -> HashMap<G::NodeId, I>
where
    G: IntoEdgeReferences + IntoNeighbors + NodeIndexable + Visitable,
    F: FnMut(G::EdgeRef) -> I,
    I: Float,
{
    // 使用 IntoEdgeReferences 遍历所有边
    // 使用 IntoNeighbors 查找邻居
    // 使用 NodeIndexable 映射索引
    // 使用 Visitable 维护已访问集合
}
```

**好处**：任何实现这些 trait 的类型都能被 dijkstra 消费——包括**虚拟图**（节点是 SQL 表、API 端点等）。

---

## 7. 序列化支持

```rust
use petgraph::graph::{DiGraph, NodeIndex};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
struct MyNode {
    name: String,
    value: i32,
}

#[derive(Serialize, Deserialize)]
struct MyEdge {
    weight: f32,
}

let mut g: DiGraph<MyNode, MyEdge> = DiGraph::new();

// 添加节点和边...

// 序列化
let json = serde_json::to_string(&g).unwrap();

// 反序列化
let loaded: DiGraph<MyNode, MyEdge> = serde_json::from_str(&json).unwrap();
```

---

## 8. DOT 输出

```rust
use petgraph::graph::DiGraph;
use petgraph::dot::{Dot, Config};

let mut g: DiGraph<&str, &str> = DiGraph::new();
g.add_edge("A", "B", "AB");
g.add_edge("B", "C", "BC");

// 输出 Graphviz DOT 格式
println!("{:?}", Dot::with_config(&g, &[Config::EdgeNoLabel]));

// 输出:
// digraph {
//     0 [label="A"]
//     1 [label="B"]
//     2 [label="C"]
//     0 -> 1 [label="AB"]
//     1 -> 2 [label="BC"]
// }
```

---

## 9. 并行算法

启用 `rayon` 特性后可用并行版本：

```rust
use petgraph::algo::toposort_par;
use petgraph::graph::DiGraph;

let g: DiGraph<i32, ()> = DiGraph::from_edges(&[
    (0, 1), (1, 2), (2, 3), (0, 4), (4, 5), (5, 3)
]);

// 并行拓扑排序
let order = toposort_par(&g).unwrap();
```

---

## 10. 核心设计模式

### 10.1 模式一：零成本抽象

```rust
// Graph 是泛型结构，编译时具体化为无虚函数调用的代码
// 对比：dyn NodeTrait 有虚表开销

let g1: Graph<i32, ()> = Graph::new();     // 静态分发，无虚表
let g2: DiGraph<String, f64> = DiGraph::new();  // 静态分发，无虚表
```

### 10. 模式二：组合优于继承

```rust
// 不使用 trait 对象，而是用泛型 + associated types

struct GraphExecutor<G, F>
where
    G: IntoNeighbors + IntoEdgeReferences,
    F: FnMut(G::EdgeRef) -> i32,
{
    graph: G,
    evaluator: F,
}

// 任何实现 IntoNeighbors + IntoEdgeReferences 的类型都可用
```

### 10.3 模式三：可选特性

```toml
# 用户按需开启
[features]
default = ["graphmap", "stable_graph"]  # 默认开启
serde-1 = []     # 需要时手动开启
rayon = []       # 需要并行时开启
```

---

## 11. 与其他库的对比

### 11.1 petgraph vs indexgraph

| 维度 | petgraph | indexgraph |
|------|----------|------------|
| 图类型 | 多种 | 仅一种 |
| 边权重 | 支持 | 仅无权重 |
| 删除操作 | 支持 | 不支持 |
| 序列化 | 可选 | 内置 |

### 11.2 petgraph vs gephi

| 维度 | petgraph | gephi |
|------|----------|-------|
| 语言 | Rust | Java |
| 定位 | 库 | 应用 |
| 可视化 | 无 | 有 |
| 算法 | 内置 | 内置 |

---

## 12. 优缺点分析

### 12.1 优点

1. **零成本抽象**：编译期泛型，无虚表开销
2. **多种实现**：根据场景选择最优
3. **丰富算法**：Dijkstra、拓扑排序、强连通分量等
4. **Rust 生态集成**：与 serde、rayon 等无缝协作
5. **索引稳定性**（StableGraph）：适合需要持久引用的场景

### 12.2 缺点

1. **无内置可视化**：只是数据结构
2. **学习曲线**：多种图实现需要理解权衡
3. **修改图后迭代器可能失效**：需要小心处理

---

## 13. 推荐阅读与资源

### 官方资料
- [docs.rs/petgraph](https://docs.rs/petgraph/)
- [GitHub - petgraph/petgraph](https://github.com/petgraph/petgraph)

### 深度解析
- **Depth-First.com** - *Graphs in Rust: An Introduction to Petgraph*
- **Timothy Hobbs** - *petgraph-internals*

### 相关项目
- **petgraph crate 0.8** (当前稳定版)
- **petgraph trunk** (正在开发 0.9，多 crate 布局)

---

## 14. 小结

petgraph 是 **Rust 图数据结构的最佳实践**，其设计精髓：

1. **多种图实现并存**：Graph、StableGraph、GraphMap、MatrixGraph 各有适用场景
2. **零成本抽象**：泛型实现，无虚表开销
3. **Visitor traits**：算法与存储解耦
4. **可选特性**：serde、rayon 按需开启

作为编排引擎的存储层，petgraph 可以让我们专注于**执行语义**，而把**图存储和遍历**交给库处理。

---

## 15. 源码深度解析

> 本节基于 petgraph master 分支真实源码（仓库已迁移为 Cargo workspace，主代码位于 `crates/petgraph/src/`）。所有引用的代码均为逐字摘录。

### 15.1 核心数据结构：`Graph<N, E, Ty, Ix>`

```rust
// crates/petgraph/src/graph_impl/mod.rs
pub struct Graph<N, E, Ty = Directed, Ix = DefaultIx> {
    nodes: Vec<Node<N, Ix>>,
    edges: Vec<Edge<E, Ix>>,
    ty: PhantomData<Ty>,
}
```

四个泛型参数承担不同维度的抽象：
- `N` / `E`：节点/边的负载（weight）
- `Ty`：方向性标签类型（`Directed` 或 `Undirected`），仅作为编译期标记存在于 `PhantomData<Ty>` 中，**不占运行时空间**
- `Ix`：索引底层类型（默认 `u32`），通过 `IndexType` trait 抽象

默认配置 (`u32` 索引) 在 64 位机上每个 `NodeIndex` 仅 4 字节，是 `Box<dyn Node>` 风格继承体系的 1/4 ~ 1/8。

### 15.2 邻接表的链表小技巧

```rust
// crates/petgraph/src/graph_impl/mod.rs
pub struct Node<N, Ix = DefaultIx> {
    pub weight: N,
    next: [EdgeIndex<Ix>; 2],
}

pub struct Edge<E, Ix = DefaultIx> {
    pub weight: E,
    next: [EdgeIndex<Ix>; 2],
    node: [NodeIndex<Ix>; 2],
}
```

**「双链头嵌入式邻接表」**：

- `Node.next[0]` 指向该节点的**第一条出边**；`Node.next[1]` 指向**第一条入边**
- `Edge.next[0]` 指向**与同一源节点共享的下一条出边**；`Edge.next[1]` 指向**与同一目标节点共享的下一条入边**
- `Edge.node[0]` / `node[1]` 分别为源、目标节点

整个邻接结构因此被两条**侵入式单向链表**串起。这种布局让所有边都连续存储在一个 `Vec<Edge>` 里，**缓存友好性远好于 `HashMap<Node, Vec<Edge>>` 方案**，并且 `add_edge` 是 O(1) 头插，无需任何分配。

### 15.3 类型安全的 newtype 索引

```rust
#[derive(Copy, Clone, Default, PartialEq, Eq, Ord, Hash)]
pub struct NodeIndex<Ix = DefaultIx>(Ix);

#[derive(Copy, Clone, Default, PartialEq, Eq, Ord, Hash)]
pub struct EdgeIndex<Ix = DefaultIx>(Ix);
```

把 `NodeIndex` 与 `EdgeIndex` 做成 newtype，编译器从此拒绝把节点索引误用为边索引——Rust 类型系统的零开销护栏。`NodeIndex<u32>` 在内存中就是一个裸 `u32`。

### 15.4 `add_edge` 的链表头插

```rust
// crates/petgraph/src/graph_impl/mod.rs
pub fn try_add_edge(
    &mut self,
    a: NodeIndex<Ix>,
    b: NodeIndex<Ix>,
    weight: E,
) -> Result<EdgeIndex<Ix>, GraphError> {
    let edge_idx = EdgeIndex::new(self.edges.len());
    let mut edge = Edge {
        weight,
        node: [a, b],
        next: [EdgeIndex::end(); 2],
    };
    match index_twice(&mut self.nodes, a.index(), b.index()) {
        Pair::One(an) => {
            edge.next = an.next;
            an.next[0] = edge_idx;
            an.next[1] = edge_idx;
        }
        Pair::Both(an, bn) => {
            edge.next = [an.next[0], bn.next[1]];
            an.next[0] = edge_idx;
            bn.next[1] = edge_idx;
        }
        Pair::None => return Err(GraphError::NodeOutBounds),
    }
    self.edges.push(edge);
    Ok(edge_idx)
}
```

`index_twice` 一次性获取两个节点的可变借用，规避 Rust 的双借用规则；自环（`a == b`）走 `Pair::One` 分支。整体复杂度严格 O(1)。

### 15.5 类型级方向分派：`EdgeType` + `PhantomData`

```rust
// crates/petgraph/src/lib.rs
pub trait EdgeType {
    fn is_directed() -> bool;
}

#[derive(Clone, Copy, Debug)]
pub enum Directed {}

#[derive(Clone, Copy, Debug)]
pub enum Undirected {}

impl EdgeType for Directed {
    #[inline]
    fn is_directed() -> bool { true }
}

impl EdgeType for Undirected {
    #[inline]
    fn is_directed() -> bool { false }
}
```

两个关键设计点：

1. `Directed` / `Undirected` 被定义为**空 enum**——它们永远不能被实例化，仅作为类型层的标签。
2. `is_directed()` 是**关联函数**而非方法。配合 `#[inline]`，编译器在单态化阶段就能把 `if self.is_directed()` 折叠成 `if true` 或 `if false`，连同下游的死代码一起被消除。

这正是 Rust「**zero-cost abstraction**」的教科书示例：方向性这个概念在源码里随处可见，但二进制里**根本不存在 `Ty` 字段、不存在分支跳转**。

`Direction` 本身是 `#[repr(usize)]` 的 enum：

```rust
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd, Ord, Eq, Hash)]
#[repr(usize)]
pub enum Direction {
    Outgoing = 0,
    Incoming = 1,
}
```

显式写成 0/1 是为了让 `dir.index()` 直接当数组下标用（`iter.next[1 - k]`），完美对应 `Node.next: [EdgeIndex; 2]` 的两个槽位。

### 15.6 链表迭代器：`Neighbors`

```rust
impl<E, Ix> Iterator for Neighbors<'_, E, Ix>
where Ix: IndexType,
{
    type Item = NodeIndex<Ix>;

    fn next(&mut self) -> Option<NodeIndex<Ix>> {
        match self.edges.get(self.next[0].index()) {
            None => {}
            Some(edge) => {
                self.next[0] = edge.next[0];
                return Some(edge.node[1]);
            }
        }
        while let Some(edge) = self.edges.get(self.next[1].index()) {
            self.next[1] = edge.next[1];
            if edge.node[0] != self.skip_start {
                return Some(edge.node[0]);
            }
        }
        None
    }
}
```

逻辑：先沿 `next[0]`（出边链）吐节点，链尽后再沿 `next[1]`（入边链）继续。整个迭代过程**不分配内存**，每次 `next()` 调用就是几次数组索引。

### 15.7 访问者 trait 体系：算法/容器解耦

```rust
// crates/petgraph/src/visit/mod.rs
pub trait GraphBase {
    type NodeId: Copy + PartialEq;
    type EdgeId: Copy + PartialEq;
}

pub trait GraphRef: Copy + GraphBase {}
impl<G> GraphRef for &G where G: GraphBase {}

pub trait IntoNeighbors: GraphRef {
    type Neighbors: Iterator<Item = Self::NodeId>;
    fn neighbors(self, a: Self::NodeId) -> Self::Neighbors;
}

pub trait NodeIndexable: GraphBase {
    fn node_bound(&self) -> usize;
    fn to_index(&self, a: Self::NodeId) -> usize;
    fn from_index(&self, i: usize) -> Self::NodeId;
}

pub trait Visitable: GraphBase {
    type Map: VisitMap<Self::NodeId>;
    fn visit_map(&self) -> Self::Map;
    fn reset_map(&self, map: &mut Self::Map);
}
```

设计亮点：

- **`GraphRef: Copy`**：算法接受 `G: GraphRef` 而非 `&G`，意味着图的「不可变视图」是按值传递的、可任意复制的——内部就是一个引用，但语义上像句柄。
- **`Visitable::Map`**：把「节点是否被访问过」抽象成关联类型。`Graph` 提供位图实现 (`FixedBitSet`)，`GraphMap` 提供 `HashSet` 实现，**算法代码完全无感**。
- **`NodeIndexable`**：让算法可以把 `NodeId` 临时映射为连续的 `usize`，从而以 `Vec<T>` 替代 `HashMap<NodeId, T>`。

### 15.8 算法层：用 trait bound 编写一次，处处可跑

#### Dijkstra 的 relax 循环

```rust
// crates/petgraph/src/algo/dijkstra.rs
while let Some(MinScored(node_score, node)) = visit_next.pop() {
    if visited.is_visited(&node) { continue; }
    if goal_fn(&node) { goal_node = Some(node); break; }
    for edge in graph.edges(node) {
        let next = edge.target();
        if visited.is_visited(&next) { continue; }
        let next_score = node_score + edge_cost(edge);
        match scores.entry(next) {
            Occupied(ent) => if next_score < *ent.get() {
                *ent.into_mut() = next_score;
                visit_next.push(MinScored(next_score, next));
            },
            Vacant(ent) => {
                ent.insert(next_score);
                visit_next.push(MinScored(next_score, next));
            }
        }
    }
    visited.visit(node);
}
```

整段代码**没有任何对 `Graph` 的提及**——它只用 `G::NodeId`、`graph.edges(node)`、`edge.target()`、`visited.visit(...)`。这意味着同一份 dijkstra 既能跑在 `&Graph<_,_,Directed,_>` 上，也能跑在 `&StableGraph` 或任意第三方实现了 `IntoEdges + Visitable` 的图上，**单态化后零运行时分发开销**。

#### Toposort 中的 `Reversed` 适配器

```rust
// crates/petgraph/src/algo/mod.rs (部分)
pub fn toposort<G>(...) -> Result<Vec<G::NodeId>, Cycle<G::NodeId>>
where
    G: IntoNeighborsDirected + IntoNodeIdentifiers + Visitable,
{
    ...
    dfs.reset(g);
    for &i in &finish_stack {
        dfs.move_to(i);
        let mut cycle = false;
        while let Some(j) = dfs.next(Reversed(g)) {
            if cycle { return Err(Cycle(j)); }
            cycle = true;
        }
    }
}
```

**`Reversed(g)`** 是一个零成本的图视图包装器，把所有 `IntoNeighbors` 调用反向。petgraph 不需要真的复制图来反转：仅靠一层 trait 适配器就完成了「图的逆」操作。同理，`NodeFiltered`、`EdgeFiltered`、`Undirected adapter` 都是几十行 trait 转发代码，**运行时零开销**。

### 15.9 设计哲学小结

| 抽象层 | 实现手段 | Zero-cost 体现 |
| --- | --- | --- |
| 方向性 | `EdgeType` trait + `PhantomData<Ty>` + 空 enum | `Ty::is_directed()` 在单态化时折叠为常量 |
| 索引宽度 | `IndexType` trait + `Ix` 泛型 (默认 `u32`) | `NodeIndex<u32>` 在内存里就是裸 `u32` |
| 邻接结构 | `Vec<Edge>` + `next: [EdgeIndex; 2]` 嵌入式链表 | `add_edge` O(1)，遍历无堆分配 |
| 算法/容器解耦 | `IntoNeighbors` / `IntoEdges` / `Visitable` 等细粒度 trait | 所有调用编译期单态化，无 `dyn` |
| 图变换 | `Reversed`、`NodeFiltered` 等转发包装 | 不复制图，只做 trait 适配 |
| 类型安全 | `NodeIndex` / `EdgeIndex` newtype | 0 运行时开销，编译期拒绝混用 |

petgraph 是「**一座抽象大厦完全靠零成本砖块砌成**」的优秀样本，也解释了为什么 Rust 生态中后续的 graph 库（`graphlib`、`pathfinding`）很大程度上仍以 petgraph 的访问者 trait 设计为蓝本。

**关键源码引用清单**：
- `crates/petgraph/src/graph_impl/mod.rs` — `Graph`, `Node`, `Edge`, `NodeIndex`, `EdgeIndex`, `try_add_edge`, `Neighbors`
- `crates/petgraph/src/lib.rs` — `EdgeType` trait, `Directed`, `Undirected`, `Direction`
- `crates/petgraph/src/visit/mod.rs` — `GraphBase`, `GraphRef`, `IntoNeighbors`, `Visitable`
- `crates/petgraph/src/algo/dijkstra.rs` — `dijkstra`, `MinScored`
- `crates/petgraph/src/algo/mod.rs` — `toposort`, `Cycle<N>`, `Reversed` 适配器
