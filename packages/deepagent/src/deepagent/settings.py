"""运行时配置 —— 全部来自环境变量,与 dockers/aegra 的 .env 对齐。"""
from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    # ---- LiteLLM 网关(OpenAI 兼容);见 dockers/aegra 的 .env ----
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://aigateway-sandbox.mspbots.ai/v1")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    # ---- 模型(名字必须是网关已配置的:gemini 系列)----
    default_model: str = os.getenv("DEFAULT_MODEL", "gemini-3-flash-preview")    # 实时语音:快
    analysis_model: str = os.getenv("ANALYSIS_MODEL", "gemini-3-pro-preview")    # 长任务:强

    # ---- skill 来源 ----
    # store      = 存 PostgreSQL Store,写库即下个 run 生效 = 热更新(推荐,可按租户)
    # filesystem = 读本地 skills/ 目录(改文件需重启刷元数据),便于快速验证
    skill_backend: str = os.getenv("SKILL_BACKEND", "store")
    skills_dir: str = os.getenv("SKILLS_DIR", "/app/deepagent/skills")


settings = Settings()
