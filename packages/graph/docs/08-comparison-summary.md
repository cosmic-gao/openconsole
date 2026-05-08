# 七大图编排库横向对比总结

> 架构设计 / 数据模型 / 控制流·数据流 / 数据存储 / 扩展性 / 渲染层 全维度对比 | 决策指南

本文是对前 7 份单库深度文档（01–07）的横向汇总。每个对比维度都基于源码而非文档表述。

---

## 0. 速览：一句话定义

| 库 | 一句话定义 | 起源年份 | 主要语言 |
|----|-----------|---------|---------|
| **Unreal Blueprint** | 工业级游戏可视化脚本系统，编译为字节码在 VM 上执行 | 2014 | C++ |
| **零壤蓝图** | Web 低代码场景下"代码生成"型蓝图，一份设计跑 JS/Java | 2020+ | JS/Java |
| **LiteGraph.js** | 单文件零依赖的 JS 蓝图引擎，ComfyUI 底层支撑 | 2014 | JavaScript |
| **petgraph** | Rust 通用图数据结构库，多种图实现并存 | 2014 | Rust |
| **Node-RED** | FBP 范式在 Node.js 生态的标杆实现，IoT 编排首选 | 2013 | JavaScript |
| **LangGraph** | LLM Agent 时代的状态机编排框架，基于 Pregel/BSP | 2024 | Python/JS |
| **Rete.js** | TypeScript 优先的可视化编程**框架**，多引擎多渲染 | 2017 | TypeScript |

---

## 1. 分类坐标系

### 1.1 三大类划分

```
┌────────────────────────────────────────┐
│  按"是否提供视觉编辑器"分类              │
└────────────────────────────────────────┘

  视觉编辑器 + 执行                       纯执行引擎              纯数据结构
        │                                      │                     │
        ▼                                      ▼                     ▼
  Unreal Blueprint                         LangGraph             petgraph
  零壤蓝图                                                       (无执行语义)
  LiteGraph.js                            (无原生 UI)
  Node-RED
  Rete.js
```

### 1.2 数据流向 / 控制流向 谱系

```
纯数据流（Pull）                      混合                          纯控制流（Push）
       │                                │                                │
       ▼                                ▼                                ▼
LiteGraph.js              Unreal Blueprint              Node-RED
(默认 onExecute)          (exec pin + data pin)         (msg 单向流动)
Rete.js DataflowEngine    Rete.js Hybrid                Rete.js ControlFlowEngine
                          LangGraph
                          (state 共享 + 条件边)
```

### 1.3 执行触发模型

| 触发方式 | 库 | 特征 |
|---------|----|----|
| **拓扑顺序** | LiteGraph.js, Rete.js (Dataflow) | DAG，静态求值顺序 |
| **事件循环** | Node-RED | 消息到达即触发 |
| **VM 字节码** | Unreal Blueprint | 编译后跳转执行 |
| **代码生成** | 零壤蓝图 | 翻译为目标语言代码后运行 |
| **Pregel 超步** | LangGraph | BSP 三阶段循环 |
| **N/A** | petgraph | 仅数据结构，执行由用户实现 |

---

## 2. 架构设计横向对比

每个库都有自己的"骨架图"。以下表格基于源码层面的真实分层。

### 2.1 顶层架构对比

| 库 | 核心分层 | 是否分包 |
|----|---------|---------|
| **UE Blueprint** | 资产层 (`UBlueprint`) → 编辑器图层 (`UEdGraph`/`UK2Node`) → IR 层 (`FBlueprintCompiledStatement`) → 字节码层 (`UFunction::Script`) → VM 层 (`FFrame` + `GNatives`) | 单引擎内分模块 |
| **零壤蓝图** | 蓝图 JSON → 翻译器（适配器）→ 目标语言 AST → 宿主框架代码 | 闭源单体 |
| **LiteGraph.js** | `LiteGraph`（注册表）→ `LGraph`（容器）→ `LGraphNode`（节点）→ `LGraphCanvas`（渲染）| 单文件 14400 行 |
| **petgraph** | `Graph<N,E,Ty,Ix>`（数据）→ `visit::*` traits（接口）→ `algo::*`（算法）| 多 crate workspace |
| **Node-RED** | `Flow`（运行时容器）→ `Node`（EventEmitter 子类）→ `Hooks` 管线 → 编辑器 (前端独立) | runtime/editor/util 多包 |
| **LangGraph** | `StateGraph`（builder）→ `CompiledStateGraph` → `PregelLoop`（BSP 引擎）→ `BaseChannel`（状态总线）→ `BaseCheckpointSaver`（持久化）| 主包 + checkpoint 子包 |
| **Rete.js** | `NodeEditor`（核心）→ `Scope/Signal`（插件管线）→ `Engine`（独立包）→ Framework Renderers（独立包）| 高度模块化多 npm 包 |

### 2.2 关键架构创新

每个库都有一个值得记住的"独门设计"：

