# Events · 事件订阅 + 事务

[← 回到索引](./index.md)

`Graph` 通过组合 [`@opendesign/signal`](../../signal/README.md) 提供**类型化事件总线**，配合 `batch(work)` 事务化批量 CRUD。

## 四个事件

```ts
interface Events<N, E> {
  nodeAdded:   { node: Node<N> };
  nodeRemoved: { node: Node<N> };
  edgeAdded:   { edge: Edge<E> };
  edgeRemoved: { edge: Edge<E> };
}
```

## 订阅

```ts
g.signal.on('nodeAdded',   ({ node }) => { console.log('+', node.id); });
g.signal.on('nodeRemoved', ({ node }) => { console.log('-', node.id); });
g.signal.on('edgeAdded',   ({ edge }) => { console.log('e+', edge.id); });
g.signal.on('edgeRemoved', ({ edge }) => { console.log('e-', edge.id); });

// 全部事件（通配符）
g.signal.watch((type, event) => {
  console.log('[event]', String(type), event);
});

// once
g.signal.once('nodeAdded', ({ node }) => { /* 只触发一次 */ });

// off
const off = g.signal.on('nodeAdded', handler);
off();   // 取消订阅
g.signal.off('nodeAdded', handler);   // 等价

// AbortSignal 集成
const ac = new AbortController();
g.signal.on('nodeAdded', handler, { signal: ac.signal });
ac.abort();   // 自动 off
```

完整 API 见 [`@opendesign/signal` README](../../signal/README.md)。

## 派发顺序与原子性

- **先具体事件 → 再通配符**：先派发到 `on('nodeAdded')` 的所有 handler，再派发到 `watch` 的所有 handler
- **emit 前 slice handlers**：派发期间 handler 内部 `on/off` **不影响**当次派发
- **`removeNode` 的事件顺序**：先发所有相邻 `edgeRemoved`，最后发 `nodeRemoved`
- **`clear()` 不触发事件**：批量清空时事件风暴反而碍事；订阅者保留

### 异常托管

```ts
import { Signal } from '@opendesign/signal';

const g = new Graph(...);
// 默认：handler 抛错会中断当次 emit
// 想吞错继续派发：必须重建 signal（不推荐）

// 或者在 handler 内部 try/catch
g.signal.on('nodeAdded', (e) => {
  try { doSomething(e); } catch (err) { logger.error(err); }
});
```

## batch · 事务 API

事务化批量 CRUD：内部产生的事件被**推迟到事务结束**才统一派发。

```ts
const result = g.batch(() => {
  g.addNode(a);
  g.addNode(b);
  g.connect(['a', 'y'], ['b', 'x']);
  return 'done';
});
result;   // 'done'
```

### 应用场景

#### 1. 大图加载/反序列化跳过 N×事件分发

```ts
import { unpack } from '@opendesign/graph';
// unpack 内部已用 graph.batch() 包裹，1000 节点加载也只 emit 1000 次（drain 阶段一次性）
const g = unpack(compactData);
```

#### 2. 让增量算法只感知一次终态

```ts
const topo = new IncrementalTopo(g);

g.batch(() => {
  g.addNode(A);
  g.addNode(B);
  g.connect(['A', 'y'], ['B', 'x']);
  g.addNode(C);
  g.connect(['B', 'y'], ['C', 'x']);
});

// IncrementalTopo 此时一次性收到 3 nodeAdded + 2 edgeAdded
// 而不是中间态触发 5 次重排
```

### 嵌套用计数器

```ts
g.batch(() => {                // depth = 1
  g.addNode(a);
  g.batch(() => {              // depth = 2
    g.addNode(b);
    // 内层退出，depth = 1，仍在事务，事件不 drain
  });
  // 外层退出，depth = 0，统一 drain
});
```

### 异常路径：仍然 drain

```ts
expect(() => {
  g.batch(() => {
    g.addNode(a);
    throw new Error('boom');
  });
}).toThrow();

// a 已经在图中，nodeAdded 事件也已经派发到订阅者
// 图结构与事件流不分裂
```

## 用事件做增量计算的几种模式

### 模式 1：维护派生缓存

```ts
const inDegree = new Map<NodeId, number>();

g.signal.on('nodeAdded', ({ node }) => inDegree.set(node.id, 0));
g.signal.on('edgeAdded', ({ edge }) => {
  inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) + 1);
});
g.signal.on('edgeRemoved', ({ edge }) => {
  inDegree.set(edge.targetId, (inDegree.get(edge.targetId) ?? 0) - 1);
});
g.signal.on('nodeRemoved', ({ node }) => inDegree.delete(node.id));
```

### 模式 2：日志 / undo 流

```ts
const history: Array<{ type: string; payload: unknown }> = [];

g.signal.watch((type, event) => {
  history.push({ type: String(type), payload: event });
});
```

### 模式 3：增量算法

`IncrementalTopo` 就是这个模式的范例：

```ts
import { IncrementalTopo } from '@opendesign/graph';

const topo = new IncrementalTopo(g);
// 自动订阅 4 个事件，按 Pearce-Kelly 算法增量维护拓扑序

g.addNode(A);
g.connect(['A', 'y'], ['B', 'x']);
topo.rank(A);   // 实时查询，无需手动 sync

topo.dispose();   // 释放对图的事件订阅
```

详见 [toposort](./toposort.md#增量拓扑--incrementaltopo)。

## 反射 / 调试

```ts
g.signal.has();                 // 全图是否有监听器
g.signal.has('nodeAdded');      // 该事件键
g.signal.count('nodeAdded');    // 监听器数
g.signal.names();               // 所有有监听器的事件键
g.signal.listeners('edgeAdded'); // 监听器列表浅拷贝
```

## Disposable 风格

```ts
{
  using g = new Graph(...);   // 还没原生支持，需要自己写 wrapper
  // ...
}
```

如果用 `using`，记得 `signal[Symbol.dispose]()` 会清空所有订阅 —— 这一点在 IncrementalTopo 内部就是用 dispose() 模式做的。

## 下一步

- 用事件做增量维护 → [toposort#增量拓扑](./toposort.md#增量拓扑--incrementaltopo)
- 大图加载性能 → [serialize](./serialize.md)
- 错误类型 → [errors](./errors.md)
