"""graph "main" —— 实时语音对话的"大脑"。

由 aegra.json 注册:  "main": "./src/deepagent/graphs/main_graph.py:make_graph"

要点(与 dockers/aegra/Agent 完整架构（含实时语音）.svg 一致):
  - 只收发文本;音频/打断在 Aegra 外的语音网关。
  - 流式必开,逐 token 出字给 TTS。
  - 不传 checkpointer / store —— Aegra 平台注入(PostgreSQL)。
  - 多租户隔离在 backend 运行时完成(记忆按 tenant,user;skill 按 tenant)。
  - skill 走 /skills/(默认 Store,写库即热更新)。
"""
from __future__ import annotations

from deepagents import create_deep_agent

from deepagent.backends import build_backend
from deepagent.model import build_model
from deepagent.settings import settings
from deepagent.tools import DEFAULT_TOOLS

# 复用 apps/chat/opencode.json 里 voice agent 的话术风格(电话语音、TTS 友好)。
VOICE_SYSTEM_PROMPT = """你是电话客服,你说的话会被实时合成为语音念给用户听。
- 口语化短句:一次只说 1-2 句,首句尽量短。
- 不要输出 markdown、列表、网址或任何符号排版,只说能被自然念出来的话。
- 一次只问一个问题。
- 调用工具前,先说一句完整话术(带句号),例如「好的,我帮您查一下。」,再调用工具。
- 被用户打断后,顺着用户的新话题走,不要纠缠上一句。
当任务匹配某个 skill 的描述时,读取该 skill 的指示并据此处理业务。"""


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
