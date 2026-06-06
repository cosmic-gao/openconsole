import { z } from "zod";

import { Tool } from "../tool";
import { err, ok } from "../types";

/**
 * `current_time` —— 获取当前日期时间(可指定 IANA 时区)。
 * 模型没有内置时钟,凡涉及"现在/今天"都应先调它。移植自 magic 的时间规范(带时区)。
 */
export const currentTimeTool = Tool.define({
  name: "current_time",
  description:
    'Get the current date and time, optionally in a specific IANA timezone (e.g. "Asia/Shanghai", "America/New_York"). The model has no built-in clock, so call this whenever the current date or time matters.',
  schema: z.object({
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone name (e.g. "Asia/Shanghai"); defaults to UTC.'),
  }),
  execute: ({ timezone }) => {
    const tz = timezone ?? "UTC";
    const now = new Date();
    try {
      const formatted = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        dateStyle: "full",
        timeStyle: "long",
        hour12: false,
      }).format(now);
      return ok(`${formatted}\nISO (UTC): ${now.toISOString()}`, {
        iso: now.toISOString(),
        timezone: tz,
      });
    } catch (e) {
      return err(
        `Invalid timezone "${tz}": ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
});