#### UE Blueprint：双 Pin + 编译降低（lowering）模式
- **白色 Exec Pin** 与 **彩色 Data Pin** 在同一图模型中并存
- 复杂节点通过 `K2Node::ExpandNode` 在编译期被改写为更原子的节点组合
- 最终编译成线性 IR（`FBlueprintCompiledStatement`），再由 `FKismetCompilerVMBackend` 落到字节码

#### LiteGraph.js：mixin 式继承
- `registerNodeType` 通过 `for...in` 把 `LGraphNode.prototype` 上未被覆盖的方法**塞**到用户构造函数的原型链上
- 用户类不必 `extends LGraphNode`，普通 `function MyNode(){}` 注册后即获得全套能力

#### petgraph：双链头嵌入式邻接表
- `Node.next: [EdgeIndex; 2]`：第 0 槽指向第一条出边、第 1 槽指向第一条入边
- `Edge.next: [EdgeIndex; 2]`：第 0 槽指向"同源下一条出边"、第 1 槽指向"同目标下一条入边"
- 所有边连续存储在 `Vec<Edge>`，缓存友好

#### Node-RED：Hooks 七段管线
- `onSend → preRoute → preDeliver → postDeliver` 覆盖发送端
- `onReceive → postReceive → onComplete` 覆盖接收端
- 任一钩子返回 `false` 即可拦截整条消息流，**返回 Promise 也合法**

#### LangGraph：Channel + 单调版本号实现 vote-to-halt
- 节点不直接读写 state，而是订阅/写入 `BaseChannel` 子类
- `versions_seen[node][chan]` < `channel_versions[chan]` 时该节点被调度
- 所有"Pregel 投票停机"语义通过版本号比较自动实现

#### Rete.js：Scope/Signal 类型化级联
- `Scope<Produces, Parents extends unknown[]>` 双泛型把"插件期待的父级类型"编码进类型系统
- `editor.use(plugin)` 在编译期检查 `plugin.__scope.parents[0]` 是否兼容编辑器产出
- `use()` 内部一行 `this.addPipe(ctx => scope.signal.emit(ctx))` 完成"管道嵌套"

#### 零壤蓝图：适配器矩阵
- 同一份蓝图 JSON 经过不同 `TranslatorAdapter`（JS / Java / ...）输出不同语言
- 节点级翻译规则可热替换（如 `MATH_ADD → "<A> + <B>"`）

---

## 3. 数据模型横向对比

### 3.1 核心元素映射表

| 概念 | UE Blueprint | 零壤蓝图 | LiteGraph.js | petgraph | Node-RED | LangGraph | Rete.js |
|------|--------------|----------|--------------|----------|----------|-----------|---------|
| 图容器 | `UBlueprint` | Blueprint JSON | `LGraph` | `Graph<N,E>` | Flow JSON | `StateGraph` | `NodeEditor` |
| 节点 | `UK2Node` | NodeInstance | `LGraphNode` | `NodeIndex` | Node 实例 | node 函数 | `Node` 类 |
| 端口 | `UEdGraphPin` | inputs/outputs | `slot` | N/A | port 索引 | state key | `Input`/`Output` |
| 连接 | Pin link | Connection | `LLink` | `EdgeIndex` | `wires[][]` | edge / cond_edge | `Connection` |
| 类型系统 | 强类型 Pin（彩色） | 字符串类型 | 字符串匹配 | 编译期泛型 | 无 | TypedDict + Annotated | `Socket` 类型 |
| 序列化 | `.uasset` 二进制 | JSON | JSON 数组 | serde（可选） | flows.json | checkpoint backend | `editor.toJSON()` |
| 控制流 / 数据流分离 | ✅ exec pin | ❌ 隐式 | ⚠️ EVENT 可选 | N/A | ❌ 单 msg | ⚠️ conditional_edge | ✅ exec port |

### 3.2 端口设计哲学差异

```
单端口聚合（消息合一）                多端口分组（按方向 + 名称）          状态共享（无端口）
       │                                       │                              │
       ▼                                       ▼                              ▼
Node-RED: msg 单信封             UE Blueprint: 任意 Pin             LangGraph: 共享 State
LiteGraph: inputs[]+outputs[]    Rete.js: addInput(key)             reducer 处理 fan-in
零壤蓝图: 命名 inputs/outputs                                       petgraph: weight only
```

**关键洞察**：从 LangGraph 的"状态共享"到 UE Blueprint 的"密集端口"是两种极端哲学。前者依赖 `Annotated[T, reducer]` 解决 fan-in；后者通过强类型 Pin 拒绝错误连接，但需要 C++ 编译。

### 3.3 序列化格式紧凑度

按"图大小到磁盘字节比"粗略排序：

```
最紧凑                                                       最冗余
   │                                                            │
   ▼                                                            ▼
LiteGraph (LLink 压数组)   petgraph (serde 可选)       Node-RED (JSON+冗余字段)
UE Blueprint (二进制)      LangGraph (msgpack TypedDict) Rete.js (DOM 友好)
                           零壤蓝图 (JSON+元数据)
```

LiteGraph 的 LLink 序列化为 `[id, origin_id, origin_slot, target_id, target_slot, type]` 数组，比对象格式节省约 70% 字节——这是源码 `serialize()` 中明确的工程决策。

