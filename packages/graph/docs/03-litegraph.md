# LiteGraph.js 深度解析

> 轻量级 JS 蓝图引擎 | Canvas2D 渲染 | 零依赖 | ComfyUI 底层支撑

---

## 1. 概述与背景

### 1.1 什么是 LiteGraph.js

LiteGraph.js 是由 **Javier Agenjo (jagenjo)** 于 2014 年创建的 JavaScript 库，用于在浏览器中实现类似 **Unreal Blueprint / Pure Data** 的图形节点编辑器。

**核心定位**：
- 轻量级：单文件、零运行时依赖
- 嵌入式：可嵌入任何 Web 应用
- 双向运行：编辑器 + 独立运行时

### 1.2 重要分支 - Comfy-Org/litegraph.js

2023 年后，**ComfyUI**（Stable Diffusion 工作流编排工具，用户数百万）基于 LiteGraph.js fork 并重写为 TypeScript，成为目前最活跃的 litegraph 分支。

```
jagenjo/litegraph.js      (原版，约 2014-现在)
        │
        └── Comfy-Org/litegraph.js (ComfyUI 使用，TypeScript 重写)
             ├── API 与原版大幅不兼容
             ├── 严格类型系统
             └── 架构清晰分离
```

### 1.3 核心特性

| 特性 | 说明 |
|------|------|
| 零依赖 | 单 JS 文件即可运行 |
| Canvas2D 渲染 | 不依赖任何 UI 框架 |
| 服务端运行 | Node.js 也能执行图 |
| 节点注册 | 一行代码注册自定义节点 |
| JSON 序列化 | 图可导出/导入 |
| 多种执行模式 | 周期性、事件触发、手动 |

---

## 2. 三大核心组件

### 2.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                     LiteGraph (全局单例)                           │
│                                                                   │
│  核心职责:                                                         │
│    - registered_node_types: 全局节点类型注册表                       │
│    - createNode(): 工厂方法                                        │
│    - registerNodeType(): 注册节点类型                              │
│    - wrapFunctionAsNode(): 函数→节点快捷注册                       │
│                                                                   │
│  源码位置: litegraph.js 第 1-500 行                               │
└──────────────────────────────────────────────────────────────────┘
         │
         │ creates / registers
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                         LGraph (图实例)                           │
│                                                                   │
│  核心职责:                                                         │
│    - nodes[]: 节点数组                                             │
│    - links{}: 连接字典 { id → link }                              │
│    - add() / remove(): 增删节点                                    │
│    - connect(): 建立连接                                           │
│    - start() / stop(): 启动/停止执行循环                           │
│    - runStep(): 执行一步                                           │
│                                                                   │
│  源码位置: litegraph.js 第 500-1500 行                             │
└──────────────────────────────────────────────────────────────────┘
         │
         │ contains 0..N
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                        LGraphNode (节点基类)                       │
│                                                                   │
│  核心属性:                                                         │
│    - id: 唯一标识                                                 │
│    - type: 节点类型                                                │
│    - pos[]: Canvas 坐标                                            │
│    - size[]: 节点尺寸                                             │
│    - inputs[]: 输入端口数组                                        │
│    - outputs[]: 输出端口数组                                        │
│    - properties{}: 可序列化属性                                     │
│                                                                   │
│  核心方法:                                                         │
│    - onExecute(): 节点的"运行函数"                                 │
│    - onStart(): 开始时调用                                         │
│    - onStop(): 停止时调用                                          │
│    - onDrawBackground(): 自定义渲染                                │
│                                                                   │
│  源码位置: litegraph.js 第 1500-3000 行                           │
└──────────────────────────────────────────────────────────────────┘
         │
         │ rendered by
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                      LGraphCanvas (渲染层)                         │
│                                                                   │
│  核心职责:                                                         │
│    - Canvas2D 渲染图                                               │
│    - 鼠标/键盘交互处理                                             │
│    - 缩放、平移、框选                                             │
│    - 上下文菜单、搜索框                                            │
│                                                                   │
│  源码位置: litegraph.js 第 3000-6000 行                           │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 LiteGraph 全局单例

