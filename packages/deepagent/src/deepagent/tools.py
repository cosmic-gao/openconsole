"""示例业务工具 —— 替换成你真实的后端调用即可。

注意:工具可能在用户打断(barge-in → run cancel)时被中断,
关键写操作请做成幂等 / 可重试,保证被 cancel 后重发安全(见架构设计)。
"""
from __future__ import annotations

from langchain_core.tools import tool


@tool
def lookup_order(order_id: str) -> str:
    """根据订单号查询订单状态。order_id: 用户报的订单号。"""
    # TODO: 接你的订单系统;此处返回示例数据。
    return f"订单 {order_id}:已发货,预计明天送达。"


@tool
def transfer_to_human(reason: str) -> str:
    """转接人工坐席。用户明确要求人工、情绪激动或问题超出能力范围时调用。reason: 转接原因。"""
    # TODO: 接你的工单 / 转接系统(应幂等)。
    return "已为你转接人工坐席,请稍候。"


DEFAULT_TOOLS = [lookup_order, transfer_to_human]
