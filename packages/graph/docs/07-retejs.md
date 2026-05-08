# Rete.js 深度解析

> 可视化编程框架 | TypeScript 优先 | 多框架适配 | 级联插件系统

---

## 1. 概述与背景

### 1.1 什么是 Rete.js

Rete.js 是由 **Vitaliy Stoliarov (ni55an)** 于 2017 年创建的 JavaScript 框架，用于**构建可视化编程界面**。

**核心定位**：
- **框架而非产品**：提供节点编辑器的构建块，而非开箱即用的产品
- **TypeScript 优先**：v2 完全重写为 TypeScript
- **多框架适配**：React、Vue、Angular、Svelte 共存

### 1.2 版本历史

| 版本 | 时间 | 特点 |
|------|------|------|
| v1 | 2017 | JavaScript，可选渲染 |
| v2 | 2023 | TypeScript 优先，Scope/Signal |

### 1.3 与 LiteGraph.js 的对比

| 维度 | Rete.js | LiteGraph.js |
|------|---------|--------------|
| **定位** | 框架（需组合） | 引擎（开箱即用） |
| **渲染** | 可插拔（多框架） | Canvas2D |
| **类型系统** | TypeScript 泛型 | 字符串 |
| **插件系统** | Scope 级联 | registerNodeType |
| **学习曲线** | 较陡 | 平缓 |
| **代码量** | 模块化 | 单文件 |

---

## 2. 三层架构

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Framework Adapters (渲染层)                            │
│                                                                  │
│  rete-react-plugin    →  React 组件渲染                         │
│  rete-vue-plugin     →  Vue 组件渲染                            │
│  rete-angular-plugin →  Angular 组件渲染                       │
│  rete-svelte-plugin  →  Svelte 组件渲染                        │
│                                                                  │
│  可共存于同一编辑器！                                            │
└─────────────────────────────────────────────────────────────────┘
                         ▲
                         │ uses
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Presets (预设)                                        │
│                                                                  │
│  ClassicPreset                                                    │
│    ├── Node          → 基础节点                                  │
│    ├── Socket        → 类型接口（用于校验）                       │
│    ├── Input/Output  → 输入/输出端口                            │
│    ├── Connection   → 连接线                                    │
│    └── Control      → 节点内 UI 控件                           │
│                                                                  │
│  可自定义扩展                                                     │
└─────────────────────────────────────────────────────────────────┘
                         ▲
                         │ uses
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Core (核心)                                           │
│                                                                  │
│  rete                                                            │
│    ├── NodeEditor     → 编辑器主类                               │
│    ├── Scope/Signal   → 级联插件系统                             │
│    └── BaseSchemes    → 类型定义                                 │
│                                                                  │
│  rete-engine                                                     │
│    ├── DataflowEngine  → 数据流引擎（Pull）                      │
│    └── ControlFlowEngine → 控制流引擎（Push）                     │
│                                                                  │
│  可替换引擎！                                                    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流引擎 vs 控制流引擎

| 引擎 | 执行模型 | 端口类型 | 用途 |
|------|---------|---------|------|
| **DataflowEngine** | Pull（下游拉取） | 数据端口 | 计算图、表达式 |
| **ControlFlowEngine** | Push（上游推送） | exec 端口 | 流程控制、状态机 |

---

## 3. Scope 与 Signal 系统

这是 Rete.js v2 的**核心创新**。

### 3.1 概念

- **Scope**：作用域，组件的容器
- **Signal**：信号，在 Scope 树中传递的数据

### 3.2 级联插件机制

```typescript
// 编辑器是一个 Scope
const editor = new NodeEditor<Schemes>();

// 叠加插件 A
editor.use(pluginA);

// 插件 A 可以再叠加插件 B
pluginA.use(pluginB);

// 形成瀑布流：
// Editor → PluginA → PluginB → PluginC
```

### 3.3 Signal 传播

