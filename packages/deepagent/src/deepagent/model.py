"""走 LiteLLM 网关的对话模型构造(LangChain 1.x)。

用 LangChain 1.x 推荐的统一入口 init_chat_model 初始化模型;网关是 OpenAI 兼容协议,
固定 model_provider="openai" + base_url 指向网关。base_url / key / model 全来自环境(见 settings),
不在图里写死任何厂商凭据。
"""
from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from deepagent.settings import settings


def build_model(
    model_name: str | None = None,
    *,
    temperature: float = 0.3,
    streaming: bool = True,
) -> BaseChatModel:
    """构造走 LiteLLM 网关的 chat model(LangChain 1.x init_chat_model)。

    - model_name 必须是网关已配置的名字(gemini-3-flash-preview 等),默认取 settings.default_model。
    - 走 OpenAI 兼容网关:model_provider 固定 "openai",base_url / api_key 经 kwargs 透传给底层实现。
    - streaming 默认开:语音场景要逐 token 出字喂给 TTS。
    """
    return init_chat_model(
        model=model_name or settings.default_model,
        model_provider="openai",
        base_url=settings.openai_base_url,
        api_key=settings.openai_api_key,
        temperature=temperature,
        streaming=streaming,
    )
