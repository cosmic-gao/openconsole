import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

/**
 * 提示词模板引擎 + 开发者注释剥离。
 *
 * 移植自 magic 的 `agentlang/agent/syntax.py`（`{{ @directive(...) }}` 引擎）
 * 与 `agentlang/utils/annotation_remover.py`（`<!--zh-->` 剥离器）。
 */

// 与 magic 一致，仅剥离 `zh` 开发者注释（给人看、不进模型上下文）。
// INLINE_ZH 匹配单行形式 `<!--zh: ...-->`；BLOCK_ZH 匹配多行块形式 `<!--zh\n...\n-->`。
// 结尾的 `[ \t]*\r?\n?` 把注释后面残留的行尾空白和换行一并吞掉，避免留下空行。
const INLINE_ZH = /<!--zh:[\s\S]*?-->[ \t]*\r?\n?/g;
const BLOCK_ZH = /<!--zh\s*\r?\n[\s\S]*?\r?\n\s*-->[ \t]*\r?\n?/g;

/** 剥离 `<!--zh ...-->` 开发者注释，只保留面向模型的正文。 */
export function strip(text: string): string {
  return text.replace(BLOCK_ZH, "").replace(INLINE_ZH, "");
}

export interface RenderOptions {
  /** 解析 `@include` 路径时的基准目录。默认为 `process.cwd()`。 */
  baseDir?: string;
  /** 供 `@variable(key)` 使用的变量表。 */
  vars?: Record<string, string>;
  /** 供 `@config(key)` 使用的配置值。 */
  config?: Record<string, string>;
}

interface Ctx {
  baseDir: string;
  vars: Record<string, string>;
  config: Record<string, string>;
  stack: string[];
}

interface Args {
  positional: string[];
  named: Record<string, string>;
}

type Handler = (args: Args, ctx: Ctx) => Promise<string> | string;

// 匹配 `{{ @name(args) }}` 指令；括号内参数按原始文本捕获（不支持嵌套括号，
// 这一点与 magic 保持一致）。`[\s\S]*?` 用非贪婪以便正确停在第一个 `)`。
const TOKEN = /\{\{\s*@(\w+)\s*\(([\s\S]*?)\)\s*\}\}/g;
// 若路径以 `.<ext>` 结尾，则视为已带扩展名，不再追加默认扩展名。
const HAS_EXT = /\.[^/\\]+$/;

