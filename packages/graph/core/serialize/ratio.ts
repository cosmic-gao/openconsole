/**
 * compressionRatio：估算紧凑格式相对 toJson 的压缩比。
 */

import type { Graph } from '../classic';
import { pack } from './pack';

/** TextEncoder 接口（避免在仅 ES2022 lib 下引用全局类型）。 */
interface TextEncoderLike {
  encode(input: string): { length: number };
}

/** 复用的 TextEncoder 实例；环境不支持时为 `null`，回退到手算。 */
const TEXT_ENCODER: TextEncoderLike | null = (() => {
  const ctor = (globalThis as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  return ctor ? new ctor() : null;
})();

/**
 * 估算压缩率。
 *
 * @template N 节点权重类型
 * @template E 边权重类型
 * @param graph 待评估的图
 * @returns 原始字节、压缩字节及压缩比 (`originalBytes / compressedBytes`)
 */
export function compressionRatio<N, E>(graph: Graph<N, E>): {
  originalBytes: number;
  compressedBytes: number;
  ratio: number;
} {
  const original = JSON.stringify(graph.toJson());
  const compressed = JSON.stringify(pack(graph));

  const originalBytes = utf8ByteLength(original);
  const compressedBytes = utf8ByteLength(compressed);

  return {
    originalBytes,
    compressedBytes,
    ratio: compressedBytes === 0 ? 0 : originalBytes / compressedBytes,
  };
}

/**
 * 计算字符串的 UTF-8 字节长度。
 *
 * @remarks 优先使用 {@link TextEncoder}（O(N) 且能正确处理代理对）；不可用时回退到手算。
 *
 * @internal
 */
function utf8ByteLength(text: string): number {
  if (TEXT_ENCODER) return TEXT_ENCODER.encode(text).length;

  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length) {
      // 高代理 + 低代理 = 4 字节 UTF-8
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
