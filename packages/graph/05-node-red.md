# Node-RED 深度解析

> Flow-Based Programming 实现 | IoT 编排标杆 | Node.js 运行时 | 低代码可视化

---

## 1. 概述与背景

### 1.1 什么是 Node-RED

Node-RED 是 **2013 年由 IBM 工程师 Nick O'Leary 和 Dave Conway-Jones** 创建的可视化编程工具，2016 年贡献给 OpenJS Foundation。

**核心定位**：
- **Flow-Based Programming (FBP)** 的现代实现
- 连接硬件设备、API 和在线服务
- 低代码可视化编程

### 1.2 FBP 起源

FBP (Flow-Based Programming) 由 **J. Paul Morrison** 在 1970 年代提出，核心思想：

> 应用程序由一组"黑盒"进程组成，通过**预定义的连接（传送带）**交换**信息包（IP）**。

```
┌──────────┐     msg      ┌──────────┐     msg      ┌──────────┐
│  Node A  │ ──────────▶ │  Node B  │ ──────────▶ │  Node C  │
│  (进程)   │             │  (进程)   │             │  (进程)   │
└──────────┘             └──────────┘             └──────────┘
```

### 1.3 核心特性

| 特性 | 说明 |
|------|------|
| **浏览器编辑器** | 拖拽节点、连线、部署 |
| **npm 生态** | 数千个社区节点包 |
| **Node.js 运行时** | 基于事件循环的单线程执行 |
| **JSON 序列化** | 流程可导出/导入 |
| **上下文存储** | 全局/流/节点三级作用域 |
| **调试工具** | 实时查看消息流 |

---

## 2. 核心概念

### 2.1 Node（节点）

Node-RED 的最小执行单元，相当于 FBP 的"进程"：

```javascript
// 节点类型定义
module.exports = function(RED) {
    function MyNode(config) {
        // 1. 创建节点实例
        RED.nodes.createNode(this, config);

        // 2. 保存配置
        this.config = config;

        // 3. 注册输入处理函数
        this.on('input', function(msg, send, done) {
            // 处理消息
            msg.payload = doSomething(msg.payload);

            // 4. 发送给下游
            send(msg);

            // 5. 通知完成
            if (done) done();
        });

        // 6. 注册关闭清理
        this.on('close', function() {
            // 清理资源
        });
    }

    // 注册节点类型
    RED.nodes.registerType("my-node", MyNode);
};
```

### 2.2 Message（消息）

节点间传递的数据载体：

```javascript
{
    _msgid: "abc123",        // 消息唯一 ID（用于追踪）
    topic: "sensor/temp",   // 路由键（可选）
    payload: 25.5,          // 主数据（默认工作字段）
    temperature: 25.5,      // 自定义字段
    timestamp: Date.now()   // 自定义字段
}
```

**约定**：
- `payload` 是默认工作字段
- `_msgid` 由运行时自动分配
- `topic` 用于 MQTT 风格的路由
- 节点应记录它消费/产生哪些字段

### 2.3 Flow（流）

一组连接好的节点：

```
[Inject] ──▶ [Function] ──▶ [Debug]
 (触发)      (处理)         (输出)
```

流被存储为 JSON：

```json
[
  {
    "id": "n1",
    "type": "inject",
    "name": "触发器",
    "topic": "test",
    "payload": "Hello",
    "wires": [["n2"]]
  },
  {
    "id": "n2",
    "type": "function",
    "name": "处理函数",
    "func": "msg.payload = msg.payload.toUpperCase();\nreturn msg;",
    "wires": [["n3"]]
  },
  {
    "id": "n3",
    "type": "debug",
    "name": "调试输出"
  }
]
```

### 2.4 Wire（连线）

节点间的连接，存储在源节点的 `wires` 数组中：

```javascript
// 一个输出端口可连接多个下游节点
"wires": [
    ["nodeId2", "nodeId3", "nodeId4"]  // 输出 0 连接到的节点
]

// 多输出端口
"wires": [
    ["nodeId2"],      // 输出 0
    ["nodeId3"],      // 输出 1
    ["nodeId4"]       // 输出 2
]
```

---

## 3. 运行时架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Node-RED Runtime                              │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Flow Engine                                │   │
│  │                                                               │   │
│  │   ┌─────┐     ┌─────┐     ┌─────┐     ┌─────┐               │   │
│  │   │NodeA│────▶│NodeB│────▶│NodeC│────▶│NodeD│               │   │
│  │   └─────┘     └─────┘     └─────┘     └─────┘               │   │
│  │                                                               │   │
│  │   消息在节点间异步传递                                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Context System                             │   │
│  │                                                               │   │
│  │   global    ←─── 全局作用域，所有流可见                        │   │
│  │   flow      ←─── 当前流内可见                                │   │
│  │   node      ←─── 仅当前节点可见                              │   │
│  │                                                               │   │
│  │   可配置存储后端：Memory / File / Redis / Postgres           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Settings                                   │   │
│  │                                                               │   │
│  │   /settings.js - 运行时配置                                  │   │
│  │   /lib/index.js  - 运行时入口                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 消息处理流程