// 去掉首尾成对的引号（单/双引号需一致），仅当两端确实是同一种引号时才剥离，
// 这样内部含引号的字符串不会被误伤。
function stripQuotes(s: string): string {
  const first = s[0];
  if (
    s.length >= 2 &&
    (first === '"' || first === "'") &&
    s[s.length - 1] === first
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// 按顶层逗号拆分参数：用 quote 状态机跟踪是否处于引号内，
// 处于引号内的逗号被视为普通字符，不作为分隔符（如 "a,b" 保持完整）。
// 不支持反斜杠转义引号（与 magic 一致的简化）。
function splitTopLevel(raw: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null; // 当前所在引号字符；null 表示在引号外
  for (const ch of raw) {
    if (quote) {
      // 引号内：照常累加，遇到同种引号则闭合
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      // 引号外遇到引号：进入引号状态
      cur += ch;
      quote = ch;
    } else if (ch === ",") {
      // 顶层逗号才是真正的分隔符
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// 解析指令参数，区分具名参数（key=value）和位置参数。
function parseArgs(raw: string): Args {
  const positional: string[] = [];
  const named: Record<string, string> = {};
  for (const seg of splitTopLevel(raw)) {
    if (seg === "") continue;
    const eq = seg.indexOf("=");
    // 仅当 `=` 左侧是合法标识符时才当作具名参数，避免把值里的 `=`（如 URL）误判
    if (eq > 0 && /^[A-Za-z_]\w*$/.test(seg.slice(0, eq).trim())) {
      named[seg.slice(0, eq).trim()] = stripQuotes(seg.slice(eq + 1).trim());
    } else {
      positional.push(stripQuotes(seg));
    }
  }
  return { positional, named };
}

// 各指令的处理函数。位置参数与具名参数二选一，具名参数优先级在 `??` 链中靠后兜底。
const handlers: Record<string, Handler> = {
  // @include(path)：内联另一个提示词文件。默认补 `.prompt` 扩展名。
  include: async (args, ctx) => {
    const p = args.positional[0] ?? args.named["path"];
    if (!p) throw new Error("@include requires a path");
    const ext = args.named["extension"] ?? ".prompt";
    const full = resolve(ctx.baseDir, HAS_EXT.test(p) ? p : p + ext);
    // 用 stack 记录正在展开的文件路径链，命中即说明出现循环包含，立即报错避免死循环
    if (ctx.stack.includes(full)) {
      throw new Error(`@include cycle detected: ${full}`);
    }
    const content = strip(await readFile(full, "utf8"));
    // 递归展开被包含文件：baseDir 切换为该文件所在目录（让其相对路径正确解析），
    // 并把自身压入 stack 供下层做环检测
    const expanded = await expand(content, {
      ...ctx,
      baseDir: dirname(full),
      stack: [...ctx.stack, full],
    });
    return expanded.replace(/\s+$/, ""); // 去掉尾部空白，避免内联后多出空行
  },
  // @variable(key[, default])：取运行期变量，缺失则用默认值，再缺则报错
  variable: (args, ctx) => {
    const key = args.positional[0] ?? args.named["key"];
    if (!key) throw new Error("@variable requires a key");
    if (key in ctx.vars) return ctx.vars[key] ?? "";
    const def = args.positional[1] ?? args.named["default"];
    if (def !== undefined) return def;
    throw new Error(`@variable("${key}") is not defined and has no default`);
  },
  // @env(name[, default])：取环境变量，缺失回退到默认值或空串
  env: (args) => {
    const name = args.positional[0] ?? args.named["name"];
    if (!name) throw new Error("@env requires a name");
    return (
      process.env[name] ?? args.positional[1] ?? args.named["default"] ?? ""
    );
  },
  // @config(key[, default])：取注入的配置值，缺失回退到默认值或空串。
  // 注意：该指令仅在直接调用 render(body, { config }) 时有值；Agent.load 不透传 config。
  config: (args, ctx) => {
    const key = args.positional[0] ?? args.named["key"];
    if (!key) throw new Error("@config requires a key");
    return ctx.config[key] ?? args.positional[1] ?? args.named["default"] ?? "";
  },
  datetime: () => new Date().toISOString(), // @datetime()：当前时间（ISO 字符串）
  uuid: () => randomUUID(), // @uuid()：随机 UUID
  random: () => String(Math.floor(Math.random() * 1e9)), // @random()：随机整数
};

// 展开一段文本中的所有指令。
// 这里用 exec 循环手动遍历匹配（而非 String.replace 回调），原因有二：
//   1. handler 可能是异步的（如 @include 需要 readFile），replace 无法 await 异步替换结果；
//   2. 手动拼接「上一个匹配末尾 -> 当前匹配起点」之间的原文，可逐段精确处理。
// 每轮用 re.lastIndex 推进游标。新建 RegExp 副本是为了避免共享全局正则的 lastIndex 状态（可重入）。
async function expand(text: string, ctx: Ctx): Promise<string> {
  const re = new RegExp(TOKEN.source, "g");
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out += text.slice(last, m.index); // 追加上次匹配到本次匹配之间的原文
    const name = m[1] ?? "";
    const handler = handlers[name];
    if (!handler) {
      out += m[0]; // 未知指令：原样保留，不报错
    } else {
      out += await handler(parseArgs(m[2] ?? ""), ctx);
    }
    last = re.lastIndex;
  }
  out += text.slice(last); // 追加最后一个匹配之后的剩余原文
  return out;
}

/**
 * 渲染提示词正文：先剥离 `<!--zh-->` 注释，再展开
 * `{{ @include / @variable / @env / @config / @datetime / @uuid / @random }}`。
 * 其中 `@include` 会递归展开（带环检测），其余指令不递归。
 */
export async function render(
  body: string,
  options: RenderOptions = {},
): Promise<string> {
  const ctx: Ctx = {
    baseDir: options.baseDir ?? process.cwd(),
    vars: options.vars ?? {},
    config: options.config ?? {},
    stack: [],
  };
  return (await expand(strip(body), ctx)).trim();
}
