import { topology } from "../algorithms";
import type { Graph } from "../model";
import type { EdgeId, NodeId, PortId } from "../types";
import type { Compact } from "./format";
import { absorb, emit, IDENTITY, Intern, type Mapping } from "./kernel";
import type { SocketLookup } from "./sockets";

/** ID 重映射表，按短整数下标记录节点、边、端口的原始 ID 以便还原。 */
export interface IdRemap {
  readonly nodes: ReadonlyArray<string>;
  readonly edges: ReadonlyArray<string>;
  readonly ports: ReadonlyArray<string>;
}

/** packRemap 的结果：紧凑数据与对应的 ID 重映射表。 */
export interface RemappedCompact {
  readonly compact: Compact;
  readonly remap: IdRemap;
}

/** 拓扑稳定地打包图，将长 UUID 重映射为短整数 ID，返回紧凑数据与重映射表。 */
export function packRemap<N, E>(graph: Graph<N, E>): RemappedCompact {
  const intern = new Intern();
  const compact = emit(graph, topology(graph).order, intern);
  return {
    compact,
    remap: { nodes: intern.nodes, edges: intern.edges, ports: intern.ports },
  };
}

/** 按重映射表反查原始 id。 */
function lookup(remap: IdRemap): Mapping {
  return {
    node: (id) => remap.nodes[Number(id)] as NodeId,
    port: (id) => remap.ports[Number(id)] as PortId,
    edge: (id) => remap.edges[Number(id)] as EdgeId,
  };
}

/** 还原重映射后的紧凑数据为图，默认按重映射表恢复原始 ID；keepCompactIds 为 true 时保留短整数 ID。 */
export function unpackRemap<N, E>(
  data: RemappedCompact,
  options?: {
    sockets?: SocketLookup;
    target?: Graph<N, E>;
    keepCompactIds?: boolean;
  },
): Graph<N, E> {
  const map = options?.keepCompactIds ? IDENTITY : lookup(data.remap);
  return absorb(data.compact, map, options);
}