```
Inject 节点触发（手动或定时）
        │
        │  1. 创建 msg 对象
        │
        ▼
┌──────────────────────┐
│  Wire 队列            │  ← 输入队列
└──────────────────────┘
        │
        │  2. Node.js 事件循环
        │
        ▼
┌──────────────────────┐
│  Node.on('input')     │  ← 节点处理
│                       │
│  msg.payload = ...    │
│  send(msg)            │
└──────────────────────┘
        │
        │  3. 传递给下游
        │
        ▼
继续传播到下游节点...
```

### 3.3 事件循环与异步

```javascript
// Node-RED 使用 Node.js 事件循环
// 每个节点在收到消息时注册到事件队列

Node.prototype.receive = function(msg) {
    // 立即触发 input 事件
    this.emit('input', msg, this.send, this.done);

    // 注意：这是异步的！
    // send() 不会立即发送给下游，而是放入下一个事件循环
};

// 下游节点在下一轮事件循环才收到消息
```

---

## 4. 节点开发详解

### 4.1 完整节点包结构

```
my-node/
├── package.json              // npm 包配置
├── my-node.js                // 服务端实现
└── my-node.html             // 编辑器 UI 定义
```

### 4.2 package.json

```json
{
  "name": "node-red-contrib-my-node",
  "version": "1.0.0",
  "node-red": {
    "nodes": {
      "my-node": "my-node.js"
    }
  },
  "dependencies": {}
}
```

### 4.3 服务端实现

```javascript
// my-node.js
module.exports = function(RED) {
    function MyNode(config) {
        // 1. 创建节点（必须）
        RED.nodes.createNode(this, config);

        // 2. 保存配置
        this.config = config;
        this.url = config.url;

        // 3. 节点级状态
        this.retryCount = 0;

        // 4. 输入处理
        this.on('input', function(msg, send, done) {
            var node = this;

            // 发送 HTTP 请求
            var request = require('request');

            request.get(node.url, function(error, response, body) {
                if (error) {
                    // 错误处理
                    node.error('请求失败: ' + error.message, msg);
                    if (done) done(error);
                    return;
                }

                // 创建新消息
                var newMsg = {
                    payload: body,
                    statusCode: response.statusCode,
                    topic: msg.topic
                };

                // 发送给下游（多个输出）
                send([newMsg, msg]);  // 发送到两个输出端口

                // 通知完成
                if (done) done();
            });
        });

        // 5. 关闭清理
        this.on('close', function() {
            // 清理资源，如关闭连接
        });
    }

    // 注册节点类型
    RED.nodes.registerType("my-node", MyNode);
};
```

### 4.4 编辑器 UI 定义

```html
<!-- my-node.html -->
<script type="text/x-red" data-template-name="my-node">
    <!-- 节点配置表单 -->
    <div class="form-row">
        <label for="node-input-url">URL</label>
        <input type="text" id="node-input-url" placeholder="https://...">
    </div>
    <div class="form-row">
        <label for="node-input-name">名称</label>
        <input type="text" id="node-input-name">
    </div>
</script>

<script type="text/javascript">
    RED.nodes.registerType('my-node', {
        category: 'function',      // 调色板分类
        color: '#a6bbcf',          // 节点颜色
        defaults: {
            name: { value: "" },   // 默认值
            url: { value: "", required: true }
        },
        inputs: 1,                 // 输入端口数
        outputs: 2,                // 输出端口数
        icon: "file.png",         // 节点图标

        // 标签显示
        label: function() {
            return this.name || "my-node";
        },

        // 标签样式
        labelStyle: function() {
            return this.name ? "node_label_italic" : "";
        },

        // 渲染完成后的初始化
        oneditprepare: function() {
            // 可在这里初始化 UI，如填充下拉框
        },

        // 保存时的验证
        oneditsave: function() {
            // 保存前处理
        },

        // 取消编辑
        oneditcancel: function() {
            // 取消处理
        }
    });
</script>
```

---

## 5. Function 节点详解

Function 节点允许在流中内嵌 JavaScript：

### 5.1 基本使用

```javascript
// 返回单个消息
return msg;

// 修改消息后返回
msg.payload = msg.payload.toUpperCase();
return msg;
```

### 5.2 多输出

```javascript
// 返回数组，对应多个输出端口
// [output1, output2, output3]

if (msg.topic === "sensor") {
    return [msg, null, msg];  // 发送到输出 0 和 2
} else {
    return [null, msg];        // 发送到输出 1
}
```