```typescript
// 当 signal 从 Editor 发出，它依次穿过每个 plugin

editor.addPipe((signal) => {
    if (signal.type === 'nodecreate') {
        console.log('节点创建:', signal.data);
    }
    return signal;  // 返回 undefined 则阻止传播
});
```

### 3.4 中间件拦截

```typescript
// 拦截并修改 signal
editor.addPipe((signal) => {
    if (signal.type === 'connectioncreate') {
        // 检查类型兼容性
        if (!isCompatible(signal.data)) {
            console.warn('类型不匹配');
            return undefined;  // 阻止连接
        }
    }
    return signal;
});
```

---

## 4. 核心数据类型

### 4.1 Schemes 类型

```typescript
// 定义节点和连接的 Schemes
interface Connection<A extends Node, B extends Node> {
    readonly source: A;
    readonly target: B;
    readonly sourceKey: string;   // 输出端口名
    readonly targetKey: string;   // 输入端口名
}

interface Schemes extends BaseSchemes {
    Node: MyNode;                  // 节点类型
    Connection: MyConnection;      // 连接类型
}

type MyConnection = Connection<MyNode, MyNode>;
```

### 4.2 Node 结构

```typescript
class MyNode extends ClassicPreset.Node {
    constructor() {
        super('MyNode');

        // 添加输入端口
        this.addInput('a', new ClassicPreset.Input(socket, 'A'));
        this.addInput('b', new ClassicPreset.Input(socket, 'B'));

        // 添加输出端口
        this.addOutput('result', new ClassicPreset.Output(socket, 'Result'));
    }

    // 数据流引擎调用：返回输出数据
    data(): { result: number } {
        const a = this.getInput('a');
        const b = this.getInput('b');
        return { result: (a || 0) + (b || 0) };
    }
}
```

### 4.3 Socket（类型接口）

```typescript
// Socket 定义类型约束
const numberSocket = new ClassicPreset.Socket('number');
const stringSocket = new ClassicPreset.Socket('string');

// 连接时检查类型兼容性
// numberSocket ↔ numberSocket ✓
// numberSocket ↔ stringSocket ✗
```

---

## 5. 数据流 (Dataflow) 完整示例

### 5.1 完整代码

```typescript
import { ClassicPreset, NodeEditor, GetSchemes } from "rete";
import { DataflowEngine } from "rete-engine";
import { ReactRenderPlugin, Presets, ReactArea2D } from "rete-react-plugin";
import { createRoot } from "react-dom/client";

// 1. 定义 Socket
const socket = new ClassicPreset.Socket("number");

// 2. 定义数字常量节点
class NumberNode extends ClassicPreset.Node {
    constructor(public value: number = 0) {
        super("Number");
        this.addOutput("value", new ClassicPreset.Output(socket, "Number"));
    }

    data(): { value: number } {
        return { value: this.value };
    }
}

// 3. 定义加法节点
class AddNode extends ClassicPreset.Node {
    constructor() {
        super("Add");
        this.addInput("left", new ClassicPreset.Input(socket, "Left"));
        this.addInput("right", new ClassicPreset.Input(socket, "Right"));
        this.addOutput("value", new ClassicPreset.Output(socket, "Number"));
    }

    data(inputs: { left?: number[]; right?: number[] }): { value: number } {
        const left = (inputs.left && inputs.left[0]) || 0;
        const right = (inputs.right && inputs.right[0]) || 0;
        return { value: left + right };
    }
}

// 4. 定义 Schemes
class Conn<A extends Node, B extends Node> extends ClassicPreset.Connection<A, B> {}
type N = NumberNode | AddNode;
type C = Conn<N, N>;
interface Schemes extends GetSchemes<N, C> {}

// 5. 创建编辑器
const editor = new NodeEditor<Schemes>();

// 6. 创建数据流引擎
const engine = new DataflowEngine<Schemes>();
editor.use(engine);

// 7. 创建渲染插件
const area = new ReactArea2D<Schemes>();
const render = new ReactRenderPlugin<Schemes, ReactArea2D<any>>({ createRoot });
render.addPreset(Presets.classic.setup());
area.use(render);
editor.use(area);

// 8. 构图
const a = new NumberNode(3);
const b = new NumberNode(4);
const sum = new AddNode();

await editor.addNode(a);
await editor.addNode(b);
await editor.addNode(sum);

await editor.addConnection(new Conn(a, "value", sum, "left"));
await editor.addConnection(new Conn(b, "value", sum, "right"));

// 9. Pull 求值
const result = await engine.fetch(sum.id);
console.log(result.value);  // 7
```