```javascript
// litegraph.js 核心导出
var LiteGraph = {
    // 节点类型注册表
    registered_node_types: {},

    // 节点分类
    node_types_by_category: {},

    // 全局配置
    config: {
        default_bg_color: "#222",
        default_node_color: "#333",
        default_shadows: true,
        // ...
    },

    // 工厂方法：创建节点
    createNode: function(type, options) {
        var node_class = this.registered_node_types[type];
        if (!node_class) {
            console.warn(`Node type not found: ${type}`);
            return null;
        }
        var node = new node_class(options);
        node.type = type;
        return node;
    },

    // 注册节点类型
    registerNodeType: function(type, node_class) {
        this.registered_node_types[type] = node_class;

        // 按分类索引
        var category = node_class.category || "generic";
        if (!this.node_types_by_category[category]) {
            this.node_types_by_category[category] = [];
        }
        this.node_types_by_category[category].push(node_class);
    },

    // 快捷注册：一行代码把函数变成节点
    wrapFunctionAsNode: function(name, func, params, return_type) {
        var node_class = function() {
            // 创建输入端口
            params.forEach((p, i) => {
                this.addInput(p[0], p[1]);
            });
            // 创建输出端口
            this.addOutput(return_type[0], return_type[1]);
        };

        node_class.prototype.onExecute = function() {
            var args = this.inputs.map((input, i) => {
                return this.getInputData(i);
            });
            var result = func.apply(this, args);
            this.setOutputData(0, result);
        };

        LiteGraph.registerNodeType(name, node_class);
    }
};

// 导出（支持 Node.js 和浏览器）
if (typeof module !== "undefined") {
    module.exports = LiteGraph;
}
```

---

## 3. 数据模型

### 3.1 LGraphNode 节点结构

```javascript
// 节点实例
{
    id: 1,                          // 全局唯一 ID
    type: "math/sum",              // 节点类型（必须在注册表中）
    pos: [200, 200],               // Canvas 中的位置
    size: [120, 60],               // 节点尺寸

    // 输入端口数组
    inputs: [
        {
            name: "A",              // 端口名称
            type: "number",        // 数据类型（字符串匹配）
            link: 5                // 连接的 link ID，null 表示未连接
        },
        {
            name: "B",
            type: "number",
            link: 7
        }
    ],

    // 输出端口数组
    outputs: [
        {
            name: "Sum",
            type: "number",
            links: [9, 10]         // 一个输出可连接多个输入（数组）
        }
    ],

    // 可序列化属性（会保存到 JSON）
    properties: {
        precision: 2               // 节点特定配置
    },

    // 执行控制
    mode: LiteGraph.ALWAYS,        // 执行模式
    flags: {},                    // 编辑器标志

    // 错误状态
    errors: [],                   // 编译/执行错误
}
```

### 3.2 LGraph 连接结构

```javascript
// LGraph.links 字典
{
    5: {
        id: 5,
        type: "number",           // 连接的数据类型
        origin_id: 2,             // 源节点 ID
        origin_slot: 0,            // 源端口索引
        target_id: 3,             // 目标节点 ID
        target_slot: 1             // 目标端口索引
    },
    7: { ... },
    9: { ... }
}
```

### 3.3 LGraph 主结构

```javascript
// 图实例
{
    id: "graph-uuid",
    nodes: [
        { id: 1, type: "math/sum", ... },
        { id: 2, type: "basic/const", ... },
        // ...
    ],
    links: {
        5: { origin_id: 2, target_id: 1, ... },
        // ...
    },
    groups: [],                   // UI 分组
    layers: [],                   // UI 图层
    vars: {},                     // 图级变量
    config: {}                    // 图配置
}
```

---

## 4. 节点执行模型

### 4.1 执行模式

LiteGraph 支持四种执行模式：

```javascript
LiteGraph = {
    // 常驻模式：每帧都执行
    ALWAYS: 0,

    // 事件模式：收到消息才执行
    ON_EVENT: 1,

    // 永不执行
    NEVER: 2,

    // 触发模式：需要手动触发
    ON_TRIGGER: 3,

    // 手动模式：需手动调用 runStep
    MANUAL: 4
};
```

### 4.2 执行循环

```javascript
class LGraph {
    // 启动执行循环
    start(loop_rate = 60) {
        this.loop_time = 1000 / loop_rate;
        this.execute = true;

        // 使用 setInterval 或 requestAnimationFrame
        this._doLoop = () => {
            if (!this.execute) return;
            this.runStep();
            setTimeout(this._doLoop, this.loop_time);
        };
        this._doLoop();
    }

    // 停止执行循环
    stop() {
        this.execute = false;
    }

    // 执行一步
    runStep() {
        // 1. 计算拓扑排序（如果有变化）
        if (this._nodes_dirty) {
            this._computeExecutionOrder();
        }

        // 2. 按拓扑序执行每个节点
        for (var i = 0; i < this._execution_order.length; i++) {
            var node = this._execution_order[i];

            // 检查节点是否应该执行
            if (!this._shouldExecuteNode(node)) {
                continue;
            }

            // 执行节点
            this._nodeExecute(node);
        }
    }

    _nodeExecute(node) {
        // 1. 拉取所有输入数据
        for (var i = 0; i < node.inputs.length; i++) {
            var input = node.inputs[i];
            if (input.link == null) {
                node.setInputData(i, input.default_value);
                continue;
            }

            // 通过 link 找到源节点和输出
            var link = this.links[input.link];
            var sourceNode = this.getNodeById(link.origin_id);
            var sourceOutput = sourceNode.outputs[link.origin_slot];

            // 拉取源节点的数据
            var data = sourceNode.getOutputData(link.origin_slot);
            node.setInputData(i, data);
        }

        // 2. 调用节点执行函数
        try {
            node.onExecute();
        } catch (e) {
            node.errors.push(e);
            console.error("Node execution error:", e);
        }

        // 3. 清除"需要执行"标记
        node.execute_before_trigger = false;
    }
}
```

