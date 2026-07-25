import type { Graph } from "../model";
import { pack } from "./pack";

const encoder = new TextEncoder();

/** 估算图的压缩率，对比原始 JSON 与紧凑格式的 UTF-8 字节数。 */
export function compressionRatio<N, E>(
  graph: Graph<N, E>,
): { originalBytes: number; compressedBytes: number; ratio: number } {
  const originalBytes = encoder.encode(JSON.stringify(graph.toJSON())).length;
  const compressedBytes = encoder.encode(JSON.stringify(pack(graph))).length;

  return {
    originalBytes,
    compressedBytes,
    ratio: compressedBytes === 0 ? 0 : originalBytes / compressedBytes,
  };
}
