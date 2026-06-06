import { SafeSearchType, searchImages } from "duck-duck-scrape";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../types";

/** `image_search` —— 图片搜索(DuckDuckGo,开源、免 key)。移植自 magic 的 `image_search`。 */
export const imageSearchTool = Tool.define({
  name: "image_search",
  description:
    "Search the web for images and return titles, image URLs, and source page URLs. Use to find pictures or visual references.",
  schema: z.object({
    query: z.string().describe("The image search query."),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum results to return (default 8)."),
  }),
  execute: async ({ query, maxResults }): Promise<ToolResult> => {
    try {
      const res = await searchImages(query, {
        safeSearch: SafeSearchType.MODERATE,
      });
      if (res.noResults || res.results.length === 0) {
        return ok(`No images for "${query}".`, { results: [] });
      }
      const hits = res.results.slice(0, maxResults ?? 8).map((r) => ({
        title: r.title,
        image: r.image,
        source: r.url,
      }));
      const text = hits
        .map((h, i) => `${i + 1}. ${h.title}\n   ${h.image}`)
        .join("\n");
      return ok(text, { results: hits });
    } catch (e) {
      return err(
        `Image search failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
