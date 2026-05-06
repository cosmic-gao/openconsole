# LangGraph 深度解析

> LLM Agent 编排框架 | 状态机 | Pregel/BSP 执行引擎 | 可恢复执行

---

## 1. 概述与背景

### 1.1 什么是 LangGraph

LangGraph 是 **LangChain 团队于 2024 年 1 月**发布的开源框架，专为构建**有状态、长时运行、可恢复**的 Agent 应用设计。

**核心论断**：

> 传统的链式（Chain）编排无法表达 Agent 真正需要的**循环、重试、人工干预**。

### 1.2 设计目标

1. **Durable execution** - Agent 可运行数天，中途崩溃可从 checkpoint 恢复
2. **Human-in-the-loop** - 任意节点可暂停等待人类介入
3. **Comprehensive memory** - 短期工作记忆 + 长期持久记忆
4. **First-class streaming** - token-by-token 流式输出
5. **Production deployment** - 配套 LangSmith 部署平台

### 1.3 Pregel/BSP 起源

LangGraph 的执行引擎直接对应 **Google Pregel 论文 (2010)** 的 BSP (Bulk Synchronous Parallel) 模型：

```
Superstep N:
┌──────────────────────────────────────────────────────┐
│  Plan:      决定哪些 actor 在本步执行                 │
│  Execute:   所有选中 actor 并行运行                 │
│             (期间的 write 对其他 actor 不可见)        │
│  Update:    把所有 write 通过 reducer 合并           │
│  Checkpoint: 状态持久化（可选）                      │
└──────────────────────────────────────────────────────┘
                    │
                    ▼
Superstep N+1: ...
```

---

## 2. 核心抽象

### 2.1 四大原语

```
StateGraph (Builder)
    │
    │ .add_node()
    │ .add_edge()
    │ .add_conditional_edges()
    │
    ▼ .compile()
CompiledGraph (= Pregel 实例)
    │
    ├── Nodes      ← Python 函数，接收 state 返回 update
    ├── Edges      ← 普通边 / 条件边 / Send
    ├── Channels   ← 共享状态槽，带 reducer
    ├── Checkpointer ← 持久化层
    └── Pregel runtime ← BSP 执行引擎
```

### 2.2 与传统 Chain 的对比

| 维度 | LangChain Chain | LangGraph |
|------|----------------|-----------|
| **执行模型** | 线性 | 有向图（可循环） |
| **状态管理** | 无状态 | 显式 State |
| **错误恢复** | 无 | Checkpoint |
| **人工介入** | 无 | interrupt() |
| **适用场景** | 简单问答 | 复杂 Agent |

---

## 3. 数据模型

### 3.1 State 定义

State 是贯穿整个图执行的共享数据结构：

```python
from typing import TypedDict, Annotated, List
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    # 普通字段：每次写入会覆盖
    query: str
    iteration: int

    # Annotated 字段：写入会通过 reducer 累积
    # add_messages 是内置 reducer：追加新消息到列表
    messages: Annotated[List[BaseMessage], add_messages]
```

### 3.2 Annotated Reducer

Reducer 定义多节点**并发写入同一字段**时的合并策略：

```python
from typing import Annotated
from operator import add
from langgraph.graph.message import add_messages

# 内置 reducer
messages: Annotated[List, add_messages]   # 消息追加
steps: Annotated[List[int], add]         # 列表拼接

# 自定义 reducer
def custom_reducer(current, update):
    """取最大值"""
    return max(current, update)

value: Annotated[int, custom_reducer]
```

### 3.3 Channel 类型

| Channel | 行为 |
|---------|------|
| `LastValue` | 只保留最后一次写入（默认普通字段） |
| `Topic` | Pub/Sub 风格，所有 push 累积 |
| `BinaryOperatorAggregate` | 用二元操作合并（如 sum、append） |
| `EphemeralValue` | 仅在当前 step 有效，不持久化 |
| `AnyValue` | 接受任何值，无 reducer |

---

## 4. 完整代码示例

### 4.1 ReAct Agent 完整实现

