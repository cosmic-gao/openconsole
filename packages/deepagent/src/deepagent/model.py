"""走 LiteLLM 网关的对话模型构造。

网关是 OpenAI 兼容协议(/v1),所以直接用 ChatOpenAI 指向网关 base_url 即可;
不在图里写死任何厂商 key —— base_url / key / model 全来自环境(见 settings)。
"""
from __future__ import annotations

from langchain_openai import ChatOpenAI

from deepagent.settings import settings


def build_model(
    model_name: str | None = None,
    *,
    temperature: float = 0.3,
    streaming: bool = True,
) -> ChatOpenAI:
    """构造一个走 LiteLLM 网关的 chat model。

    - model_name 必须是网关已配置的名字(gemini-3-flash-preview 等),默认取 settings.default_model。
    - streaming 默认开:语音场景要逐 token 出字喂给 TTS。
    """
    return ChatOpenAI(
        model=model_name or settings.default_model,
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        temperature=temperature,
        streaming=streaming,
    )