### 4.3 拓扑排序算法

```javascript
_computeExecutionOrder() {
    var visited = {};
    var order = [];
    var self = this;

    // 从输出节点开始反向遍历
    function visit(nodeId) {
        if (visited[nodeId]) return;
        visited[nodeId] = true;

        var node = self.getNodeById(nodeId);
        if (!node) return;

        // 递归访问所有输入源
        for (var i = 0; i < node.inputs.length; i++) {
            var input = node.inputs[i];
            if (input.link != null) {
                var link = self.links[input.link];
                visit(link.origin_id);
            }
        }

        order.push(nodeId);
    }

    // 从输出节点反向拓扑排序
    for (var nodeId in this.nodes) {
        visit(nodeId);
    }

    // 反转得到正向执行顺序
    this._execution_order = order.reverse();
}
```

---

## 5. 完整代码示例

### 5.1 最小可运行示例

```html
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="litegraph.css">
    <script src="litegraph.js"></script>
</head>
<body>
    <canvas id="mycanvas" width="800" height="600"></canvas>

    <script>
        // 1. 创建图实例
        var graph = new LGraph();

        // 2. 创建画布渲染器
        var canvas = new LGraphCanvas("#mycanvas", graph);

        // 3. 创建节点
        var constNode = LiteGraph.createNode("basic/const");
        constNode.pos = [50, 100];
        constNode.setValue(42);
        graph.add(constNode);

        var watchNode = LiteGraph.createNode("basic/watch");
        watchNode.pos = [400, 100];
        graph.add(watchNode);

        // 4. 连接
        constNode.connect(0, watchNode, 0);

        // 5. 启动执行
        graph.start();
    </script>
</body>
</html>
```

### 5.2 自定义节点完整流程

```javascript
// 步骤 1：定义节点构造函数
function MyMathNode() {
    // 添加输入端口
    // addInput(name, type)
    this.addInput("A", "number");
    this.addInput("B", "number");

    // 添加输出端口
    this.addOutput("A+B", "number");
    this.addOutput("A-B", "number");

    // 节点属性（可序列化）
    this.properties = {
        precision: 2
    };
}

// 步骤 2：定义元信息
MyMathNode.title = "My Math Node";
MyMathNode.desc = "Performs arithmetic operations";
MyMathNode.category = "Math";  // 出现在哪个分类

// 步骤 3：定义执行函数（核心）
MyMathNode.prototype.onExecute = function() {
    // 读取输入
    var A = this.getInputData(0);
    var B = this.getInputData(1);

    // 处理默认值
    if (A === undefined || A === null) A = 0;
    if (B === undefined || B === null) B = 0;

    // 计算并设置输出
    this.setOutputData(0, A + B);
    this.setOutputData(1, A - B);
};

// 步骤 4：注册到全局
LiteGraph.registerNodeType("math/mymath", MyMathNode);
```

### 5.3 函数式快捷注册

```javascript
// 一行代码把任意函数变成节点
LiteGraph.wrapFunctionAsNode(
    "math/clamp",          // 节点类型 ID
    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },
    [                       // 输入端口定义
        ["value", "number"],
        ["min", "number"],
        ["max", "number"]
    ],
    ["number"]              // 输出端口定义
);

// 使用
var clampNode = LiteGraph.createNode("math/clamp");
```

### 5.4 带 UI 小部件的节点

```javascript
function SliderNode() {
    this.addOutput("Value", "number");

    // 添加 UI 小部件
    this.addWidget("slider", "Value", 0.5, "value", { min: 0, max: 1 });

    this.properties = {
        value: 0.5
    };
}

SliderNode.title = "Slider";
SliderNode.prototype.onExecute = function() {
    // 从 widget 读取值
    var v = this.widgets.find(w => w.name === "value");
    this.setOutputData(0, v.value);
};

LiteGraph.registerNodeType("ui/slider", SliderNode);
```

