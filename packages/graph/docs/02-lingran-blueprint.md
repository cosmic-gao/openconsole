# 零壤蓝图深度解析

> Web 低代码可视化逻辑编排 | 代码生成 | 多语言支持 | 蓝图范式

---

## 1. 概述与背景

### 1.1 什么是零壤蓝图

零壤蓝图（Blueprint）是中国低代码厂商**零壤科技**自研的可视化逻辑编排方案。其核心设计理念是：

> **"BPMN 流程引擎已无法满足图灵完备的业务逻辑编排需求，因此引入游戏引擎的蓝图范式。"**

### 1.2 设计目标

1. **图灵完备**：支持变量、函数、循环、条件分支、自定义节点
2. **代码生成**：蓝图被翻译为目标语言（JavaScript/Java）代码，而非解释执行
3. **多语言支持**：同一份蓝图设计可在 JS 和 Java 中实现
4. **AI 增强**：复杂计算可通过自然语言描述自动生成
5. **可视化调试**：节点级单步调试

### 1.3 与 BPMN 的对比

| 维度 | BPMN | 零壤蓝图 |
|------|------|----------|
| **表达力** | 业务流程（审批流） | 图灵完备逻辑 |
| **执行方式** | 引擎解释执行 | 代码生成 |
| **适用场景** | 人工审批、工作流 | 业务逻辑、数据处理 |
| **学习门槛** | 较高（BPMN 规范复杂） | 较低（节点连线） |

---

## 2. 核心概念

### 2.1 蓝图三要素

```
Blueprint
  ├── Variables（变量）
  │     ├── 名称
  │     ├── 类型（number、string、boolean、array、object）
  │     └── 默认值
  │
  ├── Functions（自定义方法）
  │     ├── 参数列表
  │     ├── 局部变量
  │     └── 节点序列（Node Graph）
  │
  └── Adapter（适配层）
        ├── JavaScript 适配
        ├── Java 适配
        └── 可扩展其他语言
```

### 2.2 节点类型

蓝图中的节点分为几类：

```typescript
// 根据公开资料推断的节点分类
enum NodeType {
    // 控制流
    EVENT_TRIGGER = "event",        // 事件触发（点击、页面加载等）
    CONDITION = "condition",        // 条件分支
    LOOP = "loop",                  // 循环（for、while）

    // 逻辑运算
    MATH_ADD = "math/add",         // 加减乘除
    MATH_COMPARE = "math/compare",  // 比较运算

    // 数据操作
    VARIABLE_GET = "variable/get", // 读取变量
    VARIABLE_SET = "variable/set", // 写入变量

    // UI 交互
    MESSAGE = "message",            // 消息提醒
    DIALOG = "dialog",             // 对话框

    // 业务节点
    HTTP_REQUEST = "http/request",  // HTTP 请求
    DATABASE = "database",         // 数据库操作

    // 自定义
    CUSTOM = "custom"               // 用户自定义节点
}
```

### 2.3 连接语义

```
节点A 输出 ────────────────▶ 节点B 输入
   │
   │  数据流向 + 执行顺序
   ▼
节点A 执行完成后 → 触发节点B 执行
```

---

## 3. 数据模型（基于公开资料推断）

### 3.1 蓝图文件结构

```typescript
// 推断的蓝图序列化格式
interface Blueprint {
    version: "1.0";
    metadata: {
        name: string;
        description: string;
        createdAt: string;
        updatedAt: string;
    };

    variables: Variable[];
    functions: FunctionDefinition[];
}

interface Variable {
    id: string;
    name: string;           // 蓝图中的显示名
    type: "number" | "string" | "boolean" | "array" | "object";
    defaultValue: any;
    scope: "global" | "function";
}

interface FunctionDefinition {
    id: string;
    name: string;
    parameters: Parameter[];
    localVariables: Variable[];
    nodes: NodeInstance[];
    connections: Connection[];
}

interface NodeInstance {
    id: string;
    type: string;           // 节点类型 ID
    position: { x: number; y: number };
    inputs: { [portName: string]: ConnectionRef };
    outputs: { [portName: string]: ConnectionRef[] };
    config: { [key: string]: any };  // 节点配置
}

interface Connection {
    id: string;
    sourceNodeId: string;
    sourcePort: string;
    targetNodeId: string;
    targetPort: string;
}
```