### 5.3 多消息序列

```javascript
// 返回数组，同一输出可发送多条消息
var messages = [];
for (var i = 0; i < 10; i++) {
    messages.push({ payload: i });
}
return [messages];  // 一次性发送 10 条消息
```

### 5.4 异步处理

```javascript
// 使用 done() 回调处理异步
var node = this;

someAsyncOperation(msg.payload, function(result, error) {
    if (error) {
        node.error('Error: ' + error);
        done(error);
        return;
    }
    msg.payload = result;
    send(msg);
    done();  // 完成后调用
});

// 注意：如果不调用 done()，节点会一直处于"处理中"状态
```

### 5.5 上下文使用

```javascript
// 节点级上下文（仅当前节点可见）
var count = context.get('count') || 0;
count++;
context.set('count', count);
msg.count = count;
return msg;

// 流级上下文（同一流内可见）
flow.set('flowVar', 'value');
var flowVar = flow.get('flowVar');

// 全局上下文（所有流可见）
global.set('globalVar', 'value');
var globalVar = global.get('globalVar');
```

---

## 6. 上下文系统

### 6.1 三级作用域

```
┌─────────────────────────────────────────┐
│         global (全局)                    │
│  所有流、所有节点可见                      │
└─────────────────────────────────────────┘
         ▲
         │
┌─────────────────────────────────────────┐
│         flow (流)                        │
│  同一 tab 内的所有节点可见                │
└─────────────────────────────────────────┘
         ▲
         │
┌─────────────────────────────────────────┐
│         node (节点)                      │
│  仅当前节点可见                          │
└─────────────────────────────────────────┘
```

### 6.2 持久化配置

```javascript
// settings.js
module.exports = {
    // 上下文存储配置
    contextStorage: {
        // 默认内存存储
        default: { module: "memory" },

        // 文件存储（持久化）
        file: {
            module: "localfilesystem",
            config: {
                dir: "context/"
            }
        }
    }
};
```

### 6.3 访问上下文

```javascript
// Function 节点中
context.get('key');           // 获取
context.set('key', value);   // 设置
context.keys();              // 获取所有键

// 异步访问
context.get('key', function(err, val) { ... });
context.set('key', value, function(err) { ... });
```

---

## 7. 子流（Subflow）

### 7.1 创建子流

在编辑器中创建子流，定义输入/输出端口：

```javascript
// 子流内部节点
[节点A] ──▶ [节点B] ──▶ [子流输出]
  ↑
  │
[子流输入]
```

### 7.2 使用子流

子流在流中显示为单个节点：

```
[Inject] ──▶ [子流] ──▶ [Debug]
```

### 7.3 子流实例配置

子流可以有自己的配置参数（实例属性）：

```javascript
// 子流中访问实例属性
msg.payload = this.instanceParam;
return msg;
```

---

## 8. 执行模型详解

### 8.1 消息生命周期

```
1. Inject 触发（手动或定时）
        │
        │ 创建 msg 对象
        ▼
2. 放入输入队列
        │
        │ 事件循环
        ▼
3. Node.on('input') 执行
        │
        │ send() 调用
        ▼
4. 消息传递给下游
        │
        ▼
5. 重复 3-4 直到无下游
```

### 8.2 并发控制

```javascript
// settings.js
module.exports = {
    // 节点最大并发数
    nodeConcurrency: 10,

    // 消息队列最大长度
    runtimeQueueMemory: 1000
};
```

### 8.3 错误处理

```javascript
// 节点内错误
this.error('错误消息', msg);           // 发送错误到 Catch 节点
this.warn('警告消息');                  // 记录警告
this.status({ fill: "red", text: "错误" });  // 显示状态

// Catch 节点捕获
this.on('input', function(msg) {
    // msg.error 包含错误信息
    msg.payload = msg.error.message;
    return msg;
});
```

---

## 9. 消息追踪与调试

### 9.1 Debug 节点

```javascript
// Debug 配置
{
    "type": "debug",
    "name": "调试",
    "active": true,           // 是否激活
    "tosidebar": true,        // 显示在侧边栏
    "console": false,         // 输出到控制台
    "to": "payload"           // 显示哪个字段
}
```

### 9.2 消息追踪

```javascript
// _msgid 用于追踪消息流
msg._msgid  // "abc123..."

// 在 Function 节点中查看
node.log("消息 ID: " + msg._msgid);
```

### 9.3 断点调试

Node-RED 支持在 Function 节点设置断点：

```javascript
// 设置断点（调试模式）
debugger;  // JavaScript 断点
```

---

## 10. 与 FBP 理论的对齐与偏离

### 10.1 完全对齐的部分

