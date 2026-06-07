import { load } from "cheerio";
import TurndownService from "turndown";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../../types";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/** 抓取单个页面，并将其主要内容转换为 Markdown。 */
async function pageToMarkdown(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; @openconsole/agent)" },
    // 单页抓取设 15s 超时，避免慢站点拖垮整次工具调用
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return `# ${url}\n\n(failed: HTTP ${res.status})`;
  const html = await res.text();
  const $ = load(html);
  // 先剔除脚本/样式等非正文节点，避免它们污染转换结果
  $("script, style, noscript, svg, iframe").remove();
  // 按 main -> article -> body 的优先级提取正文容器，都没有则退回整段 html
  const main =
    $("main").html() ?? $("article").html() ?? $("body").html() ?? html;
  return `# ${url}\n\n${turndown.turndown(main).trim()}`;
}

/** `read_webpages_as_markdown` —— 抓取页面并转为 Markdown。移植自 magic 的同名工具。 */
export const fetchTool = Tool.define({
  name: "read_webpages_as_markdown",
  description:
    "Fetch one or more web pages and return their main content as Markdown. Use after web_search to read the most relevant sources in full.",
  schema: z.object({
    urls: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe("Page URLs to fetch and convert (up to 20)."),
  }),
  execute: async ({ urls }): Promise<ToolResult> => {
    const parts: string[] = [];
    for (const url of urls) {
      try {
        parts.push(await pageToMarkdown(url));
      } catch (e) {
        parts.push(
          `# ${url}\n\n(error: ${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }
    return parts.length > 0
      ? ok(parts.join("\n\n---\n\n"))
      : err("No pages fetched.");
  },
});
