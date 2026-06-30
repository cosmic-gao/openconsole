import type { Graph } from "../classic";
import { pack } from "./pack";

interface TextEncoderLike {
  encode(input: string): { length: number };
}

const TEXT_ENCODER: TextEncoderLike | null = (() => {
  const ctor = (globalThis as { TextEncoder?: new () => TextEncoderLike })
    .TextEncoder;
  return ctor ? new ctor() : null;
})();

/** 估算图的压缩率，对比原始 JSON 与紧凑格式的 UTF-8 字节数。 */
export function compressionRatio<N, E>(
  graph: Graph<N, E>,
): {
  originalBytes: number;
  compressedBytes: number;
  ratio: number;
} {
  const original = JSON.stringify(graph.toJSON());
  const compressed = JSON.stringify(pack(graph));

  const originalBytes = utf8ByteLength(original);
  const compressedBytes = utf8ByteLength(compressed);

  return {
    originalBytes,
    compressedBytes,
    ratio: compressedBytes === 0 ? 0 : originalBytes / compressedBytes,
  };
}

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
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
