import type { IndexQueue } from "../index";

/** 确定性 LCG，保证随机用例可复现。 */
export function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** 惰性语义下的标准消费循环：settled 位图跳过过期条目。 */
export function consume(queue: IndexQueue, capacity: number): number[] {
  const settled = new Uint8Array(capacity);
  const order: number[] = [];
  for (let index = queue.poll(); index !== -1; index = queue.poll()) {
    if (settled[index] === 1) continue;
    settled[index] = 1;
    order.push(index);
  }
  return order;
}

/** 随机有向带权图，CSR 布局。 */
export interface Graph {
  readonly offsets: Int32Array;
  readonly targets: Int32Array;
  readonly weights: Int32Array;
  readonly order: number;
}

export function randomGraph(
  nodes: number,
  edges: number,
  maxWeight: number,
  seed: number,
): Graph {
  const random = rng(seed);
  const from = new Int32Array(edges);
  const to = new Int32Array(edges);
  const weight = new Int32Array(edges);
  const degree = new Int32Array(nodes);

  for (let e = 0; e < edges; e++) {
    const u = Math.floor(random() * nodes);
    const v = Math.floor(random() * nodes);
    from[e] = u;
    to[e] = v;
    weight[e] = 1 + Math.floor(random() * maxWeight);
    degree[u] = degree[u]! + 1;
  }

  const offsets = new Int32Array(nodes + 1);
  for (let u = 0; u < nodes; u++) offsets[u + 1] = offsets[u]! + degree[u]!;
  const cursor = Int32Array.from(offsets.subarray(0, nodes));
  const targets = new Int32Array(edges);
  const weights = new Int32Array(edges);
  for (let e = 0; e < edges; e++) {
    const u = from[e]!;
    const slot = cursor[u]!;
    targets[slot] = to[e]!;
    weights[slot] = weight[e]!;
    cursor[u] = slot + 1;
  }

  return { offsets, targets, weights, order: nodes };
}

/** 用给定队列跑 Dijkstra；`settled` 位图负责跳过过期条目。 */
export function shortest(
  graph: Graph,
  source: number,
  queue: IndexQueue,
): Float64Array {
  const dist = new Float64Array(graph.order).fill(Infinity);
  const settled = new Uint8Array(graph.order);

  dist[source] = 0;
  queue.push(source, 0);

  for (let u = queue.poll(); u !== -1; u = queue.poll()) {
    if (settled[u] === 1) continue;
    settled[u] = 1;
    const base = dist[u]!;
    for (let k = graph.offsets[u]!; k < graph.offsets[u + 1]!; k++) {
      const v = graph.targets[k]!;
      if (settled[v] === 1) continue;
      const candidate = base + graph.weights[k]!;
      if (candidate < dist[v]!) {
        dist[v] = candidate;
        queue.push(v, candidate);
      }
    }
  }
  return dist;
}

/** 朴素 O(n²) Dijkstra 参照实现。 */
export function reference(graph: Graph, source: number): Float64Array {
  const dist = new Float64Array(graph.order).fill(Infinity);
  const settled = new Uint8Array(graph.order);
  dist[source] = 0;

  for (let step = 0; step < graph.order; step++) {
    let best = -1;
    for (let v = 0; v < graph.order; v++) {
      if (
        settled[v] === 0 &&
        dist[v]! !== Infinity &&
        (best === -1 || dist[v]! < dist[best]!)
      ) {
        best = v;
      }
    }
    if (best === -1) break;
    settled[best] = 1;
    for (let k = graph.offsets[best]!; k < graph.offsets[best + 1]!; k++) {
      const v = graph.targets[k]!;
      const candidate = dist[best]! + graph.weights[k]!;
      if (candidate < dist[v]!) dist[v] = candidate;
    }
  }
  return dist;
}