### 3.2 翻译器输出结构

```typescript
// 翻译器输出示例（推断）
interface TranslatedCode {
    language: "javascript" | "java";
    output: {
        variables: string;    // 变量定义代码
        methods: string;       // 方法实现代码
    };
}

// JavaScript 翻译示例
interface JsOutput {
    variables: `
        number1: 10,
        number2: 20
    `;
    methods: `
        count: function() {
            const _temp = this.number1 + this.number2;
            this.$message.info(_temp);
        }
    `;
}
```

---

## 4. 代码生成机制

### 4.1 生成流程

```
┌──────────────────────────────────────────────────────────────┐
│  用户在可视化编辑器中编辑蓝图                                   │
│       │                                                     │
│       │  拖拽节点、连接、配置                                 │
│       ▼                                                     │
│  Blueprint JSON (序列化)                                     │
│       │                                                     │
│       │  翻译器 (Translator)                                 │
│       ▼                                                     │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  阶段 1: 解析变量 → 目标语言变量声明                      │ │
│  │  阶段 2: 解析函数 → 目标语言函数结构                       │ │
│  │  阶段 3: 拓扑排序节点 → 生成执行顺序                       │ │
│  │  阶段 4: 节点翻译 → 目标语言语句                           │ │
│  │  阶段 5: 连接翻译 → 函数调用 / 数据传递                     │ │
│  └────────────────────────────────────────────────────────┘ │
│       │                                                     │
│       ▼                                                     │
│  目标语言代码 (JS/Java)                                      │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 节点翻译示例

#### 加法节点

```
蓝图节点： [ A + B ]
    ├── 输入端口：A (number)
    ├── 输入端口：B (number)
    └── 输出端口：Result (number)
```

**翻译为 JavaScript：**
```javascript
const _temp_result = input_A + input_B;
```

**翻译为 Java：**
```java
double tempResult = inputA + inputB;
```

#### 消息提醒节点

```
蓝图节点： [ MESSAGE.INFO ]
    ├── 输入端口：content (any)
    └── 配置：type = "success" | "warning" | "error"
```

**翻译为 JavaScript（Vue）：**
```javascript
this.$Message.success({ content: input_content });
```

**翻译为 Java（Spring）：**
```java
MessageSource messageSource = new MessageSource();
messageSource.success(inputContent);
```

### 4.3 完整示例翻译

**蓝图设计：**
```
变量:
  - number1 = 10
  - number2 = 20

函数 count():
  节点序列:
    1. number1 ──▶ [ + ] ──▶ [ MESSAGE.INFO ]
    2. number2 ────────────▶
```

**生成的 Vue 代码：**
```vue
<template>
  <button @click="onClick">触发</button>
</template>

<script>
export default {
  data() {
    return {
      number1: 10,
      number2: 20,
    };
  },
  methods: {
    onClick() {
      // 蓝图生成的代码
      const _temp_var_0 = this.number1 + this.number2;
      this.$Message.success({ content: _temp_var_0 });
    }
  }
};
</script>
```

---

## 5. 执行模型

### 5.1 两种执行模式

零壤蓝图支持两种执行/生成模式：

```
┌─────────────────────────────────────────────────────────────┐
│                    编辑时预览 (Live Preview)                  │
│                                                             │
│  用户拖拽节点 → 实时生成代码 → 局部执行预览                   │
│                          │                                  │
│                          ▼                                  │
│                    轻量级 JS 解释执行                         │
│                    (非生成代码的完整执行)                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    发布时编译 (Compile)                      │
│                                                             │
│  保存蓝图 → 生成完整代码 → 编译 / 部署                        │
│                          │                                  │
│                          ▼                                  │
│                   目标语言完整代码                            │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 预览模式执行

预览模式不是执行完整生成代码，而是**逐节点执行**：

