/**
 * 测试 fixture 工具：用 {@link Graph} 构造端口型图，简化测试中的拓扑搭建。
 *
 * @remarks
 * 每个节点固定一个 `x` 输入端口和 `y` 输出端口（均为 `Socket.number`），
 * 因此测试只需关注边的拓扑形态，不必关心端口绑定细节。
 */
import { Edge, Endpoint, Graph, Vertex, Socket, type EdgeId, type GraphId, type NodeId, type Sockets, type Node } from '../core';

/** 把任意字符串字面量转为带品牌的 ID 类型，仅供测试代码使用。 */
export const id = <T extends string>(v: string) => v as unknown as T;

/** 创建带默认 `x`/`y` 端口的端口节点。 */
export const portNode = (name: string) => {
  const n = new Vertex(id<NodeId>(name));
  n.addInput('x', Socket.number);
  n.addOutput('y', Socket.number);
  return n;
};

/** `[source, target]` 或 `[source, target, weight]` 形式的边描述。 */
export type EdgeSpec = readonly [string, string] | readonly [string, string, unknown];

/**
 * 按边描述列表构造 {@link Graph}；缺失的节点会被自动 `addNode`，边 ID 自动以 `e0`、`e1`... 递增分配。
 *
 * @param graphId 图 ID 字面量
 * @param edges 边描述
 * @param extraNodes 不在边里出现但需要存在的孤立节点
 */
export function buildGraph<N = unknown, E = unknown>(
  graphId: string,
  edges: readonly EdgeSpec[],
  extraNodes: readonly string[] = [],
): Graph<N, E> {
  const g = new Graph<N, E>(id<GraphId>(graphId));
  const cache = new Map<string, ReturnType<typeof portNode>>();
  const ensure = (name: string) => {
    let n = cache.get(name);
    if (!n) {
      n = portNode(name);
      cache.set(name, n);
      g.addNode(n as Vertex<Sockets, Sockets, N> as unknown as Node<N>);
    }
    return n;
  };
  for (const name of extraNodes) ensure(name);
  let i = 0;
  for (const e of edges) {
    const [source, target] = e;
    const weight = e.length === 3 ? e[2] : undefined;
    const sourceNode = ensure(source);
    const targetNode = ensure(target);
    g.addEdge(new Edge(
      id<EdgeId>(`e${i++}`),
      new Endpoint(sourceNode, sourceNode.output('y')!),
      new Endpoint(targetNode, targetNode.input('x')!),
      weight as E,
    ));
  }
  return g;
}