### 5.2 执行流程

```
engine.fetch(sum.id)
        │
        │ 1. 拓扑排序
        ▼
    [3, 4, +, result]
        │
        │ 2. 从 NumberNode(3) 拉取
        ▼
    data() → { value: 3 }
        │
        │ 3. 从 NumberNode(4) 拉取
        ▼
    data() → { value: 4 }
        │
        │ 4. 传入 AddNode.data()
        ▼
    { left: 3, right: 4 }
        │
        │ 5. 计算并返回
        ▼
    { value: 7 }
```

---

## 6. 控制流 (ControlFlow) 完整示例

### 6.1 exec 端口

控制流节点使用 `exec` 端口：

```typescript
import { ControlFlowEngine } from "rete-engine";

// 日志节点
class LogNode extends ClassicPreset.Node {
    constructor(private text: string = "") {
        super("Log");
        this.addInput("exec", new ClassicPreset.Input(socket, "Enter", true));
        this.addOutput("exec", new ClassicPreset.Output(socket, "Out"));
    }

    // 控制流引擎调用
    execute(input: 'exec' | undefined, forward: (output: 'exec') => void) {
        console.log(this.text);
        forward("exec");  // 推送到下游
    }
}

// 延迟节点
class DelayNode extends ClassicPreset.Node {
    constructor(private seconds: number = 1) {
        super("Delay");
        this.addInput("exec", new ClassicPreset.Input(socket, "Exec", true));
        this.addOutput("exec", new ClassicPreset.Output(socket, "Exec"));
    }

    execute(input: "exec" | undefined, forward: (output: "exec") => void) {
        setTimeout(() => forward("exec"), this.seconds * 1000);
    }
}
```

### 6.2 触发执行

```typescript
// 创建控制流引擎
const engine = new ControlFlowEngine<Schemes>();
editor.use(engine);

// 启动控制流（从 start 节点）
engine.execute(startNode.id);
```

---

## 7. 混合引擎 (Hybrid)

Rete.js 可以**同时使用**两种引擎：

```typescript
// 约定：'exec' 端口走控制流，其他走数据流

const controlflow = new ControlFlowEngine<Schemes>(node => ({
    inputs: () => ['exec'],
    outputs: () => ['exec']
}));

const dataflow = new DataflowEngine<Schemes>(({ inputs, outputs }) => ({
    inputs: () => Object.keys(inputs).filter(k => k !== 'exec'),
    outputs: () => Object.keys(outputs).filter(k => k !== 'exec')
}));

editor.use(controlflow);
editor.use(dataflow);
```

这与 **UE Blueprint 的 exec pin + data pin** 完全对应。

---

## 8. 多框架渲染

### 8.1 React 渲染

```typescript
import { ReactRenderPlugin, Presets, ReactArea2D } from "rete-react-plugin";

const area = new ReactArea2D<Schemes>();
const render = new ReactRenderPlugin<Schemes, ReactArea2D<any>>({ createRoot });

render.addPreset(Presets.classic.setup());
render.addPreset(Presets.example({
    theme: 'dark',
}));

area.use(render);
editor.use(area);
```

### 8.2 Vue 渲染

```typescript
import { VueRenderPlugin } from "rete-vue-plugin";

const render = new VueRenderPlugin<Schemes>();
render.addPreset(Presets.classic.setup());

editor.use(render);
```