```javascript
// 预览执行器（推断实现）
class BlueprintPreviewExecutor {
    executeNode(node, context) {
        switch (node.type) {
            case "math/add":
                const a = context.getInput(node, "A");
                const b = context.getInput(node, "B");
                context.setOutput(node, "Result", a + b);
                break;

            case "message/info":
                const content = context.getInput(node, "content");
                // 调用实际的消息 API
                Message.success({ content });
                break;

            case "variable/get":
                const varName = node.config.variableName;
                return context.variables[varName];

            case "variable/set":
                const varName = node.config.variableName;
                const value = context.getInput(node, "value");
                context.variables[varName] = value;
                break;
        }
    }

    executeGraph(graph) {
        // 拓扑排序获取执行顺序
        const order = topologicalSort(graph);

        // 按顺序执行
        for (const node of order) {
            this.executeNode(node, this.context);
        }
    }
}
```

---

## 6. 与 Vue.js 的集成

### 6.1 变量 → data 映射

```
蓝图变量定义
    │
    │  翻译规则
    ▼
Vue data() {
    return {
        <variable.name>: <variable.defaultValue>
    }
}
```

### 6.2 函数 → methods 映射

```
蓝图函数定义
    │
    │  翻译规则
    ▼
Vue methods: {
    <function.name>: function() {
        // 节点序列生成的语句
    }
}
```

### 6.3 事件绑定

```vue
<!-- 事件触发节点生成 -->
<template>
  <!-- 蓝图节点：Button + onClick 事件 -->
  <button @click="<function.name>">
    {{ buttonText }}
  </button>
</template>
```

---

## 7. 多语言支持架构

### 7.1 适配器模式

```typescript
// 核心翻译器接口
interface TranslatorAdapter {
    // 变量声明
    translateVariable(var: Variable): string;

    // 函数签名
    translateFunctionSignature(func: FunctionDefinition): string;

    // 函数体
    translateFunctionBody(func: FunctionDefinition): string;

    // 特定节点翻译
    translateNode(node: NodeInstance): string;

    // 内置 API 调用
    translateBuiltinApi(api: string, args: any[]): string;
}

// JavaScript 适配器
class JsTranslator implements TranslatorAdapter {
    translateVariable(var) {
        return `${var.name}: ${var.defaultValue}`;
    }

    translateNode(node) {
        switch (node.type) {
            case "math/add":
                return `${this.getInput(node, "A")} + ${this.getInput(node, "B")}`;
            case "message/info":
                return `this.$Message.success({ content: ${this.getInput(node, "content")} })`;
            // ...
        }
    }
}

// Java 适配器
class JavaTranslator implements TranslatorAdapter {
    translateVariable(var) {
        return `private ${this.mapType(var.type)} ${var.name} = ${var.defaultValue};`;
    }

    translateNode(node) {
        switch (node.type) {
            case "math/add":
                return `${this.getInput(node, "A")} + ${this.getInput(node, "B")}`;
            case "message/info":
                return `Message.success("${this.getInput(node, "content")}")`;
            // ...
        }
    }
}
```

### 7.2 类型映射表

| 蓝图类型 | JavaScript | Java |
|----------|------------|------|
| `number` | `number` | `double` / `int` |
| `string` | `string` | `String` |
| `boolean` | `boolean` | `boolean` |
| `array` | `Array` | `List<Object>` |
| `object` | `Object` | `Map<String, Object>` |

---

## 8. AI 增强功能

### 8.1 自然语言生成节点

用户可以描述需求，AI 自动生成节点组合：

```
用户输入: "计算这两个数的平均值并显示"
    │
    │  NLP 解析
    ▼
AI 生成蓝图:
    [ number1 ] ──┬──▶ [ + ] ──▶ [ ÷ 2 ] ──▶ [ MESSAGE.INFO ]
    [ number2 ] ──┘

    或者更复杂的：
    [ number1 ] ──▶ [ Store ] ──▶ [ number2 ] ──▶ [ Store ]
                        │                           │
                        ▼                           ▼
                   [ Calculate Average ] ◀────────────────┘
                        │
                        ▼
                  [ MESSAGE.INFO ]
```

### 8.2 智能错误修复

```
用户蓝图存在错误：
    [ A ] ──▶ [ STRING.UPPER ] ──▶ [ B ]
     │
     └── 类型不匹配：A 是 number，但 UPPER 期望 string

AI 建议修复：
    [ A ] ──▶ [ TO_STRING ] ──▶ [ STRING.UPPER ] ──▶ [ B ]
```

---

## 9. 与同类方案对比

### 9.1 零壤蓝图 vs Unreal Blueprint

