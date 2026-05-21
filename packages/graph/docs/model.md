# Model · 数据元模型

[← 回到索引](./index.md)

`@opendesign/graph` 把"一张图"拆成了五个清晰角色。理解它们以及它们之间的引用关系是用好这个库的基础。

```
   Socket ◄── Port (Input | Output) ◄── Vertex
                       ▲
                       │ 端点指向
                  Endpoint
                       ▲
                       │ source / target
                     Edge
                       ▲
                       │ 容纳
                     Graph
```

## Socket — 端口数据类型

`Socket` 描述"这个端口承载什么类型的数据"，用于**连边时校验兼容性**。

```ts
import { Socket } from '@opendesign/graph';

Socket.number;   // 内置：数值
Socket.string;
Socket.boolean;
Socket.object;
Socket.array;
Socket.exec;     // 纯执行流，不传数据
Socket.any;      // 通配，与任意类型兼容

// 自定义：声明等价集合
const url = new Socket('url', [Socket.string]);   // url ↔ string 互通
```

兼容规则（[Socket.matches](../core/classic/socket.ts) 实现）：

1. 任一方为 `'*'` → 兼容
2. 同名 → 兼容
3. 名字出现在另一方的 `compatible` 列表 → 兼容

## Port — 端口（抽象 + Input / Output）

`Port` 是节点上的端口。两个子类只用来携带 `direction` 字段：

- [`Input`](../core/classic/input.ts)：`direction = 'input'`
- [`Output`](../core/classic/output.ts)：`direction = 'output'`

**关键设计：每个 Port 自己持有 `edges: EdgeId[]`** —— 这是邻接表的"数据"。`Graph` 没有任何中央邻接缓存；所有邻接查询都从端口的 edges 列表派生。

```
节点 a (output 'y')  ←─持有─  edges: [e0, e1, e2]
                              这就是"a 经 y 端口流出的所有边"
```

- [attach / detach](../core/classic/port.ts) 是 O(1)（swap-and-pop + 内部 `_index: Map<EdgeId, number>`）
- 代价：detach 不保留插入顺序

## Vertex — 节点

```ts
import { Vertex, Socket, type NodeId } from '@opendesign/graph';

type AddIn = { lhs: Socket<'number'>; rhs: Socket<'number'> };
type AddOut = { sum: Socket<'number'> };

const adder = new Vertex<AddIn, AddOut, { label: string }>(
  'add1' as NodeId,
  { label: '加法器' },          // weight：任意载荷
);
adder.addInput('lhs', Socket.number);
adder.addInput('rhs', Socket.number);
adder.addOutput('sum', Socket.number);
```

三个泛型参数：

- `I`：输入端口形态（`{ portName: Socket }`），影响 `addInput<K extends keyof I>` 的键约束
- `O`：输出端口形态
- `W`：附带的数据载荷类型（节点上随便挂业务字段）

实例字段：

```ts
vertex.inputs    // Inputs<I> = { [K in keyof I]?: Input<I[K]> }
vertex.outputs   // Outputs<O>
vertex.weight    // W | undefined
vertex.id        // NodeId
```

API：

- `addInput / addOutput / removeInput / removeOutput`
- `hasInput / hasOutput`
- `input(name) / output(name)`：按名取实例

### Vertex 与 Node：用户面 vs 存储面

```ts
// 用户面：声明时带具体端口形态
const v: Vertex<AddIn, AddOut, MyData> = ...;

// 存储面：擦除端口形态
type Node<W> = Vertex<Sockets, Sockets, W>;
g.nodes  // Map<NodeId, Node<MyData>>
```

同一个实例，TS 类型上两种视角自由切换。`Graph<N, E>` 不必为每种端口形态实例化。

## Endpoint — 节点+端口的组合

```ts
// Endpoint = { node: Vertex, port: Port }，以及 nodeId/portId 便捷访问器
const ep = new Endpoint(vertex, vertex.output('sum')!);
ep.nodeId   // 'add1'
ep.portId   // 'add1:output:sum'
```

`Edge` 的 source / target 都是 Endpoint。

## Edge — 有向边

```ts
import { Edge, Endpoint, type EdgeId } from '@opendesign/graph';

const e = new Edge<number>(
  'e0' as EdgeId,
  new Endpoint(a, a.output('y')!),
  new Endpoint(b, b.input('x')!),
  3.14,    // weight：边上的业务数据
);

e.sourceId         // 'a'
e.targetId         // 'b'
e.opposite('input')   // 'a'（从 target 看入边，对面是 source）
e.opposite('output')  // 'b'
e.connects('a' as NodeId)  // true
```

## Graph — 主容器

```ts
import { Graph, type GraphId } from '@opendesign/graph';
const g = new Graph<MyNode, MyEdge>('g' as GraphId);
```

`Graph` 继承自 `Model`，分两层职责：

- **Model**：存储 + CRUD + 基础 trait + 事件订阅（组合 `Registry` 与 `Signal`）
- **Graph**：查询层（邻居、边、度数、序列化）

### 加节点 / 边的几种姿势

```ts
// 显式 addEdge
g.addEdge(new Edge('e0' as EdgeId, srcEp, tgtEp, weight));

// 流式 connect（推荐）：自动构造 Endpoint + Edge
g.connect(['a' as NodeId, 'y'], ['b' as NodeId, 'x'], { weight: 1, id: 'e0' as EdgeId });

// 不传 id → 自动按 e0/e1/e2... 递增分配
g.connect(['a' as NodeId, 'y'], ['b' as NodeId, 'x']);
```

### 移除

```ts
g.removeNode('a' as NodeId);  // 先发所有相邻 edgeRemoved，再发 nodeRemoved
g.removeEdge('e0' as EdgeId);
g.clear();                    // 不触发事件（批量清空场景的设计）
```

## 几个常见陷阱

1. **`removeNode` 会打乱 `at(i)` 索引顺序**（swap-and-pop）。不要在长时间循环里依赖删除后的 `at(i)` 稳定性。
2. **Endpoint 必须指向 Graph 实际持有的 Vertex 实例**。同 ID 的另一个 Vertex 会被 `validate` 拒绝（防"孤儿"）。
3. **clear 不触发事件**。批量清空时若有订阅者，需要订阅者另作处理。

## 下一步

- 查询邻居和边 → [query](./query.md)
- 理解 trait 解耦 → [traits](./traits.md)
- 错误处理 → [errors](./errors.md)
