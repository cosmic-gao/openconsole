# packages/deepagent

Aegra 上的 deepagents 图实现:`main`(实时语音对话的"大脑")+ `analysis`(异步长任务)。
配合 `dockers/aegra` 自托管的 Aegra(LangGraph Platform 开源替代)运行。整体架构见
[../../dockers/aegra/Agent 完整架构（含实时语音）.svg](../../dockers/aegra/Agent%20完整架构（含实时语音）.svg)。

> 这是仓库里唯一的 Python 子项目(其余 packages 为 TS)。它被 Aegra 的 Python runtime
> 经 `aegra.json` 的 `graphs` 字段加载,**不是独立服务**。

## 它做了什么(与设计一致)

- **只收发文本**:音频 / STT / TTS / 打断都在 Aegra 外的语音网关,不在这里。
- **main graph**:电话语音客服风格(口语短句、TTS 友好、被打断顺着走),复用 `apps/chat/opencode.json` 的 voice 话术。
- **analysis graph**:异步长任务 + sub-agent 隔离上下文。
- **不传 checkpointer / store**:由 Aegra 平台注入(PostgreSQL)。
- **模型走 LiteLLM 网关**(OpenAI 兼容):`OPENAI_BASE_URL` / `OPENAI_API_KEY` / `DEFAULT_MODEL`。
- **多租户隔离**(运行时,在 backend 层):记忆按 `(tenant, user)`、skill 按 `tenant` 分 Store namespace。
- **skill 热更新**:skill 走 `/skills/`(默认 `StoreBackend`),往 Store 写 `SKILL.md` 即下个 run 生效,不重启/不改代码。

## 目录

```
packages/deepagent/
├── aegra.json                          # 注册 graphs: main / analysis(供 Aegra 加载)
├── pyproject.toml / requirements.txt / .env.example
├── skills/customer-service/SKILL.md    # 示例 skill(种子 / 快速验证用)
└── src/deepagent/
    ├── settings.py                     # 共享:环境变量(网关 / 模型 / skill 来源)
    ├── model.py                        # 共享:走 LiteLLM 网关(init_chat_model, LangChain 1.x)
    ├── tenancy.py                      # 共享:从 runtime 取 (tenant, user) → namespace
    ├── backends.py                     # 共享:CompositeBackend(skill / 记忆按租户隔离 + 热更新)
    ├── tools.py                        # 共享:示例业务工具(agent 私有工具可放各自子包)
    └── agents/                         # 每个 agent 一个子包(对齐 deepagents/deep_research)
        ├── main/      graph.py + prompts.py    # graph "main":实时语音大脑
        └── analysis/  graph.py + prompts.py    # graph "analysis":异步长任务 + sub-agent
```

## 接入 Aegra(已在 aegra.sh 打通)

`dockers/aegra/aegra.sh` 已改好:把本目录挂到容器 `/app/deepagent`、设 `AEGRA_CONFIG=/app/deepagent/aegra.json`、
启动前 `pip install -r requirements.txt`。直接:

```bash
cd dockers/aegra
LITELLM_API_KEY=sk-你的key bash aegra.sh up
```

脚本默认从同仓库相对路径找 `packages/deepagent`;若部署机上仓库不在该相对位置,显式指定:

```bash
DEEPAGENT_DIR=/abs/path/to/openconsole/packages/deepagent LITELLM_API_KEY=sk-xxx bash aegra.sh up
```

起来后 `http://<ip>:2026/docs` 应能看到 `main` / `analysis` 两个图对应的 assistant。

## 外部调用

```python
from langgraph_sdk import get_client
client = get_client(url="http://<ip>:2026")
thread = await client.threads.create()
async for chunk in client.runs.stream(
        thread["thread_id"], "main",
        input={"messages": [{"role": "user", "content": "我要查订单"}]},
        stream_mode=["messages"]):
    print(chunk.data)   # 逐 token → 语音网关喂 TTS
```

多租户:每租户在线建一个 assistant(`client.assistants.create(graph_id="main", config=..., metadata={"tenant_id": ...})`),
每个用户开独立 thread。隔离由 backend 按 auth 注入的身份在运行时完成。

## skill 热更新

- 默认 `SKILL_BACKEND=store`:skill 存 PostgreSQL Store(按租户 namespace)。改 skill = 往 Store 写,**下个 run 生效**,不重启 / 不改代码。
- 初始化:把 `skills/` 下的 `SKILL.md` 写入对应租户的 Store namespace `(tenant, "skills")`(用 Aegra 的 `/store/items` API 或一段 seed 脚本)。
- 快速验证可改用本地文件:`SKILL_BACKEND=filesystem`(读 `skills/`,改文件需重启刷元数据)。

## 按你的版本核对(重要)

代码基于 deepagents / aegra 的公开 API,以下随版本可能微调,接入时核对一次:

- `create_deep_agent` 参数名(本代码用 `system_prompt` / `skills` / `backend`)与 backend 导入路径(`from deepagents.backends import ...`)。
- `agents/analysis/prompts.py` 里 sub-agent 字段用 `name` / `description` / `system_prompt` / `tools`(+ 可选 `model`),已对齐当前 deepagents;旧版本曾用 `prompt`。
- 多租户身份字段:`tenancy.py` 假设 `runtime.server_info.user.identity`,租户取 `user.tenant_id` / `org_id` / identity 前缀 —— 按你 Aegra auth handler 实际注入的字段调整。
- 若要"构造时按租户裁剪工具/拓扑",把 `make_graph()` 改成 `make_graph(runtime)` 并参考 Aegra `examples/factory/graph.py` 的 `ServerRuntime` 用法。
