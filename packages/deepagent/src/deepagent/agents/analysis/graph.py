"""graph "analysis" —— 异步长任务(检索/汇总/多步推理/报告)。

由 aegra.json 注册:  "analysis": "./src/deepagent/agents/analysis/graph.py:make_graph"

经 Aegra 的 WorkerExecutor 异步执行 + 租约崩溃恢复;不面向实时语音,可输出完整结果。
用 sub-agent 在隔离上下文里做重活,只把结论回传主流程(避免污染主上下文)。
"""
from __future__ import annotations

from deepagents import create_deep_agent

from deepagent.agents.analysis.prompts import ANALYSIS_SYSTEM_PROMPT, RESEARCH_SUBAGENT
from deepagent.backends import build_backend
from deepagent.model import build_model
from deepagent.settings import settings
from deepagent.tools import DEFAULT_TOOLS


def make_graph():
    """0 参工厂;隔离同样由 backend 运行时完成。不传 checkpointer / store(平台注入)。"""
    return create_deep_agent(
        model=build_model(settings.analysis_model, temperature=0.2, streaming=True),
        tools=DEFAULT_TOOLS,
        system_prompt=ANALYSIS_SYSTEM_PROMPT,
        subagents=[RESEARCH_SUBAGENT],
        skills=["/skills/"],
        backend=build_backend(),
    )