---

## 4. 控制流 / 数据流模型对比（核心章节）

执行模型决定每个库的能力上限。本节按源码追踪每个库的真实执行路径。

### 4.1 执行特性总表

| 维度 | UE Blueprint | 零壤蓝图 | LiteGraph.js | Node-RED | LangGraph | Rete.js |
|------|--------------|----------|--------------|----------|-----------|---------|
| 编译策略 | 字节码 VM | 代码生成 | 拓扑解释 | 事件驱动 | Pregel BSP | 可插拔 |
| 推/拉 | 控制流推 | N/A（生成代码） | 拉（getInputData） | 推（send） | 推（state 流） | 双引擎 |
| 环路支持 | ✅（JUMP 字节码） | ✅（生成 for/while） | ⚠️ 末尾追加，环内顺序不保证 | ✅（连成环） | ✅（超步循环） | ❌（DAG 默认） |
| 并行 | 单游戏线程 | 取决于宿主 | 单 JS 线程 | 事件循环 | async 节点 | Promise.all |
| 终止条件 | Return | 函数结束 | graph.stop | 流停止 | END 节点 + vote-halt | 无活跃节点 |
| 类比 | 游戏脚本 VM | 代码翻译器 | 数据流图 | 消息总线 | 状态机 + DAG | 引擎工厂 |

### 4.2 执行模型本质：四种范式

#### 范式一：编译执行型（字节码 / 代码生成）

```
源图 ──编译──▶ 目标格式 ──执行──▶ 结果

代表: UE Blueprint (字节码)、零壤蓝图 (高级语言代码)
特征: 编译期决定执行顺序，运行时无图遍历
优势: 性能最高，可调试编译产物
劣势: 编译成本，不能动态修改图
```

UE Blueprint 编译流水线（来自 `KismetCompiler.h`）：
```
UEdGraph
   ↓ K2Node::ExpandNode (lowering)
原子节点组合
   ↓ FNodeHandlingFunctor::Compile
FBlueprintCompiledStatement (KCST_*)
   ↓ FKismetCompilerVMBackend::ConstructFunction
EExprToken 字节码
```

#### 范式二：拓扑执行型（DAG 解释）

```
图变化 ──Kahn 拓扑排序──▶ 执行序列 ──按序求值──▶ 结果

代表: LiteGraph.js、Rete.js Dataflow
特征: 按依赖顺序逐节点求值
优势: 求值简单清晰，缓存友好
劣势: 环检测复杂；LiteGraph 把环节点追加到序列末尾，环内顺序不保证
```

LiteGraph 的 Kahn 算法（`computeExecutionOrder` L1161）：
```js
// 1) 入度 0 的节点入栈 S
// 2) 从 S 取节点放入结果 L
// 3) 移除其出边，下游入度 -1，归零则推 S
// 4) 剩在 M 里的就是参与环的节点，**任意顺序**追加到 L
// 5) 按 priority 二次排序
```

#### 范式三：事件驱动型（FBP）

```
触发 ──msg──▶ 节点A ──msg──▶ 节点B ──msg──▶ 节点C

代表: Node-RED
特征: 消息到达即触发，无全局调度
优势: 异步友好，自然支持环路
劣势: 无反压，调试困难
```

Node-RED 的派发选择 `setImmediate` 而非 `process.nextTick` 或 `setTimeout(0)`——`setImmediate` 在事件循环 *check* 阶段执行，让 I/O 回调先跑完再处理消息派发，避免连续 `send` 把 microtask 队列拖死。

#### 范式四：超步同步型（BSP）

```
超步 N:
  Phase 1 - Plan:   prepare_next_tasks 决定哪些节点该跑
  Phase 2 - Execute: 所有 task 并行运行（单超步内写入彼此不可见）
  Phase 3 - Update: apply_writes 用 reducer 合并写入
  Phase 4 - Checkpoint: 持久化 channel_values + channel_versions

超步 N+1: ...
```

LangGraph 的 BSP 屏障**不是显式 `asyncio.Barrier`**，而是隐含在 `PregelLoop.tick()` / `after_tick()` 配对中——runner 必须等所有 task future 都 settled 才会进入 `after_tick`，相当于通过单线程主循环 + `await asyncio.gather(*tasks)` 在事件循环层面实现 BSP 屏障。

### 4.3 拉模型 vs 推模型的核心对比

同样的逻辑管道 A → B → C（C 想要值），两种模型执行路径完全不同：

#### Rete.js Dataflow（拉/递归后序遍历）

```typescript
// engine/src/dataflow.ts
public async fetch(nodeId: NodeId) {
  const inputs = await this.fetchInputs(nodeId)   // 递归向上拉
  return await result.data(() => inputs)
}

public async fetchInputs(nodeId: NodeId) {
  const cons = ...                                // 找入边
  const consWithSourceData = await Promise.all(   // 并行拉上游
    cons.map(async c => ({ c, sourceData: await this.fetch(c.source) }))
  )
  // 同一 input 多入边聚合为数组
}
```