```python
from typing import TypedDict, Annotated, List
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool

# 1. 定义工具
@tool
def search_web(query: str) -> str:
    """搜索网络获取信息"""
    return f"关于 '{query}' 的搜索结果..."

tools = [search_web]

# 2. 定义状态
class AgentState(TypedDict):
    messages: Annotated[List, add_messages]

# 3. 创建 LLM
llm = ChatOpenAI(model="gpt-4o").bind_tools(tools)

# 4. Agent 节点
def agent_node(state: AgentState) -> dict:
    """根据当前消息决定下一步：回答 or 调用工具"""
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

# 5. 路由函数
def should_continue(state: AgentState) -> str:
    """根据 LLM 输出决定下一步"""
    last_message = state["messages"][-1]
    if last_message.tool_calls:
        return "tools"    # 有工具调用 → 调工具
    return END           # 无工具调用 → 结束

# 6. 构图
graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("tools", ToolNode(tools))

graph.add_edge(START, "agent")
graph.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tools": "tools",   # 工具调用 → 工具节点
        END: END            # 结束
    }
)
graph.add_edge("tools", "agent")  # 工具完成后回到 agent

# 7. 编译
app = graph.compile()

# 8. 调用
result = app.invoke({
    "messages": [{"role": "user", "content": "Anthropic 最新发布了什么?"}]
})

print(result["messages"][-1].content)
```

### 4.2 执行流程图

```
用户输入
    │
    │ START
    ▼
┌──────────┐
│  agent   │  ← LLM 判断是否需要工具
└──────────┘
    │
    │ should_continue()
    │
    ├─── 有 tool_calls ──▶ ┌──────────┐     ┌──────────┐
    │                       │  tools   │ ──▶ │  agent   │
    │                       └──────────┘     └──────────┘
    │                                           ▲
    │                                           │
    └─── 无 tool_calls ──▶ [END] ←─────────────┘
```

---

## 5. Pregel 执行引擎

### 5.1 三阶段超级步循环

```python
# LangGraph 内部 Pregel 执行循环（伪代码）
def tick(input_channels_values):
    while True:
        # ┌─────────────────────────────────────────────┐
        # │  Superstep                                   │
        # │                                              │
        # │  ① Plan: 根据 channel 状态决定哪些节点执行   │
        # │  ② Execute: 所有选中节点并行运行            │
        # │  ③ Update: 用 reducer 合并所有写入          │
        # │  ④ Checkpoint: 状态持久化（如果配置了）     │
        # └─────────────────────────────────────────────┘

        # 检查是否应该结束
        if not active_nodes:
            break

        # 执行一个 superstep
        active_nodes = execute_superstep(active_nodes)
```

### 5.2 超级步详细流程

```python
def execute_superstep(nodes_to_execute):
    # ① Plan: 选择需要执行的节点
    # - 第一步：选择订阅 START channel 的节点
    # - 之后：选择订阅本步更新过的 channel 的节点

    # ② Execute: 并行执行所有选中节点
    # 注意：执行期间的写入对其他节点不可见
    writes = []
    for node in nodes_to_execute:
        result = node.invoke(input_values)
        writes.extend(result.writes)

    # ③ Update: 用 reducer 合并所有写入到 channel
    for channel, value in writes:
        channel.update(value)

    # ④ Checkpoint: 持久化状态
    if self.checkpointer:
        self.checkpointer.save(state)

    # 返回下一步应该执行的节点
    return determine_next_nodes(writes)
```

### 5.3 Send 机制（多节点并行）

```python
from langgraph.channels import LastValue

def parallel_node(state):
    """一个节点可触发多个下游节点"""
    return [
        Send("node_a", {"value": 1}),   # 触发 node_a
        Send("node_b", {"value": 2}),   # 触发 node_b
    ]

graph.add_node("parallel", parallel_node)
graph.add_node("node_a", lambda s: print(f"A got {s}"))
graph.add_node("node_b", lambda s: print(f"B got {s}"))
```

---

## 6. 条件边详解

### 6.1 条件边函数

```python
from typing import Literal

def route_based_on_intent(state: AgentState) -> Literal["research", "respond", "escalate"]:
    """根据意图路由"""
    intent = state.get("intent")

    if intent == "research":
        return "research"
    elif intent == "respond":
        return "respond"
    else:
        return "escalate"

# 添加条件边
graph.add_conditional_edges(
    "intent_classifier",      # 源节点
    route_based_on_intent,    # 路由函数
    {
        "research": "research_node",    # key → 目标节点
        "respond": "respond_node",
        "escalate": "human_review"
    }
)
```

### 6.2 内置条件边

```python
# 预定义的条件判断
from langgraph.graph import SEND_TO_LLMW

# 总是发送到 LLM
graph.add_conditional_edges(
    "some_node",
    lambda state: SEND_TO_LLMW,  # 内置常量
    ["llm_node"]
)
```

---

## 7. Checkpoint 与 Time Travel

### 7.1 配置 Checkpoint

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.checkpoint.postgres import PostgresSaver

# 内存存储（单进程）
checkpointer = MemorySaver()

# PostgreSQL 存储（持久化）
checkpointer = PostgresSaver.from_conn_string("postgresql://...")

# 编译时传入 checkpointer
app = graph.compile(checkpointer=checkpointer)
```

### 7.2 带 Checkpoint 的调用

```python
# 每次调用传入 thread_id 标识会话
config = {"configurable": {"thread_id": "user-123"}}

