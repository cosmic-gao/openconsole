"""graph "analysis" —— 异步长任务(检索/汇总/多步推理/报告)。

由 aegra.json 注册:  "analysis": "./src/deepagent/graphs/analysis_graph.py:make_graph"

经 Aegra 的 WorkerExecutor 异步执行 + 租约崩溃恢复;不面向实时语音,可输出完整结果。
用 sub-agent 在隔离上下文里做重活,只把结论回传主流程(避免污染主上下文)。
"""
from __future__ import annotations

from deepagents import create_deep_agent

from deepagent.backends import build_backend
from deepagent.model import build_model
from deepagent.settings import settings
from deepagent.tools import DEFAULT_TOOLS

ANALYSIS_SYSTEM_PROMPT = """你是后台分析 agent,处理耗时的深度任务(检索、汇总、多步推理、报告生成)。
- 不面向实时语音,可以输出结构化的完整结果。
- 用 planning(待办)拆解长任务;把需要大量中间步骤的子任务交给 sub-agent 在隔离上下文完成,只取回结论。
- 充分使用 skills 中的领域流程。"""

# sub-agent 配置(dict 形态)。注意:字段名以你装的 deepagents 版本的 SubAgent 定义为准
# (常见为 name / description / prompt / tools;部分版本用 system_prompt)。
RESEARCH_SUBAGENT = {
    "name": "researcher",
    "description": "在隔离上下文中做资料检索与汇总,只返回精炼结论。适合中间步骤多、主流程只关心结果的子任务。",
    "prompt": "你是检索调研子 agent。完成给定的检索/汇总任务,只返回精炼结论,不要返回中间过程。",
    "tools": [],  # 按需补检索工具
}


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
