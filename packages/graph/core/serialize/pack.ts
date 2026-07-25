import type { Graph } from "../model";
import type { Compact } from "./format";
import { emit, IDENTITY } from "./kernel";

/** 将图打包为紧凑序列化格式，约缩减 60-70% 字节，保留端口约束与复合图层次。 */
export function pack<N, E>(graph: Graph<N, E>): Compact {
  return emit(graph, graph.nodes(), IDENTITY);
}