### 5.5 自定义渲染节点

```javascript
function CustomDrawNode() {
    this.addInput("texture", "texture");
    this.addOutput("processed", "texture");
}

CustomDrawNode.title = "Custom Renderer";
CustomDrawNode.prototype.onDrawBackground = function(ctx) {
    // ctx 是 Canvas2D 上下文
    // 在节点背景上绘制自定义内容

    ctx.fillStyle = "#333";
    ctx.fillRect(0, 0, this.size[0], this.size[1]);

    // 绘制一个圆形指示器
    ctx.beginPath();
    ctx.arc(this.size[0] / 2, this.size[1] / 2, 20, 0, Math.PI * 2);
    ctx.fillStyle = this.properties.color || "#f00";
    ctx.fill();
};

LiteGraph.registerNodeType("custom/draw", CustomDrawNode);
```

### 5.6 子图（Subgraph）

```javascript
// 创建子图
var subgraph = new LGraph();

// 向子图添加节点...

// 创建子图节点
function SubgraphNode() {
    this.addInput("input", "number");
    this.addOutput("output", "number");

    // 内部图
    this.subgraph = new LGraph();
}

// 子图节点执行时运行内部图
SubgraphNode.prototype.onExecute = function() {
    var input = this.getInputData(0);

    // 设置子图输入
    var inputNode = this.subgraph.find(n => n.type === "graph/input");
    inputNode.setValue(0, input);

    // 运行子图
    this.subgraph.runStep();

    // 获取子图输出
    var outputNode = this.subgraph.find(n => n.type === "graph/output");
    this.setOutputData(0, outputNode.getOutputData(0));
};

LiteGraph.registerNodeType("graph/subgraph", SubgraphNode);
```

---

## 6. 服务端运行

### 6.1 Node.js 执行

```javascript
// server.js
const LiteGraph = require("./litegraph.js");

const graph = new LiteGraph.LGraph();

// 创建节点（服务端可用的）
var timeNode = LiteGraph.createNode("basic/time");
var consoleNode = LiteGraph.createNode("basic/console_output");

// 连接
timeNode.connect(0, consoleNode, 0);

// 立即执行一步（服务端没有 runLoop）
graph.add(timeNode);
graph.add(consoleNode);

graph.runStep();  // 执行一步

// 或者启动循环
graph.start();    // 启动定时执行
setTimeout(() => graph.stop(), 5000);  // 5秒后停止
```

### 6.2 可用的服务端节点

| 节点类型 | 说明 | 服务端可用 |
|---------|------|-----------|
| `basic/const` | 常量 | ✓ |
| `basic/time` | 当前时间 | ✓ |
| `basic/date` | 当前日期 | ✓ |
| `basic/console_output` | 控制台输出 | ✓ |
| `basic/noop` | 空操作 | ✓ |
| `string/*` | 字符串操作 | ✓ |
| `math/*` | 数学运算 | ✓ |
| `audio/*` | 音频处理 | ✗ |
| `graphics/*` | 图形渲染 | ✗ |
| `input/*` | 鼠标键盘 | ✗ |

---

## 7. JSON 序列化

### 7.1 导出图

```javascript
// 序列化整张图为 JSON
var json = JSON.stringify(graph.serialize());
// 或
var json = graph.toJSON();

// 保存到 localStorage
localStorage.setItem("mygraph", json);
```

### 7.2 导入图

```javascript
// 从 JSON 加载
graph.configure(JSON.parse(json));

// 或
var loadedGraph = new LGraph();
loadedGraph.load(json);
```

### 7.3 序列化格式

```javascript
{
    "graph_info": {
        "id": "graph-uuid",
        "timestamp": 1699999999999
    },
    "nodes": [
        {
            "id": 1,
            "type": "math/sum",
            "pos": [100, 200],
            "size": [120, 60],
            "flags": {},
            "mode": 0,
            "inputs": [
                { "name": "A", "type": "number", "link": 5 },
                { "name": "B", "type": "number", "link": 7 }
            ],
            "outputs": [
                { "name": "Result", "type": "number", "links": [9] }
            ],
            "properties": {}
        }
    ],
    "links": {
        "5": { "id": 5, "type": "number", "origin_id": 2, ... },
        ...
    }
}
```

---

## 8. ComfyUI 分支演进

### 8.1 Comfy-Org/litegraph.js 的改进

