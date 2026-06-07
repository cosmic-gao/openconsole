/**
 * 前端侧的事件模型 —— **镜像** `@openconsole/agent` 导出的 `Event` 联合，但只保留可经
 * SSE 序列化的子集（去掉 `subagent` 的嵌套异步流，后端会把它转成普通通知）。
 *
 * 单独定义而非从 agent 包 import，是为了让浏览器产物不牵连 Node 侧代码（langchain/fs 等）。
 */

export interface Usage {
  input: number;
  output: number;
  total: number;
}

/** SSE 线缆事件：与后端 server/index.ts 写出的 JSON 形状一一对应。 */
export type WireEvent =
  | { type: "token"; text: string; node?: string }
  | { type: "think"; text: string }
  | { type: "tool_start"; id: string; name: string; input: unknown }
  | {
      type: "tool_end";
      id: string;
      name: string;
      ok: boolean;
      content: string;
      data?: Record<string, unknown>;
      error?: string;
      durationMs?: number;
    }
  | { type: "error"; message: string; code?: string }
  | { type: "done"; text: string; usage?: Usage };

/**
 * 流式拆分内联 `<think>…</think>`：返回 push/flush，增量给出 `{ answer, reasoning }`。
 *
 * 与终端版 examples/opencode.ts 的同名函数同构 —— MiniMax-M2 等模型把推理直接写进 content，
 * 它以普通 token 抵达，这里把推理与正文切开，避免 `<think>` 标签污染答案。标签可能被切在两个
 * token 之间，故仅当末尾确为某标签前缀时才保留 holdback，其余立即放行。
 */
export function makeThinkFilter() {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let inThink = false;
  let buf = "";

  /** 末尾应保留的长度：buf 的最长后缀且为 OPEN/CLOSE 的前缀（可能是半个标签）。 */
  const partialTail = (s: string): number => {
    let keep = 0;
    for (const tag of [OPEN, CLOSE]) {
      for (let k = Math.min(tag.length - 1, s.length); k > 0; k--) {
        if (s.endsWith(tag.slice(0, k))) {
          keep = Math.max(keep, k);
          break;
        }
      }
    }
    return keep;
  };

  const cut = (): { answer: string; reasoning: string } => {
    let answer = "";
    let reasoning = "";
    for (;;) {
      const tag = inThink ? CLOSE : OPEN;
      const i = buf.indexOf(tag);
      if (i === -1) break;
      const seg = buf.slice(0, i);
      if (inThink) reasoning += seg;
      else answer += seg;
      buf = buf.slice(i + tag.length);
      inThink = !inThink;
    }
    const keep = partialTail(buf);
    const seg = buf.slice(0, buf.length - keep);
    buf = buf.slice(buf.length - keep);
    if (inThink) reasoning += seg;
    else answer += seg;
    return { answer, reasoning };
  };

  return {
    /** 喂入一段 token 文本，返回本段切出的正文/推理增量。 */
    push(text: string): { answer: string; reasoning: string } {
      buf += text;
      return cut();
    },
    /** 收尾：把残留按当前状态全部吐出（标签未闭合则算推理）。 */
    flush(): { answer: string; reasoning: string } {
      const rest = buf;
      buf = "";
      return inThink
        ? { answer: "", reasoning: rest }
        : { answer: rest, reasoning: "" };
    },
  };
}
