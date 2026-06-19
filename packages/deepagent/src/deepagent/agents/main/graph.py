"""graph "main" —— 实时语音对话的"大脑"。

由 aegra.json 注册:  "main": "./src/deepagent/agents/main/graph.py:make_graph"

要点(与 dockers/aegra/Agent 完整架构（含实时语音）.svg 一致):
  - 只收发文本;音频/打断在 Aegra 外的语音网关。
  - 流式必开,逐 token 出字给 TTS。
  - 不传 checkpointer / store —— Aegra 平台注入(PostgreSQL)。
  - 多租户隔离在 backend 运行时完成(记忆按 tenant,user;skill 按 tenant)。
  - skill 走 /skills/(默认 Store,写库即热更新)。
"""
from __future__ import annotations

from deepagents import create_deep_agent

from deepagent.agents.main.prompts import VOICE_SYSTEM_PROMPT
from deepagent.backends import build_backend
from deepagent.model import build_model
from deepagent.settings import settings
from deepagent.tools import DEFAULT_TOOLS


def make_graph():
    """0 参工厂:启动时构造一次,所有租户共享同一 graph 实例;
    数据隔离由 backend 在运行时按 tenant/user 完成(见 backends.py / tenancy.py)。

    如需"按租户在构造时裁剪工具/拓扑",可改成 make_graph(runtime) 形态并从
    runtime 读身份(参考 Aegra examples/factory/graph.py 的 ServerRuntime 用法)。
    """
    return create_deep_agent(
        model=build_model(settings.default_model, temperature=0.3, streaming=True),
        tools=DEFAULT_TOOLS,
        system_prompt=VOICE_SYSTEM_PROMPT,
        skills=["/skills/"],          # 从 backend 的 /skills/ 路由读(默认 Store,按租户热更新)
        backend=build_backend(),
        # 不传 checkpointer / store:Aegra 注入。
    )