| 维度 | Unreal Blueprint | 零壤蓝图 |
|------|------------------|----------|
| **目标平台** | 游戏引擎 | Web 应用 |
| **代码生成** | 字节码（VM） | 高级语言代码 |
| **执行主体** | 引擎 VM | 宿主框架 |
| **扩展方式** | C++ K2Node | 适配器 |
| **状态管理** | 组件属性 | 变量 |

### 9.2 零壤蓝图 vs Node-RED

| 维度 | Node-RED | 零壤蓝图 |
|------|----------|----------|
| **执行模型** | FBP 异步消息流 | 代码生成 |
| **节点粒度** | 功能级（HTTP、MQTT） | 表达式级（+、-） |
| **生成产物** | JSON 流程定义 | 业务代码 |
| **运行时** | Node.js 运行时 | 宿主框架 |

### 9.3 零壤蓝图 vs Rete.js

| 维度 | Rete.js | 零壤蓝图 |
|------|---------|----------|
| **定位** | 节点编辑器框架 | 业务逻辑编排 |
| **执行方式** | 解释执行 | 代码生成 |
| **目标用户** | 开发者 | 业务人员 |
| **多语言** | JS only | JS + Java |

---

## 10. 优势与局限

### 10.1 优势

1. **代码生成而非解释执行**：生成的代码可脱离蓝图独立运行、可调试、可版本控制
2. **多语言支持**：同一设计，多端运行
3. **与低代码平台深度集成**：变量→data、方法→methods 的自然映射
4. **AI 辅助**：降低使用门槛

### 10.2 局限

1. **预定义节点限制**：灵活性受限于平台提供的节点库
2. **复杂逻辑仍需代码**：异常复杂的业务可能超出蓝图表达能力
3. **未完全开源**：社区无法参与改进
4. **调试能力有限**：节点级调试 vs 断点调试

---

## 11. 核心设计模式

### 11.1 模式一：中间表示 → 代码生成

```
Blueprint (可视化)
    │
    │  翻译
    ▼
IR (中间表示)
    │
    │  适配器
    ▼
目标语言代码
```

这种设计的优势：
- 蓝图设计器只需实现一次
- 新语言支持只需新增适配器

### 11.2 模式二：预览执行 → 完整编译

```
预览模式: 轻量级解释执行（快速反馈）
    │
    │  保存/发布
    ▼
完整编译: 生成可部署代码（质量保证）
```

### 11.3 模式三：节点 → 语句的翻译规则

每个节点类型对应固定的代码模式：

```
MATH_ADD    → "<A> + <B>"
MATH_SUB    → "<A> - <B>"
MATH_MUL    → "<A> * <B>"
MATH_DIV    → "<A> / <B>"
VARIABLE_GET → "this.<name>"
VARIABLE_SET → "this.<name> = <value>"
```

---

## 12. 适用场景

零壤蓝图最适合以下场景：

1. **企业内部管理系统**：审批流之外的数据处理逻辑
2. **表单验证逻辑**：条件必填、跨字段校验
3. **简单的数据转换**：API 响应格式化、多数据源组装
4. **业务规则引擎**：价格计算、折扣逻辑、积分规则

不适合的场景：
1. **高性能计算**：生成的代码效率低于手写
2. **复杂算法**：需要手写代码实现
3. **实时音视频处理**：需要 Native 能力

---

## 13. 相关资源

### 中文资料
- 知乎专栏：《可能是最好的低代码逻辑编排方式:Blueprint(蓝图)》- 零壤团队
- 阿里云开发者社区：《可视化逻辑编排工具》
- 腾讯云：《OneCode 低代码引擎技术揭秘》

### 国内同类项目
- **OneCode** - 可视化逻辑编排引擎
- **DragFlow** - RockyF 的逻辑编排实现
- **NopTaskFlow** - XXAI 的下一代逻辑编排引擎

---

## 14. 小结

零壤蓝图代表了**Web 低代码场景对游戏引擎 Blueprint 范式的本土化移植**。其核心理念：

1. **代码生成而非解释执行**：生成业务代码而非运行时解释
2. **多语言适配器**：同一设计，多端运行
3. **与宿主框架深度集成**：变量→data、方法→methods 的自然映射
4. **AI 增强**：降低使用门槛

由于尚未完全开源，我们期待看到更多实现细节的公开。
