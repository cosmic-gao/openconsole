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
