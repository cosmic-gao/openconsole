import { search as ddgSearch, SafeSearchType } from "duck-duck-scrape";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../../types";

/** 一条网页搜索结果。 */
export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

/**
 * 可插拔的网页搜索后端。默认使用 DuckDuckGo（无需 API key）；
 * 可通过 {@link setSearchProvider} 替换为 Tavily、SearxNG、Brave 等。
 */
export interface SearchProvider {
  search(query: string, maxResults: number): Promise<SearchHit[]>;
}

/** 默认提供方：经由 `duck-duck-scrape` 调用 DuckDuckGo（开源、免 key）。 */
export const duckDuckGoProvider: SearchProvider = {
  async search(query, maxResults) {
    // ddgSearch 不支持 abort，用 Promise.race 加 15s 超时，避免后端卡死时无限等待
    const res = await Promise.race([
      ddgSearch(query, { safeSearch: SafeSearchType.MODERATE }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("web search timed out")), 15000),
      ),
    ]);
    if (res.noResults) return [];
    // 仅取前 maxResults 条，并把第三方返回字段映射为统一的 SearchHit 结构
    return res.results.slice(0, maxResults).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
    }));
  },
};

// 模块级单例：当前生效的搜索后端，可被 setSearchProvider 替换
let provider: SearchProvider = duckDuckGoProvider;

/** 替换 {@link searchTool} 所使用的网页搜索后端。 */
export function setSearchProvider(next: SearchProvider): void {
  provider = next;
}

/** `web_search` —— 网页搜索。移植自 magic 的 `web_search`。 */
export const searchTool = Tool.define({
  name: "web_search",
  description:
    "Search the web and return a ranked list of titles, URLs, and snippets. Use to find current information or to discover sources to read.",
  schema: z.object({
    query: z.string().describe("The search query."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum results to return (default 5)."),
  }),
  execute: async ({ query, maxResults }): Promise<ToolResult> => {
    try {
      const hits = await provider.search(query, maxResults ?? 5);
      if (hits.length === 0)
        return ok(`No results for "${query}".`, { results: [] });
      const text = hits
        .map((h, i) => `${i + 1}. ${h.title}\n   ${h.url}\n   ${h.snippet}`)
        .join("\n");
      return ok(text, { results: hits });
    } catch (e) {
      return err(
        `Search failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