# 第一次调用
result = app.invoke({"messages": [...]}, config)

# 第二次调用（从上次状态续跑）
result = app.invoke({"messages": [...]}, config)

# 查看状态历史
history = list(app.get_state_history(config))

# Time Travel：回到第 N 步重新分叉
old_state = history[5]
app.invoke(None, {"configurable": {
    **old_state.config["configurable"],
    "checkpoint_id": old_state.config["configurable"]["checkpoint_id"]
}})
```

### 7.3 状态回溯

```python
# 获取所有 checkpoint
checkpoints = list(app.get_state_history(config))

# 恢复到指定 checkpoint
app.update_state(
    config,
    {"messages": [...]}  # 新的状态
)
```

---

## 8. Human-in-the-Loop

### 8.1 interrupt() 暂停

```python
from langgraph.types import interrupt

def approval_node(state):
    """需要人工审批的节点"""
    decision = interrupt({
        "question": "是否批准此操作?",
        "data": state["plan"]
    })
    return {"approved": decision}

def execute_node(state):
    """执行节点"""
    if not state.get("approved"):
        return {"result": "已拒绝"}
    return {"result": "执行中..."}

graph.add_node("approval", approval_node)
graph.add_node("execute", execute_node)
```

### 8.2 Command 恢复

```python
from langgraph.types import Command

# 用户审核后恢复
result = app.invoke(
    Command(resume={"decision": True}),  # 传入用户决策
    config
)
```

### 8.3 应用场景

1. **敏感操作审批**：删除、更新重要数据
2. **人工验证**：AI 识别结果需人工确认
3. **异常处理**：遇到不确定情况暂停

---

## 9. 子图 (Subgraph)

### 9.1 嵌套图

```python
from langgraph.graph import StateGraph, SUBGRAPH

# 定义子图
subgraph = StateGraph(InputState, OutputState)
subgraph.add_node("sub_node", sub_node_func)
subgraph.add_edge(START, "sub_node")
subgraph.add_edge("sub_node", END)
child_graph = subgraph.compile()

# 在父图中嵌入子图
parent = StateGraph(ParentState)
parent.add_node("child", child_graph)  # 子图作为节点
```

### 9.2 状态映射

```python
# 子图输入/输出与父图状态的映射
parent.add_node(
    "child",
    child_graph,
    # 输入映射：父图状态 → 子图输入
    input=lambda state: {"query": state["user_query"]},
    # 输出映射：子图输出 → 父图状态
    output=lambda child_output: {"result": child_output["answer"]}
)
```

---

## 10. 底层 Pregel API

### 10.1 直接使用 Pregel

```python
from langgraph.channels import EphemeralValue
from langgraph.pregel import Pregel, NodeBuilder

# 定义节点
node1 = (
    NodeBuilder()
    .subscribe_only("a")          # 订阅 channel "a"
    .do(lambda x: x + x)        # 处理函数
    .write_to("b")               # 写入 channel "b"
)

node2 = (
    NodeBuilder()
    .subscribe_only("b")
    .do(lambda x: print(f"Received: {x}"))
)

# 创建 Pregel 实例
app = Pregel(
    nodes={"node1": node1, "node2": node2},
    channels={
        "a": EphemeralValue(str),
        "b": EphemeralValue(str),
    },
    input_channels=["a"],
    output_channels=["b"],
)

# 调用
result = app.invoke({"a": "hello"})
# node1: "hello" → "hellohello"
# node2: "hellohello" → prints
```

### 10.2 Channel 类型选择

```python
from langgraph.channels import (
    LastValue,           # 默认，普通字段
    Topic,               # 累积消息
    BinaryOperatorAggregate,  # 操作合并
    EphemeralValue,      # 临时值
)

# 累加器
channels["counter"] = BinaryOperatorAggregate(int, lambda a, b: a + b)
```

---

## 11. 流式输出

### 11.1 消息流式

```python
# 使用 astream_events 获取 token 级流
async for event in app.astream_events(
    {"messages": [{"role": "user", "content": "..."}]},
    config
):
    if event["event"] == "on_chat_model_stream":
        token = event["data"]["chunk"].content
        print(token, end="", flush=True)
```

### 11.2 节点输出流式

```python
async for chunk in app.astream(
    {"messages": [...]},
    stream_mode="updates"  # 或 "values", "debug"
):
    print(chunk)
```

---

## 12. 多 Agent 架构模式

### 12.1 Supervisor 模式

```
用户输入
    │
    ▼
