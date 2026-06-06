import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

/**
 * 模型解析与注册。把 magic 的 `LLMFactory` 模型别名概念映射到 DeepAgent 的 model 选项，
 * 同时保持与具体 provider 无关、优先适配开源方案。
 *
 * 解析结果要么是 `"provider:model"` 字符串（由 DeepAgent/LangChain 的 `initChatModel`
 * 转成 chat model），要么是一个已配置好的 chat-model 实例。
 */
export type ModelRef = string | BaseChatModel;

/** magic 风格的内置别名 -> 提供 `"provider:model"` id 的环境变量名（注册表未命中时的回退）。 */
const ALIASES: Record<string, string> = {
  main_llm: "AGENT_MAIN_MODEL",
  coder_llm: "AGENT_CODER_MODEL",
};

/**
 * 本地 OpenAI 兼容服务分支：当设置了 baseURL 且目标是 `openai:` 模型时，
 * 必须返回实例而非字符串——因为要把自定义 baseURL 和占位 key 注入 ChatOpenAI；
 * 仅靠 "openai:model" 字符串无法携带这些配置，initChatModel 会去连官方端点并要求真实 key。
 * 使本地开源服务（Ollama、vLLM、LM Studio）无需真实 key 即可工作。
 */
function maybeLocalInstance(spec: string): ModelRef {
  const baseURL =
    process.env["OPENAI_BASE_URL"] ?? process.env["AGENT_BASE_URL"];
  if (baseURL && spec.startsWith("openai:")) {
    return new ChatOpenAI({
      model: spec.slice("openai:".length), // 去掉 "openai:" 前缀，留下纯模型名
      apiKey: process.env["OPENAI_API_KEY"] ?? "sk-noauth", // 本地服务通常不校验，给个占位值
      configuration: { baseURL },
    });
  }
  return spec;
}

/**
 * 模型注册表。与 {@link ToolRegistry} 对称：把所有模型（不同 provider、不同别名）
 * 集中注册、统一取用。注册的值可以是 `"provider:model"` 字符串，或一个已配置好的
 * chat-model 实例（例如自定义了温度、baseURL 的 `ChatOpenAI`/`ChatAnthropic`）。
 */
export class ModelRegistry {
  private readonly models = new Map<string, ModelRef>();

  /** 注册一个别名 -> 模型（`"provider:model"` 字符串或 chat-model 实例）。 */
  register(alias: string, model: ModelRef): this {
    this.models.set(alias, model);
    return this;
  }

  /** 一次注册多个别名。 */
  registerAll(entries: Record<string, ModelRef>): this {
    for (const [alias, model] of Object.entries(entries)) {
      this.register(alias, model);
    }
    return this;
  }

  /** 是否已注册该别名。 */
  has(alias: string): boolean {
    return this.models.has(alias);
  }

  /**
   * 将模型别名/id 解析为 {@link ModelRef}，顺序：
   * 1. 注册表命中：实例直接返回；字符串再过一遍本地 baseURL 包装。
   * 2. 内置别名 -> 环境变量取值（如 `AGENT_MAIN_MODEL`）。
   * 3. 本身已是 `"provider:model"` 形式则原样使用。
   * 4. 回退到 `AGENT_MODEL`。
   * 当最终无法解析出 `provider:model` 形式时直接抛错，而不是去猜测。
   */
  resolve(idOrAlias: string): ModelRef {
    // 1. 注册表优先（统一注册的入口）
    const registered = this.models.get(idOrAlias);
    if (registered !== undefined) {
      return typeof registered === "string"
        ? maybeLocalInstance(registered)
        : registered;
    }

    // 2/3/4. 回退到内置别名 / 环境变量 / provider:model 字符串
    const envVar = ALIASES[idOrAlias];
    const fromAlias = envVar ? process.env[envVar] : undefined;
    // 别名经环境变量解析出的值必须是 "provider:model" 形式；漏配 provider 前缀时直接抛错而非静默回退
    if (fromAlias !== undefined && !fromAlias.includes(":")) {
      throw new Error(
        `Alias "${idOrAlias}" resolved via ${envVar} to "${fromAlias}", which is not a "provider:model" id such as "openai:gpt-4o-mini".`,
      );
    }
    const candidate = fromAlias ?? idOrAlias;
    const spec = candidate.includes(":")
      ? candidate
      : (process.env["AGENT_MODEL"] ?? candidate);

    if (!spec.includes(":")) {
      throw new Error(
        `Cannot resolve model "${idOrAlias}". Register it via models.register(...), or set AGENT_MODEL ` +
          `(or ${envVar ?? "an alias env var"}) to a "provider:model" id such as "openai:gpt-4o-mini".`,
      );
    }
    return maybeLocalInstance(spec);
  }
}

/** 进程级共享的模型注册表。 */
export const models = new ModelRegistry();