### 8.3 多框架共存

```typescript
// 同一编辑器中，React 和 Vue 节点共存
class ReactNode extends ClassicPreset.Node { /* ... */ }
class VueNode extends ClassicPreset.Node { /* ... */ }

// 分别用对应的渲染插件
const reactRender = new ReactRenderPlugin<Schemes, ReactArea2D>({ createRoot });
const vueRender = new VueRenderPlugin<Schemes>();

area.use(reactRender);
area.use(vueRender);
```

---

## 9. 自定义节点组件

### 9.1 React 节点

```typescript
import { NodeComponent } from "rete-react-plugin";

// 自定义节点组件
function MyNodeComponent(props: NodeComponentProps<AddNode>) {
    const { node, ref, outputs, inputs } = props;

    return (
        <div ref={ref} className="node">
            <div className="title">Add</div>
            <div className="input">
                Left: <input
                    type="number"
                    value={inputs.left?.[0] || 0}
                    onChange={(e) => node.value = Number(e.target.value)}
                />
            </div>
            <div className="input">
                Right: <input
                    type="number"
                    value={inputs.right?.[0] || 0}
                    onChange={(e) => node.value = Number(e.target.value)}
                />
            </div>
            <div className="output">
                Result: {outputs.value}
            </div>
        </div>
    );
}

// 注册自定义组件
render.addNodeComponent(MyNodeComponent);
```

---

## 10. 错误处理

### 10.1 Pipe 系统

```typescript
// 管道函数可以返回 undefined 终止传播
type Pipe<T> = (data: T) => Promise<undefined | T> | undefined | T;

// 添加错误处理 pipe
editor.addPipe(async (signal) => {
    if (signal.type === 'nodecreate') {
        try {
            await validateNode(signal.data);
        } catch (e) {
            console.error('节点创建失败:', e);
            return undefined;  // 阻止
        }
    }
    return signal;
});
```

### 10.2 节点内错误处理

```typescript
class RiskyNode extends ClassicPreset.Node {
    data(inputs) {
        try {
            return doRiskyOperation(inputs);
        } catch (e) {
            return { error: e.message };
        }
    }
}
```

---

## 11. 序列化

### 11.1 导出/导入

```typescript
// 导出
const data = editor.toJSON();

// 导入
editor.fromJSON(data);
```

### 11.2 自定义序列化

```typescript
// Schemes 可包含序列化所需的额外信息
interface MySchemes extends BaseSchemes {
    Node: {
        data: { value: number };
        metadata: { position: { x: number; y: number } };
    };
}
```

---

## 12. 核心设计模式

### 12.1 模式一：插件叠加

```typescript
editor.use(pluginA);
editor.use(pluginB);
pluginA.use(pluginC);

// 执行顺序：pluginA → pluginB → pluginC
// 数据流：Editor → A → B → C
```

### 12.2 模式二：引擎可替换

```typescript
// 数据流
editor.use(new DataflowEngine());

// 或控制流
editor.use(new ControlFlowEngine());

// 或混合
editor.use(dataflow);
editor.use(controlflow);
```

### 12.3 模式三：类型安全的 Schemes

```typescript
// 定义严格的类型约束
interface Schemes extends GetSchemes<MyNode, MyConnection> {}

// 编译时检查
const node = new NumberNode(3);
await editor.addNode(node);  // 类型检查 ✓
```

---

## 13. 与 UE Blueprint 对比

| 维度 | UE Blueprint | Rete.js |
|------|--------------|---------|
| **语言** | C++/蓝图 | TypeScript |
| **渲染** | Slate UI | 多框架 |
| **执行模型** | 字节码 VM | 可插拔引擎 |
| **扩展方式** | K2Node C++ | TypeScript class |
| **类型系统** | 强类型 Pin | Socket |
| **学习曲线** | 高 | 中 |

---

## 14. 优缺点分析

### 14.1 优点