```typescript
// TypeScript 重写（推断）
// 核心接口定义

interface LGraphNode {
    id: number;
    type: string;
    pos: [number, number];
    size: [number, number];
    inputs: LGraphPin[];
    outputs: LGraphPin[];
    properties: Record<string, unknown>;
    mode: ExecutionMode;

    onExecute?(): void;
    onStart?(): void;
    onStop?(): void;
    onDrawBackground?(ctx: CanvasRenderingContext2D): void;

    getInputData(slot: number): unknown;
    setOutputData(slot: number, data: unknown): void;
    addInput(name: string, type: string): LGraphPin;
    addOutput(name: string, type: string): LGraphPin;
    addWidget(...args: any[]): void;
}

interface LGraph {
    nodes: Map<number, LGraphNode>;
    links: Map<number, LGraphLink>;

    add(node: LGraphNode): void;
    remove(node: LGraphNode): void;
    connect(
        originId: number,
        originSlot: number,
        targetId: number,
        targetSlot: number
    ): boolean;

    start(): void;
    stop(): void;
    runStep(): void;

    serialize(): object;
    configure(data: object): void;
}
```

### 8.2 ComfyUI 的特殊扩展

```typescript
// ComfyUI 在此基础上扩展了：

// 1. 序列化的节点数据
interface ComfyNode extends LGraphNode {
    // ComfyUI 特有
    widgets_values?: unknown[];  // widget 的值

    // 覆盖 onExecute 以支持 AI 推理
    onExecute(): void {
        // 获取输入
        const inputData = this.getInputWidgets();

        // 调用 AI 模型
        const result = this.model.process(inputData);

        // 设置输出
        this.setOutputData(0, result);
    }
}

// 2. 自定义 widget 类型
this.addWidget("combo", "model", "sd15", {
    values: ["sd15", "sd20", "sdxl"],
    onChange: (value) => { ... }
});
```

---

## 9. 核心设计模式

### 9.1 模式一：工厂方法创建节点

```javascript
// 节点不直接构造，而是通过工厂创建
var node = LiteGraph.createNode("math/sum");
// 工厂负责：
// 1. 查找注册表
// 2. 实例化正确的类
// 3. 分配 ID
// 4. 设置默认属性
```

### 9.2 模式二：Pull 数据模型

```
[Node A] ──link──▶ [Node B]

执行时：
1. Node B 被选中执行
2. B 调用 getInputData(0)
3. getInputData 通过 link 找到 A
4. A 的 onExecute 被调用（如果还没执行）
5. A 返回输出数据
6. B 继续执行
```

### 9.3 模式三：端口类型校验

```javascript
// 连接时检查类型
LGraph.prototype.connect = function(originId, originSlot, targetId, targetSlot) {
    var originNode = this.getNodeById(originId);
    var targetNode = this.getNodeById(targetId);

    var originType = originNode.outputs[originSlot].type;
    var targetType = targetNode.inputs[targetSlot].type;

    // 类型兼容检查
    if (!this._typesCompatible(originType, targetType)) {
        console.warn(`Type mismatch: ${originType} -> ${targetType}`);
        return false;
    }

    // 创建连接...
};
```

---

## 10. 与 Rete.js 对比

| 维度 | LiteGraph.js | Rete.js |
|------|--------------|---------|
| **代码量** | 单文件 < 5K 行 | 模块化 |
| **渲染** | Canvas2D | 多框架适配 |
| **类型系统** | 字符串 | TypeScript 泛型 |
| **执行模型** | 拓扑排序 | 可插拔引擎 |
| **扩展方式** | registerNodeType | Plugin |
| **生态** | ComfyUI 百万用户 | 较小 |
| **学习曲线** | 低 | 中 |

---

## 11. 优缺点分析

### 11.1 优点

1. **极轻量**：单文件零依赖，适合嵌入
2. **上手简单**：5 分钟可运行
3. **可服务端运行**：Node.js 执行
4. **产品验证**：ComfyUI 百万级用户验证
5. **可序列化**：JSON 导入导出

### 11.2 缺点

1. **渲染基于 Canvas2D**：无法嵌入 React/Vue 组件
2. **类型系统弱**：字符串匹配，无泛型
3. **缺乏现代框架集成**：官方无 React/Vue 绑定
4. **文档较少**：原版文档较简略

---

## 12. 推荐阅读与资源