- C 请求自己的输出 → 引擎递归后序遍历：C 需要 B → B 需要 A → A 求值 → B 求值 → C 求值
- `Promise.all` 让兄弟分支并行
- 结果缓存在内部 `cache: Cache<NodeId, ...>`，连接变更时 invalidate

#### Node-RED 推模型（事件冒泡）

```javascript
// Node.js:381-492 (节选)
this._flow.send([{ msg, source, destination, cloneMessage: msgSent }])
// → Flow.handlePreRoute → handlePreDeliver → setImmediate → destination.receive(msg)
```

- A fire（如 HTTP 请求）→ A 调 `send(msg)` → SendEvent 进入 Flow 管线
- 经过 `onSend → preRoute → preDeliver → postDeliver` 四段 hook
- `setImmediate` 切片后调 `B.receive(msg)`
- B 处理 → `send(msg)` → C 处理
- **无缓存**，A fire 100 次则 B/C 处理 100 次

**实现差异**：拉模型 = 缓存 + 按需触发；推模型 = 无缓存 + 主动触发。Rete.js 的 ControlFlow 引擎与 Node-RED 思路一致，二者都依赖节点显式调用 `forward(output)` / `send(msg)`。

### 4.4 LangGraph "step" vs Pregel 真正的"超步"

LangGraph 文档常用 "step" 表达——但要分清两种语义：

| 维度 | LangGraph 默认 step | Pregel 超步（BSP） |
|------|---------------------|--------------------|
| 默认粒度 | 一次激活的节点集合 | 所有活跃节点并行 |
| Barrier | 通过 `after_tick` 隐式实现 | 显式全局 barrier |
| 状态合并 | reducer (`Annotated[T, op]`) | combiner |
| 并发写冲突 | `LastValue.update` 抛 `InvalidUpdateError`；`BinaryOperatorAggregate` fold | combiner 处理 |
| 适用规模 | 单进程多 agent | 分布式集群（如 Pregel/Giraph） |

LangGraph 的实现选择：用 Python `asyncio` 单线程 + 单调版本号取代真正的分布式同步原语——**用 cooperative scheduling 取代真正的 barrier**。

### 4.5 字节码 VM 执行（UE Blueprint 独有）

UE Blueprint 是这 7 个库中唯一拥有真实字节码 VM 的：

```cpp
// Engine/Source/Runtime/CoreUObject/Private/UObject/ScriptCore.cpp
void FFrame::Step(UObject* Context, RESULT_DECL)
{
    int32 B = *Code++;                                     // 读 1 字节 opcode
    (Context->*GNatives[B])(*this, RESULT_PARAM);          // 成员函数指针分派
}
```

**它不是 `switch (op) { case ... }` 解释器**，而是 C++ 成员函数指针表（`GNatives[EX_Max]`）。每条 `EX_*` opcode 对应一个 `execXxx` 成员函数，通过 `IMPLEMENT_VM_FUNCTION` 宏注册到表里。这是从 1998 年 UnrealScript 继承下来的设计，性能上限受限于"每条指令一次间接调用 + Code++"的开销——这就是 `EX_CallMath`（直接静态调度）作为优化引入的原因。

---

## 5. 数据存储 / 持久化对比

### 5.1 状态位置

| 库 | 状态存放位置 | 持久化粒度 | 跨会话隔离 |
|----|-------------|----------|----------|
| UE Blueprint | UObject 属性（内存） | UE SaveGame（手动） | 单 UWorld 实例 |
| 零壤蓝图 | 宿主框架（如 Vue data） | 由宿主决定 | 由宿主决定 |
| LiteGraph.js | `Node.properties` + `LLink._data` | `graph.serialize()` | 单浏览器 tab |
| petgraph | 节点/边 weight（调用方拥有） | serde（应用决定） | 应用决定 |
| Node-RED | 三级 context（node/flow/global） | Memory / File / 自定义 store | 单 flow 部署 |
| LangGraph | `Channel` 实例（不在 node 内）| `Checkpointer` 后端 | `thread_id` |
| Rete.js | `Node` 类成员 + `Cache<NodeId, ...>` | JSON 导入导出 | 单 editor 实例 |

### 5.2 持久化能力光谱

```
无内置 ◄─────────────────────────────────────────────────► 完整内置

UE Blueprint   LiteGraph.js   Node-RED        LangGraph
零壤蓝图       Rete.js                        (4 种 backend)
petgraph                      (Memory/File)
```

### 5.3 LangGraph Checkpointer 设计（业界最完整方案）

```python
# libs/checkpoint/langgraph/checkpoint/base/__init__.py
class BaseCheckpointSaver:
    def get_tuple(self, config) -> CheckpointTuple | None: ...
    def list(self, config, *, filter=None, before=None, limit=None) -> Iterator[CheckpointTuple]: ...
    def put(self, config, checkpoint, metadata, new_versions) -> RunnableConfig: ...
    def put_writes(self, config, writes, task_id, task_path="") -> None: ...

class Checkpoint(TypedDict):
    v: int
    id: str                                     # 单调递增 UUIDv6
    ts: str
    channel_values: dict[str, Any]
    channel_versions: ChannelVersions
    versions_seen: dict[str, ChannelVersions]
    updated_channels: list[str] | None
```

