import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../../types";

const MAX_BODY = 100_000;

/**
 * `http_request` —— 通用 HTTP 请求(用原生 fetch,开源、免 key)。
 *
 * ⚠️ 请求从宿主机发出。面向公网 API;不要用它访问内网/私有地址(SSRF 风险)。
 * 需要更强的隔离时,在受限网络环境运行,或通过受控的 MCP server 代理外呼。
 */
export const httpRequestTool = Tool.define({
  name: "http_request",
  description:
    "Make an HTTP request to a URL and return the status and response body. Supports GET/POST/PUT/PATCH/DELETE with optional headers and a body. Use it to call public web APIs. Do not use it to reach internal or private network addresses.",
  schema: z.object({
    url: z.string().describe("The absolute URL to request."),
    method: z
      .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
      .optional()
      .describe("HTTP method (default GET)."),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .describe("Optional request headers."),
    body: z
      .string()
      .optional()
      .describe("Optional request body (for POST/PUT/PATCH)."),
  }),
  execute: async ({ url, method, headers, body }): Promise<ToolResult> => {
    try {
      const init: RequestInit = {
        method: method ?? "GET",
        signal: AbortSignal.timeout(15000),
      };
      if (headers) init.headers = headers;
      if (body !== undefined) init.body = body;
      const res = await fetch(url, init);
      const text = await res.text();
      const shown =
        text.length > MAX_BODY
          ? `${text.slice(0, MAX_BODY)}\n…(truncated)`
          : text;
      return ok(`HTTP ${res.status} ${res.statusText}\n\n${shown}`, {
        status: res.status,
        body: text,
      });
    } catch (e) {
      return err(
        `Request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