### 官方资源
- [jagenjo/litegraph.js](https://github.com/jagenjo/litegraph.js)
- [Comfy-Org/litegraph.js](https://github.com/Comfy-Org/litegraph.js)
- [在线 Demo](https://tamats.com/projects/litegraph/editor/)

### 深度解析
- [DeepWiki - LiteGraph.js Overview](https://deepwiki.com/jagenjo/litegraph.js/1-overview)
- [DeepWiki - ComfyUI Core Architecture](https://deepwiki.com/Comfy-Org/litegraph.js/4-core-architecture)

### 应用案例
- **ComfyUI** - Stable Diffusion 工作流编排
- **GameNode** - 游戏脚本引擎
- **Node-based shader editors** - 着色器编辑

---

## 13. 小结

LiteGraph.js 是**最简洁的浏览器蓝图引擎**，其设计精髓：

1. **三大组件**：LiteGraph（注册表）+ LGraph（图）+ LGraphNode（节点）
2. **Pull 数据流**：下游节点主动拉取上游数据
3. **拓扑排序执行**：自动计算执行顺序
4. **工厂模式**：类型注册 → createNode 创建
5. **JSON 序列化**：图可完整导出/导入

适合场景：
- 嵌入式节点编辑器
- AI 工作流（ComfyUI）
- 轻量级可视化编程教育

不适合场景：
- 需要 DOM 组件嵌入（如 React/Vue 节点）
- 复杂类型系统
- 大型团队协作

---

## 14. 源码深度解析

> 本节面向已经读完前文的工程师，提供源码层级（行号 + 真实代码摘录）的补充。所有摘录均来自 `jagenjo/litegraph.js` master 分支单文件构建 `src/litegraph.js`（约 14400 行）。该仓库将 `LiteGraph` 命名空间、`LGraph`、`LLink`、`LGraphNode`、`LGraphGroup`、`LGraphCanvas` 全部塞在同一个 IIFE 内。

### 14.1 文件结构与命名空间布局

| 行号 | 内容 |
|----|----|
| L93–L120 | `LiteGraph` 全局对象的开篇配置 |
| L157 | `LiteGraph.registerNodeType(type, base_class)` |
| L476 | `LiteGraph.createNode(type, title, options)` |
| L835 | `function LGraph(o)` 构造函数 |
| L1054 | `LGraph.prototype.runStep` |
| L1161 | `LGraph.prototype.computeExecutionOrder` |
| L2185 | `LGraph.prototype.serialize` |
| L2240 | `LGraph.prototype.configure` |
| L2376 | `function LLink(...)` |
| L2480 | `function LGraphNode(title)` |
| L2795 | `LGraphNode.prototype.setOutputData` |
| L2863 | `LGraphNode.prototype.getInputData` |
| L4293 | `LGraphNode.prototype.connect` |
| L5325 | `function LGraphCanvas(canvas, graph, options)` |
| L8539 | `LGraphCanvas.prototype.drawNode` |
| L9360 | `LGraphCanvas.prototype.drawConnections` |

### 14.2 `LLink`（L2376）—— 边的最小表示

```js
// src/litegraph.js:2376-2386
function LLink(id, type, origin_id, origin_slot, target_id, target_slot) {
    this.id = id;
    this.type = type;
    this.origin_id = origin_id;
    this.origin_slot = origin_slot;
    this.target_id = target_id;
    this.target_slot = target_slot;

    this._data = null;
    this._pos = new Float32Array(2); //center
}
```

注意点：
- `_data` 字段并不参与 `serialize()`——通过连接传输的值是运行期瞬态。
- `serialize()` 故意把链路压成数组 `[id, origin_id, origin_slot, target_id, target_slot, type]`（L2407–L2415），相比对象格式节省 ~70% 字节。`configure(o)` 同时支持数组与对象输入是为了向后兼容老存档。
- `_pos` 用 `Float32Array(2)` 是渲染缓存。

### 14.3 `LGraph` 状态字段（L876–L920）

```js
// src/litegraph.js:884-910
this._nodes = [];
this._nodes_by_id = {};
this._nodes_in_order = [];        //nodes sorted in execution order
this._nodes_executable = null;    //nodes that contain onExecute sorted in execution order
this.links = {};                  //container with all the links
this.iteration = 0;
this.vars = {};
this.extra = {};
this.globaltime = 0;
this.runningtime = 0;
this.fixedtime_lapse = 0.01;
```

不变量：
- `_nodes` 是插入顺序数组，`_nodes_by_id` 是 O(1) 查找索引，`_nodes_in_order` 是拓扑顺序，`_nodes_executable` 仅含定义了 `onExecute` 的节点——**`runStep` 总是迭代 `_nodes_executable` 而不是 `_nodes`**，所以无副作用节点（纯 UI 节点）零成本。
- `links` 是 `Object<id, LLink>` 而不是数组：删除链路只需 `delete this.links[id]`。

### 14.4 `runStep` 执行循环（L1054）

```js
// src/litegraph.js:1064-1090
var nodes = this._nodes_executable
    ? this._nodes_executable
    : this._nodes;
if (!nodes) return;
limit = limit || nodes.length;

for (var i = 0; i < num; i++) {
    for (var j = 0; j < limit; ++j) {
        var node = nodes[j];
        if (LiteGraph.use_deferred_actions
            && node._waiting_actions
            && node._waiting_actions.length)
            node.executePendingActions();
        if (node.mode == LiteGraph.ALWAYS && node.onExecute) {
            node.doExecute();
        }
    }
    this.fixedtime += this.fixedtime_lapse;
    if (this.onExecuteStep) this.onExecuteStep();
}
```

要点：
1. **不是事件驱动**——单纯按预排序的数组顺序对每个节点调一次 `onExecute`，由节点内部 `getInputData` 拉数据。
2. `node.mode` 有五种（`ALWAYS / ON_EVENT / NEVER / ON_TRIGGER / ON_REQUEST`），只有 `ALWAYS` 在 `runStep` 主循环里被无条件触发。
3. `do_not_catch_errors=true` 路径用 `node.doExecute()`（带包装），`false` 路径直接调 `node.onExecute()`——区分"开发"和"生产"模式。

### 14.5 `computeExecutionOrder`（L1161）—— Kahn 拓扑排序

```js
// src/litegraph.js:1161-1205
LGraph.prototype.computeExecutionOrder = function(only_onExecute, set_level) {
    var L = [];                 // result list
    var S = [];                 // starting nodes (in-degree 0)
    var M = {};                 // pending nodes
    var visited_links = {};
    var remaining_links = {};

    // 1) 统计每个节点的入度，入度 0 的塞进 S
    for (var i = 0; i < this._nodes.length; ++i) {
        var node = this._nodes[i];
        if (only_onExecute && !node.onExecute) continue;
        M[node.id] = node;
        var num = 0;
        if (node.inputs) {
            for (var j = 0; j < node.inputs.length; j++) {
                if (node.inputs[j] && node.inputs[j].link != null) num += 1;
            }
        }
        if (num == 0) {
            S.push(node);
            if (set_level) node._level = 1;
        } else {
            if (set_level) node._level = 0;
            remaining_links[node.id] = num;
        }
    }
```

LiteGraph 处理环（feedback loop）的做法是 **后置兜底**：

```js
// src/litegraph.js:1265-1268
//the remaining ones (loops)
for (var i in M) {
    L.push(M[i]);
}
```

剩在 `M` 里的就是参与环的节点，以任意顺序追加到结果末尾——所以 LiteGraph 允许图里有环，只是环内顺序不保证。

最后一步是 **优先级二次排序**（L1281–L1290）：

```js
L = L.sort(function(A, B) {
    var Ap = A.constructor.priority || A.priority || 0;
    var Bp = B.constructor.priority || B.priority || 0;
    if (Ap == Bp) return A.order - B.order;
    return Ap - Bp;
});
```

### 14.6 `connect()`（L4293）—— 边的合法性 + 存储

可分为五个阶段：

1. **参数规整**（L4293–L4360）：`slot` 字符串转 index；`target_slot === LiteGraph.EVENT` 自动找 `onTrigger` 输入槽并把目标节点 mode 切成 `ON_TRIGGER`。
2. **类型校验**（L4364–L4382）：`LiteGraph.isValidConnection` 支持 `*` 通配、`","` 分隔多类型、大小写不敏感。
3. **回调否决**（L4386–L4395）：`target_node.onConnectInput` 与 `this.onConnectOutput` 任一返回 `false` 直接拒绝。
4. **清旧建新**（L4399–L4434）：

```js
// src/litegraph.js:4419-4434
var nextId
if (LiteGraph.use_uuids) nextId = LiteGraph.uuidv4();
else nextId = ++this.graph.last_link_id;

link_info = new LLink(
    nextId,
    input.type || output.type,
    this.id, slot,
    target_node.id, target_slot
);

this.graph.links[link_info.id] = link_info;

if (output.links == null) output.links = [];
output.links.push(link_info.id);
target_node.inputs[target_slot].link = link_info.id;
```

**三处写入**（`graph.links[id]`、源节点 `output.links`、目标节点 `input.link`）的一致性完全靠 `connect`/`disconnect*` 维护，没有事务，所以**直接改 `node.inputs[i].link = null` 而不更新 `graph.links` 是泄漏链路的常见 bug**。

5. **通知**（L4451–L4493）：触发 `onConnectionsChange` 与 `onNodeConnectionChange`，最后 `setDirtyCanvas` 触发重绘，`graph._version++`。

### 14.7 拉数据：`getInputData` / `setOutputData`

```js
// src/litegraph.js:2863-2898
LGraphNode.prototype.getInputData = function(slot, force_update) {
    if (!this.inputs) return;
    if (slot >= this.inputs.length || this.inputs[slot].link == null) return;

    var link_id = this.inputs[slot].link;
    var link = this.graph.links[link_id];
    if (!link) return null;

    if (!force_update) return link.data;

    //special case: force the upstream node to recompute
    var node = this.graph.getNodeById(link.origin_id);
    if (!node) return link.data;
    if (node.updateOutputData) node.updateOutputData(link.origin_slot);
    else if (node.onExecute) node.onExecute();
    return link.data;
};
```

```js
// src/litegraph.js:2795-2825
LGraphNode.prototype.setOutputData = function(slot, data) {
    if (!this.outputs) return;
    if (slot == -1 || slot >= this.outputs.length) return;
    var output_info = this.outputs[slot];
    output_info._data = data;
    if (this.outputs[slot].links) {
        for (var i = 0; i < this.outputs[slot].links.length; i++) {
            var link_id = this.outputs[slot].links[i];
            var link = this.graph.links[link_id];
            if (link) link.data = data;
        }
    }
};
```

设计要点：**数据存在 `LLink` 上而不是 input slot**——`setOutputData` 把 `data` 写到所有出边的 `link.data`，下游 `getInputData` 直接读 `link.data`。`force_update=true` 触发**递归拉取**：上游节点没在本帧执行就当场调它的 `onExecute`。

### 14.8 节点注册的 mixin 设计

```js
// src/litegraph.js:157-235
registerNodeType: function(type, base_class) {
    if (!base_class.prototype) throw "Cannot register a simple object";
    base_class.type = type;
    const pos = type.lastIndexOf("/");
    base_class.category = type.substring(0, pos);
    if (!base_class.title) base_class.title = base_class.name;

    //extend class: 把 LGraphNode.prototype 上未被覆盖的方法 mixin 进来
    for (var i in LGraphNode.prototype) {
        if (!base_class.prototype[i]) {
            base_class.prototype[i] = LGraphNode.prototype[i];
        }
    }
    this.registered_node_types[type] = base_class;
}
```

**LiteGraph 不强制继承 `LGraphNode`**，而是 `for in` 把 `LGraphNode.prototype` 的所有方法"塞"到用户类的原型链上。这种 mixin 比 `class extends` 灵活，但代价是子类重写父类方法时无法 `super.xxx()` 调原版。

### 14.9 画布渲染管线

`drawConnections` 的关键技巧：**只遍历 inputs 而不遍历 outputs**——因为每个 input 只持有 1 条 link，每条 link 有且只有一个 input 端，所以"遍历所有节点的所有 input 槽" = "遍历所有 link"，且天然去重。

```js
// src/litegraph.js:9376-9395
var nodes = this.graph._nodes;
for (var n = 0; n < nodes.length; ++n) {
    var node = nodes[n];
    if (!node.inputs || !node.inputs.length) continue;

    for (var i = 0; i < node.inputs.length; ++i) {
        var input = node.inputs[i];
        if (!input || input.link == null) continue;
        var link_id = input.link;
        var link = this.graph.links[link_id];
        if (!link) continue;
        var start_node = this.graph.getNodeById(link.origin_id);
        ...
```

实际曲线绘制由 `renderLink(ctx, a, b, link, ...)` 负责，三种连线模式：直线 / 折线 / 三次贝塞尔（默认），贝塞尔控制点距离按水平距离的 0.25 倍——这就是 LiteGraph 那种"S 型"连线的来源。

### 14.10 给读源码的人的几条线索

1. **想看交互事件流水线**：从 `LGraphCanvas.prototype.processMouseDown / processMouseMove / processMouseUp` 入手。
2. **想看子图（subgraph）实现**：搜 `Subgraph.prototype` 和 `LGraph.prototype.inputs / outputs`。子图本质是一个外层节点 `Subgraph` 内部持有一个完整 `LGraph` 实例。
3. **TS Fork（Comfy-Org/litegraph.js）**：把所有 `function X` + `prototype.method` 转成了 ES class，如果做 ComfyUI 二开应优先读 fork 的 `src/LGraphCanvas.ts`、`src/LGraph.ts`。
4. **断点位置建议**：连接 bug 在 L4382（类型校验失败）和 L4434（链路写入完成）下；执行顺序在 L1262（Kahn 主循环结束）和 L1281（priority 重排前）下。

完整源码见 https://github.com/jagenjo/litegraph.js/blob/master/src/litegraph.js
