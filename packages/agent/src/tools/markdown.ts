import TurndownService from "turndown";
import { z } from "zod";

import { Tool } from "../tool";
import { ok } from "../types";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * `html_to_markdown` —— 把一段 HTML 转成干净的 Markdown(turndown,本地、无网络)。
 * 当你已经拿到原始 HTML(例如 http_request 的响应)、想要可读 Markdown 时使用。
 */
export const toMarkdownTool = Tool.define({
  name: "html_to_markdown",
  description:
    "Convert an HTML string to clean Markdown. Use when you already have raw HTML (e.g. from http_request) and want readable Markdown.",
  schema: z.object({
    html: z.string().describe("The HTML to convert."),
  }),
  execute: ({ html }) => ok(turndown.turndown(html)),
});
