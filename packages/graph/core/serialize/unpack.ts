import type { Graph } from "../model";
import type { Compact } from "./format";
import { absorb, IDENTITY } from "./kernel";
import type { SocketLookup } from "./sockets";

/** 将紧凑格式还原为图，恢复端口约束与层次关系；版本不匹配时抛出 Schema 错误。 */
export function unpack<N, E>(
  data: Compact,
  options?: { target?: Graph<N, E>; sockets?: SocketLookup },
): Graph<N, E> {
  return absorb(data, IDENTITY, options);
}