1. **抽象优雅**：Scope/Signal 比传统事件总线更可控
2. **多框架并存**：异构前端项目中价值巨大
3. **TypeScript 一等公民**：严格类型，IDE 友好
4. **可替换引擎**：数据流/控制流/混合
5. **支持代码生成**：官方明确支持的扩展方向

### 14.2 缺点

1. **概念较多**：Scope、Signal、Preset、Schemes 需要先理解
2. **生态较小**：社区贡献的节点库较少
3. **非开箱即用**：需要组合使用

---

## 15. 推荐阅读与资源

### 官方资料
- [retejs.org](https://retejs.org/)
- [retejs.org/docs](https://retejs.org/docs/)
- [GitHub - retejs](https://github.com/retejs)

### 深度博客
- **Vitaliy Stoliarov** - *Rete.js 2: visual programming for React.js, Angular and Vue.js*
- **DeepWiki - retejs/rete Overview](https://deepwiki.com/retejs/rete/1-overview)**

---

## 16. 小结

Rete.js 是**最专业的可视化编程框架**，其设计精髓：

1. **三层架构**：Core（核心）→ Presets（预设）→ Adapters（框架适配）
2. **Scope/Signal 级联插件**：插件可叠加、可拦截、可替换
3. **双引擎**：Dataflow（Pull）+ ControlFlow（Push）可共存
4. **多框架渲染**：React/Vue/Angular/Svelte 共存于同一编辑器
5. **TypeScript 泛型**：类型安全的 Schemes

**适用场景**：
- 需要多框架混用的异构项目
- 需要自定义执行引擎的项目
- 需要精细控制信号传播的项目

**不适合**：
- 快速原型（LiteGraph.js 更简单）
- 不需要 TypeScript 的项目

---

## 17. 源码深度解析

> 本节基于 GitHub `retejs/rete@main` 与 `retejs/engine@main` 真实源码，逐文件剖析 Rete.js v2 的核心抽象。所有引用均标注 `文件路径:行号`。

### 17.1 基础类型层：`packages/rete/src/types.ts`

Rete v2 把整个图模型压缩成 6 个类型定义：

```typescript
// rete/src/types.ts:1-30
export type NodeId = string
export type ConnectionId = string

export type NodeBase = { id: NodeId }
export type ConnectionBase = { id: ConnectionId, source: NodeId, target: NodeId }

export type GetSchemes<
  NodeData extends NodeBase,
  ConnectionData extends ConnectionBase
> = { Node: NodeData, Connection: ConnectionData }

export type BaseSchemes = GetSchemes<NodeBase, ConnectionBase>
```

`GetSchemes` 是一个"类型工厂"——要求 `NodeData` 必须扩展 `NodeBase`（即至少有 `id`），返回打包成 `{ Node, Connection }` 的对象类型。所有插件通过 `<Schemes extends BaseSchemes>` 形式接入，从而实现"插件不感知具体节点字段，但能在使用方拿到完整字段提示"的双向类型流。

### 17.2 核心抽象：`packages/rete/src/scope.ts`

`scope.ts`（约 130 行）是 Rete 全部架构的"心脏"。

#### Pipe：可中断的中间件函数签名

```typescript
// rete/src/scope.ts:14-19
export type Pipe<T> = (data: T) => Promise<undefined | T> | undefined | T
```

`Pipe<T>` 既可同步可异步，返回 `undefined` 表示"吞掉信号、终止后续传播"——这就是文档常说的 "return undefined to block propagation"。

#### Signal：迭代式中间件链

```typescript
// rete/src/scope.ts:62-79
export class Signal<T> {
  pipes: Pipe<T>[] = []

  addPipe(pipe: Pipe<T>) {
    this.pipes.push(pipe)
  }

  async emit<Context extends T>(context: Context): Promise<Context | undefined> {
    let current: Context | undefined = context

    for (const pipe of this.pipes) {
      current = await pipe(current) as Context

      if (typeof current === 'undefined') return
    }
    return current
  }
}
```

与 Redux middleware 那种 `next => action => next(action)` 的递归套娃不同，Rete 用一个简单的 `for` 循环顺序 `await` 每个 pipe，把上一步结果 feed 给下一步——这意味着任何 pipe 都可以**改写 payload**。一旦某个 pipe 返回 `undefined`，循环立即 `return`，后面的 pipe 全部不执行。

#### Scope：双参数泛型作用域

```typescript
// rete/src/scope.ts:84-119
export class Scope<Produces, Parents extends unknown[] = []> {
  signal = new Signal<AcceptPartialUnion<Produces | Parents[number]>>()
  parent?: any
  __scope!: {
    produces: Produces
    parents: Parents
  }

  constructor(public name: string) { }

  addPipe(middleware: Pipe<Produces | Parents[number]>) {
    this.signal.addPipe(middleware)
  }

  use<S extends Scope<any, any[]>>(scope: NestedScope<S, [Produces, ...Parents]>) {
    if (!(scope instanceof Scope)) throw new Error('cannot use non-Scope instance')

    scope.setParent(this)
    this.addPipe(context => {
      return scope.signal.emit(context)
    })

    return useHelper<S, Produces | Parents[number]>()
  }

  setParent(scope: Scope<Parents[0], Tail<Parents>>) {
    this.parent = scope
  }

  emit<C extends Produces>(context: C): Promise<Extract<Produces, C> | undefined> {
    return this.signal.emit(context) as Promise<Extract<Produces, C>>
  }
}
```

**这是整个 Rete 最具创造性的设计**：

1. **两个泛型参数**：`Produces` 是该 Scope 自己产出的信号类型；`Parents extends unknown[]` 是一个类型元组，记录"我可以挂在哪些父 Scope 之下"。例如 `class DataflowEngine extends Scope<never, [Root<Schemes>]>` 表示它**不产出**任何自己的信号（`never`），但**期待**父 Scope 产出 `Root<Schemes>` 类型的信号。
2. **`use()` 方法的精髓**：`scope.setParent(this)` 把子 scope 链回父级，然后 `this.addPipe(context => scope.signal.emit(context))` ——**把子 scope 的整个 signal 管道塞进父 scope 的 pipe 数组里作为一个 pipe**。这一行代码实现了"插件嵌套即管道嵌套"。
3. **类型校验通过 `NestedScope<S, [Produces, ...Parents]>` 实现**：当你写 `area.use(connectionPlugin)`，TypeScript 会检查 `connectionPlugin.__scope.parents[0]` 是否兼容 `[area.__scope.produces, ...area.__scope.parents][0]`，不兼容则直接给出错误字符串。

### 17.3 编辑器入口：`packages/rete/src/editor.ts`

#### 信号联合类型 `Root`

```typescript
// rete/src/editor.ts:10-21
export type Root<Scheme extends BaseSchemes> =
  | { type: 'nodecreate', data: Scheme['Node'] }
  | { type: 'nodecreated', data: Scheme['Node'] }
  | { type: 'noderemove', data: Scheme['Node'] }
  | { type: 'noderemoved', data: Scheme['Node'] }
  | { type: 'connectioncreate', data: Scheme['Connection'] }
  | { type: 'connectioncreated', data: Scheme['Connection'] }
  | { type: 'connectionremove', data: Scheme['Connection'] }
  | { type: 'connectionremoved', data: Scheme['Connection'] }
  | { type: 'clear' }
  | { type: 'clearcancelled' }
  | { type: 'cleared' }
```

经典的**判别联合（discriminated union）**。所有事件以 `type` 字段做窄化，pipe 中可以直接 `if (context.type === 'nodecreated') context.data` ——`data` 会自动被推断为 `Scheme['Node']`。

#### NodeEditor 与 `addNode`

```typescript
// rete/src/editor.ts:29-87
export class NodeEditor<Scheme extends BaseSchemes> extends Scope<Root<Scheme>> {
  private nodes: Scheme['Node'][] = []
  private connections: Scheme['Connection'][] = []

  async addNode(data: Scheme['Node']) {
    if (this.getNode(data.id)) throw new Error('node has already been added')

    if (!await this.emit({ type: 'nodecreate', data })) return false

    this.nodes.push(data)

    await this.emit({ type: 'nodecreated', data })
    return true
  }

  async addConnection(data: Scheme['Connection']) {
    if (this.getConnection(data.id)) throw new Error('connection has already been added')

    if (!await this.emit({ type: 'connectioncreate', data })) return false

    this.connections.push(data)

    await this.emit({ type: 'connectioncreated', data })
    return true
  }
}
```

注意"两阶段事件"模式——`nodecreate`（动词，可被拦截）→ 实际写入数组 → `nodecreated`（过去分词，已落库）。`if (!await this.emit(...)) return false` 一行就是"短路语义"的应用：任何插件返回 `undefined`，整条 `addNode` 链路直接放弃写入。这就是 ReadOnly、Validation 等插件的全部实现机制。

### 17.4 引擎包：`@retejs/engine`

#### Dataflow：拉式（pull-based）DAG 求值

```typescript
// engine/src/dataflow.ts:54-105
public async fetchInputs<T extends Inputs = DefaultInputs>(nodeId: NodeId): Promise<FetchInputs<T>> {
  const result = this.setups.get(nodeId)
  if (!result) throw new Error('node is not initialized')

  const inputKeys = result.inputs()
  const cons = this.editor.getConnections().filter(c => {
    return c.target === nodeId && inputKeys.includes(c.targetInput)
  })

  const inputs = {} as FetchInputs<T>
  const consWithSourceData = await Promise.all(cons.map(async c => {
    return {
      c,
      sourceData: await this.fetch(c.source)   // ← 递归
    }
  }))

  for (const { c, sourceData } of consWithSourceData) {
    const previous = (inputs[c.targetInput] ? inputs[c.targetInput] : [])!
    const inputsMutation = inputs as Record<string, any[]>
    inputsMutation[c.targetInput] = [...previous, sourceData[c.sourceOutput]]
  }

  return inputs
}

public async fetch<T extends Record<string, any>>(nodeId: NodeId): Promise<T> {
  const result = this.setups.get(nodeId)
  if (!result) throw new Error('node is not initialized')

  const outputKeys = result.outputs()
  const data = await result.data(() => this.fetchInputs(nodeId))
  return data
}
```

`fetch(nodeId)` 与 `fetchInputs(nodeId)` 互相递归——典型的**反向后序遍历 DAG**。`Promise.all` 并行拉所有上游连接，使得"叶子→根"的求值能最大化并行；同一输入端口若有多条入边，结果聚合为数组。

#### DataflowEngine：把 Dataflow 装成 Scope 插件

```typescript
// engine/src/dataflow-engine.ts:30-58
export class DataflowEngine<Schemes extends DataflowEngineScheme> extends Scope<never, [Root<Schemes>]> {
  editor!: NodeEditor<Schemes>
  dataflow?: Dataflow<Schemes>
  cache = new Cache<NodeId, Cancellable<Record<string, any>>>(data => data?.cancel && data.cancel())

  constructor(private configure?: Configure<Schemes>) {
    super('dataflow-engine')

    this.addPipe(context => {
      if (context.type === 'nodecreated') {
        this.add(context.data)
      }
      if (context.type === 'noderemoved') {
        this.remove(context.data)
      }
      return context
    })
  }

  setParent(scope: Scope<Root<Schemes>>): void {
    super.setParent(scope)

    this.editor = this.parentScope<NodeEditor<Schemes>>(NodeEditor)
    this.dataflow = new Dataflow(this.editor)
  }
}
```

教科书般的 Rete 插件写法：

- 类型签名 `Scope<never, [Root<Schemes>]>` 表示"我自己不广播事件，但要求挂在能广播 `Root<Schemes>` 的父级（即 NodeEditor）下"。任何错误嵌套都会触发类型报错。
- 构造函数里 `this.addPipe(...)` 注册一个监听器：每当 `nodecreated` 事件流到这里，就把节点登记进内部的 `Dataflow` 实例；`return context` 不返回 `undefined`，所以信号继续向后传——其它插件仍能收到该事件。
- `setParent` 在被 `editor.use(engine)` 调用时触发，借助 `parentScope<NodeEditor<Schemes>>(NodeEditor)` 拿到强类型的父引用。

#### ControlFlow：推式（push-based）分发

```typescript
// engine/src/control-flow.ts:48-69
public execute(nodeId: NodeId, input?: string) {
  const setup = this.setups.get(nodeId)
  if (!setup) throw new Error('node is not initialized')
  const inputKeys = setup.inputs()

  if (input && !inputKeys.includes(input)) throw new Error('inputs don\'t have a key')

  setup.execute(input, output => {
    const outputKeys = setup.outputs()
    if (!outputKeys.includes(output)) throw new Error('outputs don\'t have a key')

    const cons = this.editor.getConnections().filter(c => {
      return c.source === nodeId && c.sourceOutput === output
    })

    cons.forEach(con => {
      this.execute(con.target, con.targetInput)   // ← 递归向下游推
    })
  })
}
```

与 Dataflow 完全对偶——`execute(nodeId)` 调用节点自己的 `execute(input, forward)`，节点决定**何时、向哪个 output** 调用 `forward`，触发对下游的递归 `execute`。这是经典的**事件流/流程编排**语义（类似 UE 蓝图的白色执行线），允许循环、条件分支、延迟触发。**注意它是同步的**（没有 `await`），节点自己负责异步调度。

### 17.5 设计模式总览

| 模式 | 体现位置 | 价值 |
|---|---|---|
| **Signal 短路传播** | `scope.ts:73-78` 的 `for` 循环 + `if undefined return` | 用最朴素的迭代实现"中间件可拦截" |
| **Scope 类型化嵌套** | `scope.ts:101-110` 的 `use()` + `NestedScope<S, [Produces, ...Parents]>` | 把 `pluginA.use(pluginB)` 编译期检查 |
| **两阶段事件** | `editor.ts:78-87` 的 `nodecreate` → `push` → `nodecreated` | 用一对事件实现"可取消的副作用" |

**Scope/Signal 级联**这套设计——用不到 100 行代码同时解决了：

1. 插件如何监听核心事件（`addPipe`）；
2. 插件如何嵌套且嵌套关系本身被类型系统校验（`use<S>` + `NestedScope`）；
3. 插件如何向上找到父级强类型引用（`parentScope<T>(type)`）；
4. 嵌套插件如何保持事件冒泡（`use()` 内的 `this.addPipe(ctx => scope.signal.emit(ctx))` 一行代码完成"管道嵌套"）。

这种"一个抽象同时承担消息总线 + 依赖注入 + 类型校验"的能力，在 Drawflow、LiteGraph、ReactFlow 之类的库里完全没有对应物——后者要么用全局事件名字符串、要么用 React Context、要么干脆没有插件机制。

**关键文件参考**：
- `rete/src/scope.ts`（≈130 行，整个 Rete 的核心）
- `rete/src/editor.ts:29-172`（NodeEditor 完整实现）
- `rete/src/types.ts:1-30`（六个类型，奠定 Schema 模型）
- `engine/src/dataflow.ts`（拉式求值算法）
- `engine/src/control-flow.ts`（推式分发算法）
- `engine/src/dataflow-engine.ts`（插件化包装的样板范例）

阅读顺序建议：`types.ts` → `scope.ts` → `editor.ts` → 任一 engine 文件。看完这四份代码（合计不到 500 行）即可基本掌握 Rete v2 的全部架构理念。