四种官方实现：

| Backend | 用途 |
|---------|------|
| `MemorySaver` | 开发测试 |
| `SqliteSaver` | 单机持久化 |
| `PostgresSaver` | 生产环境 |
| `RedisSaver`（社区） | 高频读写 |

`Checkpoint` 用 `TypedDict` 而非 dataclass，方便 JSON / msgpack 序列化。它**只存通道值与版本号**——节点本身没有"私有状态"，所有可恢复信息都已被通道吸收。

`thread_id` 隔离机制：调用方传 `{"configurable": {"thread_id": "abc"}}`，所有 saver 实现都把 `thread_id` 作为一级分区键（SQLite 写入 row primary key，Postgres 写入 schema 列）。

### 5.4 Time Travel（时间回溯）

只有 LangGraph 提供原生 API：

```python
history = list(app.get_state_history(config))
old_state = history[5]
app.invoke(None, {
    "configurable": {
        **old_state.config["configurable"],
        "checkpoint_id": old_state.config["configurable"]["checkpoint_id"]
    }
})
```

底层依赖 `parent_config` 字段形成 checkpoint 链表，`get_state_history` 沿链向前遍历。

### 5.5 Node-RED 三级 Context（独有的层次模型）

```javascript
// 节点级 Context（仅当前节点）
this.context().set("key", "value");

// 流级 Context（同 tab 内）
this.context().flow.set("key", "value");

// 全局 Context（所有流）
this.context().global.set("key", "value");

// settings.js 配置存储后端
contextStorage: {
    default: { module: "memory" },
    file: { module: "localfilesystem", config: { dir: "context/" } }
}
```

这是 7 个库中独有的"三级作用域"设计——既符合 FBP 的"节点隔离"，又能通过 flow/global 表达跨节点共享状态。

### 5.6 LiteGraph 的"瞬态数据 vs 拓扑"分离

LiteGraph 序列化时刻意排除运行时数据（`src/litegraph.js:2647`）：

```js
// LGraphNode.serialize() 节选
delete this.outputs[i]._data;  // 不持久化运行时数据
```

`LLink._data` 也同样不进序列化。这是工程上"存档只保留拓扑、运行时数据归运行时"的清晰分离。结果：图存档只携带 `type` 字符串引用——**加载方必须先 `LiteGraph.registerNodeType(...)` 注册同名类型**才能复现，这是跨工程交换图的核心契约。

---

## 6. 扩展性对比

### 6.1 自定义节点的代价矩阵

| 库 | 扩展机制 | 代码量（最小自定义节点） | 类型安全 |
|----|---------|----------------------|---------|
| UE Blueprint | C++ `UFUNCTION` 或 `K2Node` 子类 | 高（需 UE 工程） | 强（C++） |
| 零壤蓝图 | 平台预定义节点 + 翻译规则 | 中 | 弱 |
| LiteGraph.js | `LiteGraph.registerNodeType()` | 极低（5 行 JS） | 无 |
| petgraph | Trait 实现 | 中（需理解 Visitor traits） | 强（Rust） |
| Node-RED | npm 包（HTML + JS） | 中（需双文件） | 无 |
| LangGraph | 普通 Python/JS 函数 | 极低（一个函数） | 中（typing） |
| Rete.js | TypeScript class | 中（需 Schemes） | 强（TS） |

### 6.2 插件系统设计粒度

```
无插件                     节点级                       架构级
   │                          │                           │
   ▼                          ▼                           ▼
零壤蓝图          LiteGraph (registerNodeType)     Rete.js (Scope/Signal)
                  Node-RED (npm 包)                Node-RED (Hooks API v1.2+)
                  LangGraph (函数即节点)
                  UE Blueprint (UFUNCTION)
```

### 6.3 Rete.js 插件级联（最优雅的设计）

```typescript
// rete/src/scope.ts:84-119
export class Scope<Produces, Parents extends unknown[] = []> {
  use<S extends Scope<any, any[]>>(scope: NestedScope<S, [Produces, ...Parents]>) {
    scope.setParent(this)
    this.addPipe(context => {
      return scope.signal.emit(context)   // ← 把子 scope 整个管道塞进父级
    })
    return useHelper<S, ...>()
  }
}
```

一行代码同时承担：
1. 消息总线（`addPipe`）
2. 依赖注入（`setParent` + `parentScope<T>`）
3. 类型校验（`NestedScope<S, [Produces, ...Parents]>` 编译期检查）

这是 Drawflow、ReactFlow、LiteGraph 都没有的能力。

### 6.4 Hook / 中间件能力

| 库 | 是否支持中间件拦截 | 拦截点 |
|----|------------------|-------|
| UE Blueprint | ⚠️ 通过 K2Node ExpandNode | 编译期 |
| LiteGraph.js | ⚠️ 通过 onExecute 重写 | 单节点级 |
| Node-RED | ✅ Hooks API（v1.2+）| onSend/preRoute/preDeliver/postDeliver/onReceive/postReceive/onComplete |
| LangGraph | ✅ 通过节点函数 + checkpointer | 节点边界 + 超步边界 |
| Rete.js | ✅ `editor.addPipe()` | 所有信号 |

