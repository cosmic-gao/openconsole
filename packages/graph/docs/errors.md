# Errors · 类型化错误层

[← 回到索引](./index.md)

库里所有抛出的错误都是 [`GraphError`](../core/classic/errors.ts) 的具体子类，**每个子类**带固定 `code` 字段，方便 `instanceof` 或 `code` 分支。

## 错误家族

```
GraphError (基类)
├── Duplicate       code='duplicate'    同 ID 节点/边已存在
├── Missing         code='missing'      节点/边/端口不存在
├── Cycle           code='cycle'        检测到环（拓扑场景）
├── SocketMismatch  code='socket'       端口 Socket 不兼容
├── Misdirected     code='direction'    端口方向错（source 不是 output）
├── Negative        code='negative'     算法收到负权边
└── Schema          code='schema'       反序列化版本不匹配
```

## 用法

```ts
import { Cycle, Duplicate, Missing, GraphError, toposort } from '@opendesign/graph';

try {
  toposort(g);
} catch (err) {
  if (err instanceof Cycle) {
    console.log('环上节点:', err.nodes);     // NodeId[]
    return;
  }
  if (err instanceof GraphError) {
    console.log('Graph 错误:', err.code, err.message);
    return;
  }
  throw err;   // 未知错误继续上抛
}
```

## 各错误详解

### Duplicate

```ts
g.addNode(vertex);   // 同 ID 已存在 → throw new Duplicate('node', vertex.id)
g.addEdge(edge);     // 同 ID 已存在 → throw new Duplicate('edge', edge.id)
```

代码字段：

```ts
class Duplicate extends GraphError {
  code: 'duplicate';
  constructor(kind: 'node' | 'edge', id: NodeId | EdgeId);
}
```

### Missing

```ts
// addEdge：source/target 节点不存在
g.addEdge(badEdge);   // throw new Missing('node', sourceId)

// connect：端口找不到
g.connect(['a', 'nope'], ['b', 'x']);   // throw new Missing('port', 'a:nope', 'connect source output')

// validate（addEdge 内部）：端点指向不一致
// throw new Missing('node', sourceId, `referenced by edge "..." source`)
```

```ts
class Missing extends GraphError {
  code: 'missing';
  constructor(kind: 'node' | 'edge' | 'port', id: NodeId | EdgeId | PortId, hint?: string);
}
```

### Cycle

```ts
import { toposort, Cycle } from '@opendesign/graph';
try {
  toposort(g);
} catch (err) {
  if (err instanceof Cycle) {
    console.log(err.nodes);    // 环上节点（readonly NodeId[]）
  }
}
```

```ts
class Cycle extends GraphError {
  code: 'cycle';
  readonly nodes: ReadonlyArray<NodeId>;
}
```

> 默认 `toposort` 遇环抛 `Cycle`；传 `onCycle` 回调可压制。

### SocketMismatch

```ts
const a = new Vertex(...);
a.addOutput('y', Socket.string);
const b = new Vertex(...);
b.addInput('x', Socket.number);

g.connect(['a', 'y'], ['b', 'x']);
// throw new SocketMismatch('string', 'number', edgeId)
```

```ts
class SocketMismatch extends GraphError {
  code: 'socket';
  constructor(source: string, target: string, edge: EdgeId);
}
```

### Misdirected

```ts
// 把 input 端口当 source 用（异常路径）
const edge = new Edge('e0', new Endpoint(a, a.input('x')!), ...);
g.addEdge(edge);
// throw new Misdirected('source', 'output', 'input', portId)
```

```ts
class Misdirected extends GraphError {
  code: 'direction';
  constructor(role: 'source' | 'target', expected: 'input' | 'output', got: string, port: PortId);
}
```

### Negative

```ts
import { dijkstra, Negative } from '@opendesign/graph';

const negEdgeCost = (e) => -1;
try {
  dijkstra(g, src, undefined, negEdgeCost);
} catch (err) {
  if (err instanceof Negative) {
    console.log('不能用 Dijkstra：负权边在', err.message);
  }
}
```

适用算法：`dijkstra` / `bidijkstra` / `astar`。

```ts
class Negative extends GraphError {
  code: 'negative';
  constructor(cost: number, edge: EdgeId);
}
```

### Schema

```ts
import { unpack, Schema } from '@opendesign/graph';

try {
  unpack(oldFormatData);
} catch (err) {
  if (err instanceof Schema) {
    console.log('版本不匹配，需要迁移');
  }
}
```

```ts
class Schema extends GraphError {
  code: 'schema';
  constructor(got: unknown, expected: number);
}
```

## 错误处理策略建议

### 1. 业务边界：分类 catch

```ts
try {
  doStuff(graph);
} catch (err) {
  if (err instanceof Duplicate) return res.status(409).json({ code: err.code });
  if (err instanceof Missing)   return res.status(404).json({ code: err.code, message: err.message });
  if (err instanceof Cycle)     return res.status(400).json({ code: err.code, nodes: err.nodes });
  if (err instanceof GraphError) return res.status(400).json({ code: err.code });
  throw err;
}
```

### 2. 调试时只关心是不是图错误

```ts
} catch (err) {
  if (err instanceof GraphError) {
    logger.warn(`graph: ${err.code}`, err);
    // 继续
  } else {
    throw err;
  }
}
```

### 3. 跨语言 / 网络协议传输

```ts
// 错误码是稳定字符串，可直接序列化
res.status(400).json({ kind: 'graph_error', code: err.code, message: err.message });
```

## 自定义错误？

如果业务层需要再细分（如"重复但允许覆盖" vs "重复禁止"），建议：

```ts
class DuplicateAllowed extends Duplicate {
  // 继续继承 GraphError → instanceof GraphError 仍然命中
}
```

不建议在库外抛新的"图错误"基类 —— `GraphError` 已经覆盖了库内所有 throw 点。

## 下一步

- 业务侧建图的安全模式 → [recipes#安全建图](./recipes.md)
- 序列化错误处理 → [serialize](./serialize.md)
