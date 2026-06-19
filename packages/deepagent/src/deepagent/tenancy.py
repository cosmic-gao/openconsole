"""多租户身份提取与命名空间。

deepagents 的 backend 在运行时会把一个 runtime 对象传给 namespace 回调,
其中可用 `runtime.server_info.user.identity` 拿到 Aegra auth handler 注入的用户身份。
租户维度(tenant)按你的 auth 约定从 user 上取;下面给了常见来源 + 兜底。

隔离策略(与架构图一致):
  - 长期记忆 memories:按 (tenant, user) 隔离 —— 用户私有。
  - skill:按 tenant 隔离 —— 同租户共享、可热更新。
"""
from __future__ import annotations

from typing import Any


def _dig(obj: Any, path: str, default: Any = None) -> Any:
    """安全地按 'a.b.c' 取属性,任一层为空即返回 default。"""
    cur = obj
    for part in path.split("."):
        if cur is None:
            return default
        cur = getattr(cur, part, None)
    return cur if cur is not None else default


def extract_identity(runtime: Any) -> tuple[str, str]:
    """从运行时提取 (tenant_id, user_id)。

    取不到时给安全兜底,保证 namespace 始终有值、不同租户/用户不串。
    若你的 auth handler 把租户放在别的字段,改这里即可。
    """
    user = _dig(runtime, "server_info.user")
    identity = _dig(user, "identity", "") or ""

    tenant = (
        _dig(user, "tenant_id")                                   # 1) 显式 tenant 字段
        or _dig(user, "org_id")                                   # 2) 或 org 字段
        or (identity.split(":", 1)[0] if ":" in identity else None)  # 3) 或 "tenant:user" 前缀
        or "public"                                               # 4) 兜底
    )
    user_id = identity or "anonymous"
    return str(tenant), str(user_id)


def memory_namespace(runtime: Any) -> tuple[str, ...]:
    """长期记忆 Store namespace:按 (tenant, user) 隔离。"""
    tenant, user = extract_identity(runtime)
    return (tenant, user, "memories")


def skill_namespace(runtime: Any) -> tuple[str, ...]:
    """skill Store namespace:按 tenant 隔离(同租户共享,可热更新)。"""
    tenant, _ = extract_identity(runtime)
    return (tenant, "skills")