---

## 7. 渲染层对比

只有 5 个库提供原生渲染层（petgraph 与 LangGraph 不提供）。

### 7.1 渲染技术栈

| 库 | 渲染器 | 自定义节点 UI 方式 |
|----|--------|------------------|
| UE Blueprint | Slate（UE 即时模式 UI） | C++ `SGraphNode` 子类 |
| 零壤蓝图 | 自研 Canvas / DOM | 平台 SDK |
| LiteGraph.js | Canvas2D | `onDrawForeground(ctx)` 回调 |
| Node-RED | SVG（连线）+ HTML（节点） | HTML 模板 + jQuery |
| Rete.js | 框架原生（React/Vue/Angular/Svelte） | 框架组件 |

### 7.2 性能 vs 框架集成的取舍

```
性能优先                                              框架集成优先
   │                                                       │
   ▼                                                       ▼
LiteGraph (Canvas)         Node-RED (SVG+DOM)       Rete.js (React/Vue)
约 5K 节点流畅              约 1K 节点流畅            约 200-500 节点流畅
无 DOM 可访问性             有限可访问性              完整 DOM 可访问性
```

**Rete.js 后来居上的原因**：
- LiteGraph.js 7.9k stars，Rete.js 11.9k stars
- Rete.js 选择"插件化框架渲染" → React/Vue 开发者可贡献
- LiteGraph.js 选择"独立 Canvas2D" → 生态封闭

### 7.3 LiteGraph 的渲染优化技巧

`drawConnections`（L9376）只遍历 inputs 而不遍历 outputs：

```js
for (var n = 0; n < nodes.length; ++n) {
    var node = nodes[n];
    if (!node.inputs || !node.inputs.length) continue;
    for (var i = 0; i < node.inputs.length; ++i) {
        var input = node.inputs[i];
        if (!input || input.link == null) continue;
        // ... 通过 link 找源节点画线
    }
}
```

每个 input 只持有 1 条 link，所以"遍历所有节点的所有 input 槽" = "遍历所有 link"，且天然去重。

`low_quality = this.ds.scale < 0.6`（缩放小于 0.6 时跳过阴影、禁用文本测量）是大图流畅的关键。

---

## 8. 概念映射字典

跨库迁移的"翻译表"。同一行的概念在不同库中扮演相同角色。

| 通用概念 | UE Blueprint | LiteGraph.js | petgraph | Node-RED | LangGraph | Rete.js |
|---------|--------------|--------------|----------|----------|-----------|---------|
| 图容器 | UBlueprint | LGraph | Graph<N,E> | Flow JSON | StateGraph | NodeEditor |
| 节点 | UK2Node | LGraphNode | NodeIndex | Node | node 函数 | Node 类 |
| 边 / 连接 | Pin link | LLink | EdgeIndex | wire | edge | Connection |
| 输入端口 | Input Pin | input slot | N/A | input event | state key | Input |
| 输出端口 | Output Pin | output slot | N/A | wires[i] | reducer key | Output |
| 执行令牌 | Exec Pin | (无/可选 EVENT) | N/A | msg | active step | exec port |
| 数据载荷 | Data Pin 值 | slot data | weight E | msg.payload | state field | data() 返回值 |
| 状态 | UProperty | properties | weight N | context | TypedDict | Node 成员 |
| 检查点 | SaveGame | serialize() | N/A | context store | Checkpointer | toJSON() |
| 广播 | Event Dispatcher | EVENT | N/A | wires 多目标 | conditional 全分支 | broadcast signal |
| 条件路由 | Branch K2Node | onExecute 自定义 | toposort + filter | Switch 节点 | conditional_edges | ControlFlow exec |
| 子图 | Function/Macro | 嵌套 LGraph | 子 Graph | Subflow | Subgraph | 嵌套 NodeEditor |
| 注册新节点 | UFUNCTION 宏 | registerNodeType | trait 实现 | RED.nodes.registerType | 函数+add_node | class 定义 |
| 编译/编排 | FKismetCompiler | 拓扑排序 | 用户实现 | 部署 | builder.compile() | 引擎注册 |
| 终止条件 | Return | runStep 不变 | N/A | Flow Stop | END 节点 | 无活跃节点 |

---

## 9. 决策指南

### 9.1 用例 → 库 决策矩阵

| 用例 | 首选 | 备选 | 应避免 |
|------|------|------|-------|
| 游戏逻辑（UE 引擎内） | UE Blueprint | （无可比） | petgraph、LangGraph |
| 浏览器内可视化节点编辑器 | Rete.js | LiteGraph.js | petgraph、Node-RED |
| 高性能浏览器图（10k+ 节点） | LiteGraph.js | Rete.js（无渲染） | DOM 工具 |
| AI 工作流（如 Stable Diffusion） | LiteGraph.js (ComfyUI 已验证) | Rete.js | UE Blueprint |
| IoT 数据路由 / 智能家居 | Node-RED | （无可比） | UE Blueprint |
| LLM Agent + 人工干预 | LangGraph | （无可比） | UE Blueprint、LiteGraph |
| Web 低代码业务逻辑编排 | 零壤蓝图 / OneCode | Node-RED | LangGraph、petgraph |
| 编译器 IR / 依赖图 / DAG 分析 | petgraph | （语言相关） | 视觉工具 |
| 流程审批 / BPMN | （专用 BPMN 引擎） | 零壤蓝图 | 游戏 Blueprint |