┌─────────────┐
│ supervisor  │  ← 一个 supervisor 决定调用哪个 Agent
└─────────────┘
    │
    ├───▶ [Research Agent]
    │
    ├───▶ [Write Agent]
    │
    └───▶ [Review Agent]
```

```python
def supervisor_node(state):
    """supervisor 决定下一步"""
    action = llm.invoke([
        *state["messages"],
        SystemMessage("决定下一步：research / write / review / finish")
    ])
    return {"next": action}

def should_continue(state):
    return state.get("next", "finish")
```

### 12.2 网络模式（对等通信）

```python
# 每个 Agent 可调用其他 Agent
def agent_a(state):
    result = llm.invoke(state["messages"])
    return {"messages": [result]}

def agent_b(state):
    result = llm.invoke(state["messages"])
    return {"messages": [result]}

# A 可以决定调用 B
def routing(state):
    if should_delegate_to_b(state):
        return "agent_b"
    return "finish"
```

---

## 13. 与 LangChain 集成

### 13.1 使用 LangChain 工具

```python
from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode

@tool
def get_weather(city: str) -> str:
    """获取城市天气"""
    return f"{city} 今天晴天"

tools = [get_weather]
tool_node = ToolNode(tools)
```

### 13.2 使用 LangChain 提示词

```python
from langchain.prompts import ChatPromptTemplate

prompt = ChatPromptTemplate.from_messages([
    ("system", "你是一个有用的助手。"),
    ("human", "{query}")
])

llm = ChatOpenAI(model="gpt-4o")
chain = prompt | llm

def agent(state):
    response = chain.invoke({"query": state["query"]})
    return {"response": response}
```

---

## 14. 核心设计模式

### 14.1 模式一：状态即一切

```
传统 Chain: query → prompt → LLM → response

LangGraph:  State
               │
               │ 更新
               ▼
           nodes → edges → State
               ▲
               │
               └──────────┘
                   循环
```

### 14.2 模式二：Reducer 处理并发

```python
# 多个节点可并发写入同一字段
# 通过 reducer 合并，避免冲突

messages: Annotated[List, add_messages]  # 列表总是追加
counter: Annotated[int, max]             # 取最大值
```

### 14.3 模式三：Channel 作为状态槽

```python
# 每个 state 字段对应一个 channel
# channel 有类型（LastValue / Topic / etc）

class AgentState(TypedDict):
    query: str          # → LastValue[str]
    messages: List     # → Topic (累积所有消息)
```

---

## 15. 优缺点分析

### 15.1 优点

1. **底层灵活**：四个原语构建任意复杂 Agent
2. **状态显式**：debugging 直观，可视化每步状态
3. **生产级特性**：checkpointing、HITL、streaming、并行
4. **与 LangChain 生态完整集成**

### 15.2 缺点

1. **学习曲线陡**：需要理解 BSP 模型、reducer、channel
2. **代码量大于 Chain**：简单线性流程显得繁琐
3. **Python 优先**：JS 版功能略滞后

---

## 16. 推荐阅读与资源

### 官方资料
- [LangGraph Documentation](https://docs.langchain.com/oss/python/langgraph/)
- [Pregel API Reference](https://docs.langchain.com/oss/python/langgraph/pregel/)
- [GitHub - langchain-ai/langgraph](https://github.com/langchain-ai/langgraph)

### 深度博客
- **Max Pilzys** - *LangGraph Transactions—Pregel, Message Passing and Super-steps*
- **Christoph Bussler** - *LangGraph Execution Semantics*
- **Pur4v** - *The Evolution of Graph Processing: From Pregel to LangGraph*

### 学术论文
- **Pregel** - Malewicz et al., SIGMOD 2010

---

## 17. 小结

LangGraph 是 **LLM Agent 时代的状态机编排框架**，其设计精髓：

1. **基于 Pregel/BSP**：超级步模型天然支持循环和 checkpoint
2. **State + Reducer**：显式状态管理，多节点并发安全
3. **Channel 抽象**：不同的 channel 类型 = 不同的语义
4. **interrupt() + checkpointer**：Human-in-the-loop + 断点恢复
5. **与 LangChain 生态集成**：工具、提示词、部署一体化

**适用场景**：复杂 Agent、多步骤工作流、需要人工介入的流程
**不适合**：简单线性任务、快速原型

---

## 附录：与 LangChain Chain 的对比

| 场景 | Chain | LangGraph |
|------|-------|-----------|
| 简单问答 | ✅ | ✅ |
| 工具调用 | ✅ | ✅ |
| 多步骤推理 | ⚠️ | ✅ |
| 循环直到满足条件 | ❌ | ✅ |
| 错误恢复 | ❌ | ✅ |
| 人工介入 | ❌ | ✅ |
| 多 Agent 协作 | ⚠️ | ✅ |