1. **黑盒进程**：每个节点是独立的处理单元
2. **异步消息传递**：节点间通过消息通信
3. **单一职责**：每个节点做一件事
4. **可组合**：节点可以组合成子流

### 10.2 偏离的部分

| 理论 FBP | Node-RED 实现 | 偏离原因 |
|---------|---------------|---------|
| 有界 channel（反压） | 无反压机制 | JavaScript 单线程限制 |
| 进程独立线程 | 同一事件循环 | Node.js 架构 |
| 明确 IP 生命周期 | msg 可被修改 | JavaScript 对象引用 |
| 端口类型校验 | 无类型系统 | 动态类型 |

### 10.3 反压缺失的问题

```javascript
// 如果上游产速 > 下游处理速
// 消息会在内存堆积，无自动反压

// 解决方案：手动使用 delay、queue 节点
[HTTP Request] ──▶ [Delay] ──▶ [Process]
   (快)              (限速)      (慢)
```

---

## 11. 完整示例：HTTP API 流程

### 11.1 流程设计

```
[Inject] ──▶ [HTTP Request] ──▶ [JSON] ──▶ [Switch] ──┬─▶ [Debug]
                    │                    │           │
                    │                    │           ├─▶ [Debug]
                    │                    │           │
                    │                    │           └─▶ [Debug]
```

### 11.2 HTTP Request 节点配置

```javascript
{
    "type": "http request",
    "method": "GET",
    "url": "https://api.example.com/data",
    "ret": "obj",          // 返回对象
    "tls": "",             // TLS 配置
    "headers": {}          // 自定义头
}
```

### 11.3 Switch 节点配置

```javascript
{
    "type": "switch",
    "property": "statusCode",
    "rules": [
        { "t": "eq", "v": 200 },
        { "t": "eq", "v": 404 },
        { "t": "else" }
    ],
    "checkall": "false"    // 第一个匹配后停止
}
```

### 11.4 部署后测试

```bash
# 启动 Node-RED
node-red

# 访问编辑器
http://localhost:1880

# 点击 Inject 节点触发流程
# 查看 Debug 侧边栏输出
```

---

## 12. 核心设计模式

### 12.1 模式一：节点注册表

```javascript
// 节点注册表
RED.nodes.registerType("node-type", NodeConstructor, {
    // 额外元数据
    category: "function",
    defaults: {}
});

// 查找节点类
var NodeClass = RED.nodes.getNodeClass("node-type");
```

### 12.2 模式二：配置节点

```javascript
// 配置节点（不可见，用于存储共享配置）
function MyConfigNode(config) {
    RED.nodes.createNode(this, config);
    this.url = config.url;
}

// 注册为配置节点
RED.nodes.registerType("my-config", MyConfigNode, {
    credentials: {
        // 凭证定义
    }
});
```

### 12.3 模式三：事件驱动通信

```javascript
// 节点间通过事件通信
this.on('input', callback);
this.on('close', callback);

// 消息发送
send(msg);    // 发送消息
done();       // 通知完成
error(err);   // 报告错误
warn(msg);    // 警告
log(msg);     // 日志
```

---

## 13. 优缺点分析

### 13.1 优点

1. **极低门槛**：浏览器拖拽即可编程
2. **生态丰富**：npm 上数千个节点包
3. **可托管部署**：Raspberry Pi、容器、云
4. **JSON 序列化**：流程可版本控制
5. **活跃社区**：持续更新和维护

### 13.2 缺点

1. **无反压机制**：高吞吐场景需手动处理
2. **单线程限制**：复杂计算受限
3. **大流难维护**：50+ 节点的流难以阅读
4. **测试困难**：需要 mock 整个运行时

---

## 14. 推荐阅读与资源

### 官方资料
- [nodered.org](https://nodered.org/)
- [Node-RED Docs](https://nodered.org/docs/)
- [GitHub - node-red/node-red](https://github.com/node-red/node-red)

### 深度解析
- **Steve's Node-RED Guide** - 丰富的教程和案例
- **FlowFuse** - Node-RED 企业级托管服务

### FBP 理论
- [jpaulmorrison.com/fbp](https://www.jpaulmorrison.com/fbp/) - FBP 创始人官网

---

## 15. 小结

Node-RED 是 **FBP 范式在 Node.js 生态的最佳实践**：

1. **黑盒进程**：节点独立，通过消息通信
2. **事件驱动**：基于 Node.js 事件循环
3. **三级上下文**：global / flow / node
4. **npm 生态**：数千个可复用节点
5. **JSON 序列化**：流程可版本控制

与 FBP 理论的偏离：
- 无反压机制（JavaScript 单线程限制）
- 无类型系统（动态类型）
- 消息可被修改（非 immutable）

**适用场景**：IoT 集成、API 编排、简单自动化
**不适合**：高性能计算、复杂状态管理
