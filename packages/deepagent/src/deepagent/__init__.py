"""Aegra 上的 deepagents 图包。

对外暴露两个 graph 工厂(供 ../../aegra.json 的 graphs 字段按 path:variable 加载):
  - graphs.main_graph:make_graph      -> graph "main"   实时语音对话的"大脑"
  - graphs.analysis_graph:make_graph  -> graph "analysis" 异步长任务

设计要点(与 dockers/aegra/Agent 完整架构（含实时语音）.svg 一致):
  - 图只收发文本;音频(STT/TTS/打断)在 Aegra 外的语音网关,不在这里。
  - 不传 checkpointer / store —— 由 Aegra 平台注入(PostgreSQL)。
  - 多租户隔离在 backend 层运行时完成:记忆按 (tenant,user)、skill 按 tenant。
  - 模型统一走 LiteLLM 网关(OpenAI 兼容)。
"""