### 9.2 不该用的场景（直接列表）

- **UE Blueprint**：不要在 UE 之外使用，强耦合 UE 运行时
- **LiteGraph.js**：不要用作生产 Agent 编排，无类型系统/无检查点
- **petgraph**：不要直接用作工作流引擎，仅是数据结构
- **Node-RED**：不要用作类型敏感的 AI 流程，msg 信封模型力不从心
- **LangGraph**：不要用作真正的并行分布式系统，节点串行执行
- **Rete.js**：不要在不需要视觉层的场景使用，太重
- **零壤蓝图**：不要用作高性能计算或复杂算法

### 9.3 学习曲线对比

```
平缓 ◄────────────────────────────────────────────────────► 陡峭

LiteGraph.js     Node-RED       零壤蓝图       Rete.js          UE Blueprint
(5 分钟入门)     (浏览器拖拽)    (平台 SDK)     (需理解 Scope)   (需 UE 工程)
                                                petgraph        LangGraph
                                                (Rust + traits) (BSP + Reducer)
```

---

## 10. 学习路径推荐

### 10.1 按背景定制学习路径

**前端工程师起步**：
```
LiteGraph.js (轻量入门)
    ↓
Rete.js (生产级框架)
    ↓
LangGraph (Agent 时代)
```

**游戏 / C++ 工程师起步**：
```
UE Blueprint (可视化脚本经典)
    ↓
LiteGraph.js (移植到浏览器思路)
    ↓
LangGraph (新一代状态机)
```

**后端 / 系统工程师起步**：
```
petgraph (Rust 图数据结构)
    ↓
Node-RED (FBP 工业实现)
    ↓
LangGraph (BSP + 状态机)
```

**AI / 研究方向**：
```
LangGraph (BSP + Agent)
    ↓
[Pregel 论文 SIGMOD 2010]
```

### 10.2 关键论文和资料

#### 学术论文

- **Pregel: A System for Large-Scale Graph Processing** (Malewicz et al., SIGMOD 2010) — BSP 起源
- **Flow-Based Programming** (J. Paul Morrison, 1971+) — FBP 思想

#### 开发深度博客

| 主题 | 推荐资源 |
|------|---------|
| UE Blueprint VM | Intax - *Discovering Blueprint VM* |
| Pregel → LangGraph | Pur4v - *The Evolution of Graph Processing: From Pregel to LangGraph* |
| LangGraph 内部 | Max Pilzys - *LangGraph Transactions—Pregel, Message Passing and Super-steps* |
| Rete.js 设计 | Vitaliy Stoliarov - *Rete.js 2: visual programming* |
| petgraph | Depth-First.com - *Graphs in Rust* |

### 10.3 阅读本目录文档的推荐顺序

```
1️⃣ 核心理论：[01] UE Blueprint （了解经典 = 理解所有继承者）
    │
    ▼
2️⃣ Web 移植：[03] LiteGraph + [07] Rete.js （了解浏览器实现）
    │
    ▼
3️⃣ FBP 范式：[05] Node-RED （了解纯消息流派）
    │
    ▼
4️⃣ 国产实践：[02] 零壤蓝图 （了解代码生成派）
    │
    ▼
5️⃣ AI 时代：[06] LangGraph （了解 BSP 状态机）
    │
    ▼
6️⃣ 数据结构：[04] petgraph （了解通用图基建）
    │
    ▼
7️⃣ 总览：[08] 本文档 （横向对比）
```

---

## 11. 综合对比一览表

最后一张大表，所有维度一目了然：

