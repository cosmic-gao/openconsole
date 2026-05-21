# Intro · 30 秒上手

[← 回到索引](./index.md)

## 安装

本仓库 monorepo 中直接 workspace 引用：

```json
{
  "dependencies": {
    "@opendesign/graph": "workspace:*"
  }
}
```

外部项目暂未发布到 npm（v0.0.1，private），可以 git submodule 或 vendor 方式引入。

## 第一个图

```ts
import { Graph, Socket, Vertex, toposort, type NodeId, type GraphId } from '@opendesign/graph';

// 1. 创建一张图
const g = new Graph('demo' as GraphId);

// 2. 加节点，声明端口
const a = new Vertex('a' as NodeId);
a.addOutput('y', Socket.number);
g.addNode(a);

const b = new Vertex('b' as NodeId);
b.addInput('x', Socket.number);
b.addOutput('y', Socket.number);
g.addNode(b);

const c = new Vertex('c' as NodeId);
c.addInput('x', Socket.number);
g.addNode(c);

// 3. 连边（流式 API）
g.connect(['a' as NodeId, 'y'], ['b' as NodeId, 'x']);
g.connect(['b' as NodeId, 'y'], ['c' as NodeId, 'x']);

// 4. 跑一个算法
console.log(toposort(g));  // → [NodeId('a'), NodeId('b'), NodeId('c')]
```

跑这段你就用到了：

- **Socket** — 端口数据类型，连边时自动校验兼容性
- **Vertex / Port** — 节点 + 类型化输入输出端口
- **Graph.connect** — 流式连边 API
- **toposort** — 仅依赖 `Walkable` trait 的拓扑排序算法

## 一图速览模块

```
Socket  Port  Vertex  Edge  Endpoint  ← 数据元模型
  └─ 都被 Graph 容纳

Graph (extends Model)
  ├─ CRUD：addNode / addEdge / connect / removeNode / removeEdge
  ├─ 查询：incoming / outgoing / upstream / downstream / inDegree / ...
  ├─ 事件：signal.on('nodeAdded', ...)
  └─ 事务：batch(work)

algorithms（仅依赖 trait）
  ├─ 遍历：dfs / bfs / postorder / visit
  ├─ 拓扑：toposort / topology / ranks / IncrementalTopo
  ├─ SCC：scc (Pearce) / kosaraju / condensation
  ├─ 最短路：dijkstra / bidijkstra / astar
  ├─ 结构：bridges / dominator / reachable / neighborhood / degrees
  └─ 编译：csr (compile 为 typed-array)

adapters（零成本视图）
  ├─ reversed(g)
  ├─ new NodeFilter(g, pred)
  └─ new EdgeFilter(g, pred)

serialize
  ├─ pack / unpack（紧凑元组格式，约 60-70% 体积缩减）
  ├─ packRemap / unpackRemap（UUID → 短整数）
  └─ diff / apply / invert（结构化差异 + 撤销重做）

errors
  └─ GraphError / Duplicate / Missing / Cycle / SocketMismatch / Misdirected / Negative / Schema
```

## 一些约定

- **ID 强类型**：`NodeId` / `EdgeId` / `PortId` / `GraphId` 都是 brand 字符串，互不可赋值。新代码里写 `'foo' as NodeId` 在边界处转换即可。
- **方向语义**：`Direction = 'input' | 'output'`，同一组词描述端口方向和"边相对节点的方向"。
- **lazy vs 数组**：`upstream/downstream/getEdges` 是 lazy generator；`predecessors/incoming/outgoing` 是数组快捷封装。算法层优先 lazy。

## 下一步

- 想理解每个类的角色 → [model](./model.md)
- 想知道有哪些查询 API 以及怎么选 → [query](./query.md)
- 想知道为什么算法不直接挂在 `Graph` 上 → [traits](./traits.md)
