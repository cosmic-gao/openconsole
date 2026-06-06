import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";

import { Tool } from "../tool";
import { err, ok, type ToolResult } from "../types";

/**
 * `download` —— 把一个 URL 下载并保存到本地工作目录。移植自 magic 的 `download_from_urls`。
 * ⚠️ 直接写宿主机磁盘(不经 backend);路径相对当前工作目录解析。仅信任环境使用。
 */
export const downloadTool = Tool.define({
  name: "download",
  description:
    "Download a file from a URL and save it to a path under the current working directory. Returns the saved path and byte size. Note: writes to the host filesystem.",
  schema: z.object({
    url: z.string().describe("The file URL to download."),
    path: z
      .string()
      .describe("Destination path, relative to the current working directory."),
  }),
  execute: async ({ url, path }): Promise<ToolResult> => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok)
        return err(`Download failed: HTTP ${res.status} ${res.statusText}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const dest = resolve(process.cwd(), path);
      await writeFile(dest, bytes);
      return ok(`Saved ${bytes.byteLength} bytes to ${dest}`, {
        path: dest,
        bytes: bytes.byteLength,
      });
    } catch (e) {
      return err(
        `Download failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