| 维度 | UE Blueprint | 零壤蓝图 | LiteGraph.js | petgraph | Node-RED | LangGraph | Rete.js |
|------|--------------|----------|--------------|----------|----------|-----------|---------|
| 起源年份 | 2014 | 2020+ | 2014 | 2014 | 2013 | 2024 | 2017 |
| 主要语言 | C++/蓝图 | JS/Java | JavaScript | Rust | JavaScript | Python/JS | TypeScript |
| 类型系统 | 强 | 弱 | 字符串 | 编译期泛型 | 无 | TypedDict | 强（TS） |
| 执行模型 | 字节码 VM | 代码生成 | 拓扑解释 | N/A | 事件驱动 | Pregel BSP | 双引擎 |
| 视觉层 | 内置（Slate）| 内置 | 内置（Canvas2D）| 无 | 内置（SVG+HTML）| 无 | 多框架适配 |
| 环路 | ✅（JUMP）| ✅（生成 for）| ⚠️ 末尾追加 | 不限 | ✅ | ✅ | ❌（默认）|
| 检查点 | ❌ | ❌ | ❌ | ❌ | ⚠️ | ✅（4 backend）| ❌ |
| Time Travel | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 多端口 | ✅（Pin）| ⚠️ | ⚠️ | N/A | ❌ | ❌（共享 state）| ✅ |
| 控制流 / 数据流分离 | ✅（exec/data pin）| ❌ | ⚠️（EVENT）| N/A | ❌（msg）| ⚠️ | ✅（双引擎）|
| 子图 | ✅（Function/Macro）| ✅ | ✅ | N/A | ✅（Subflow）| ✅ | ✅ |
| 流式输出 | ❌ | ❌ | ❌ | N/A | ⚠️（msg 频发）| ✅（7 模式）| ❌ |
| 人工干预 | ❌ | ❌ | ❌ | N/A | ⚠️（手动节点）| ✅（interrupt）| ❌ |
| 生态规模 | 巨大（游戏）| 中（国内低代码）| 中（ComfyUI）| 中（Rust）| 大（IoT）| 大（AI）| 中 |
| GitHub Stars | （内置 UE）| （未开源）| 7.9k | 3.0k | 19.7k | 18k+ | 11.9k |
| 开源 | ❌（UE 商业）| ❌ | ✅（MIT）| ✅（MIT/Apache）| ✅（Apache）| ✅（MIT）| ✅（MIT）|
| 学习曲线 | 高 | 低 | 极低 | 中 | 低 | 高 | 中-高 |

---

## 12. 三大设计哲学

经过 7 个库的深度分析，可以总结出"图编排"这一领域的三大设计哲学：

### 12.1 编译派 vs 解释派

```
编译派: UE Blueprint, 零壤蓝图
  - 性能优势（运行时开销小）
  - 调试便利（产物可读）
  - 灵活性差（图变化需重编译）

解释派: LiteGraph, Node-RED, Rete.js, LangGraph
  - 灵活性强（动态图）
  - 实现简单（无编译器）
  - 性能上限较低
```

### 12.2 状态共享 vs 消息传递

```
状态共享: LangGraph
  - 节点通过修改共享 State 通信
  - 优势: 简单直观，自然支持复杂数据
  - 劣势: 需要 Reducer 处理并发写入

消息传递: Node-RED, Rete.js (ControlFlow)
  - 节点通过显式消息通信
  - 优势: 隔离清晰，易于分布式
  - 劣势: 序列化开销，多端点设计复杂

混合: UE Blueprint
  - 既有状态（UProperty）也有消息（事件）
```

### 12.3 单一引擎 vs 可插拔引擎

```
单一引擎: UE Blueprint, LiteGraph, LangGraph, Node-RED
  - 一种执行模型，深度优化

可插拔: Rete.js (Dataflow + ControlFlow + Hybrid)
  - 多种执行模型适应不同场景
  - 引擎间可组合（exec port 走 ControlFlow，data port 走 Dataflow）
```

---

## 附录 A：术语表

| 术语 | 含义 |
|------|------|
| BSP | Bulk Synchronous Parallel，批量同步并行（Pregel 核心模型） |
| FBP | Flow-Based Programming，流式编程（Node-RED 理论基础） |
| DAG | Directed Acyclic Graph，有向无环图 |
| Reducer | 多节点写入同一字段时的合并函数（LangGraph 概念） |
| Channel | LangGraph 中的状态槽，对应 state 的一个 key |
| Superstep | BSP 中的"超步"，包含 Plan / Execute / Update / Checkpoint 四阶段 |
| Vote-Halt | 节点表态希望终止；所有节点 vote-halt 时图执行结束 |
| Time Travel | 回到历史 checkpoint 重新分叉执行 |
| Pin | UE Blueprint 中的节点引脚（exec 或 data 类型） |
| Slot | LiteGraph 中的端口位置（input slot / output slot） |
| Socket | Rete.js 中的端口类型标识 |

## 附录 B：源码定位

读者需要查阅源码时的关键路径：

| 库 | 关键源文件 |
|----|-----------|
| UE Blueprint | `Engine/Source/Editor/BlueprintGraph/` + `Engine/Source/Runtime/Engine/Private/KismetVM/` + `Engine/Source/Runtime/CoreUObject/Private/UObject/ScriptCore.cpp` |
| LiteGraph.js | `litegraph.js` 单文件（约 14400 行） |
| petgraph | `crates/petgraph/src/graph_impl/`（Graph）+ `crates/petgraph/src/algo/`（算法）+ `crates/petgraph/src/visit/`（traits） |
| Node-RED | `packages/node_modules/@node-red/runtime/lib/nodes/Node.js` + `flows/Flow.js` + `@node-red/util/lib/hooks.js` |
| LangGraph | `libs/langgraph/langgraph/pregel/loop.py` + `_algo.py` + `channels/*.py` + `libs/checkpoint/langgraph/checkpoint/base/` |
| Rete.js | `rete/src/scope.ts` + `editor.ts` + 独立包 `engine/src/dataflow.ts` + `control-flow.ts` |

---

**最后更新**：2026-05-06

**版本**：2.0（强化架构 / 数据模型 / 控制流·数据流 / 数据存储 四维度对比）

**用途**：学习研究笔记
