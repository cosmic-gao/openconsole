"""deepagents backend —— 多租户感知的存储路由。

约定(虚拟路径 → 实际存储):
  - 默认       StateBackend     : agent 的虚拟文件系统,线程级(随会话生灭)。
  - /memories/ StoreBackend     : 长期记忆,按 (tenant,user) namespace 持久化。
  - /skills/   StoreBackend     : skill 能力包,按 tenant namespace 存放;
                                  往 Store 写 SKILL.md 即下个 run 生效 = 热更新。

Store 由 Aegra 平台注入(PostgreSQL),所以 create_deep_agent 不传 store=。
SKILL_BACKEND=filesystem 时,/skills/ 改读本地目录(改文件需重启刷元数据),便于快速验证。
"""
from __future__ import annotations

from deepagents.backends import (
    CompositeBackend,
    FilesystemBackend,
    StateBackend,
    StoreBackend,
)

from deepagent.settings import settings
from deepagent.tenancy import memory_namespace, skill_namespace


def build_backend():
    """构造主/分析图共用的多租户 backend。"""
    if settings.skill_backend == "filesystem":
        skills_route = FilesystemBackend(root_dir=settings.skills_dir, virtual_mode=True)
    else:
        skills_route = StoreBackend(namespace=skill_namespace)   # 热更新 + 按租户

    return CompositeBackend(
        default=StateBackend(),
        routes={
            "/skills/": skills_route,
            "/memories/": StoreBackend(namespace=memory_namespace),
        },
    )
