import type { NodeId } from "../ident";
import type { Snapshot } from "../snapshot";

/** 访问者的返回值：继续、剪掉该子树、整体中止。 */
export type Control = "continue" | "prune" | "break";

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/** 深度优先，按发现顺序产出；多起点依次展开，已访问的不重复产出。 */
export function* dfs(
  snapshot: Snapshot,
  ...starts: NodeId[]
): Generator<NodeId> {
  const { offset, other } = snapshot.outbound;
  const seen = new Uint8Array(snapshot.order);
  const stack: number[] = [];

  for (const start of starts) {
    const s = snapshot.indexOf(start);
    if (s < 0) continue;
    stack.push(s);
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (seen[u] === 1) continue;
      seen[u] = 1;
      yield snapshot.label(u);
      // 逆序压栈，使出栈顺序与邻接顺序一致。
      for (let k = offset[u + 1]! - 1; k >= offset[u]!; k--) {
        if (seen[other[k]!] === 0) stack.push(other[k]!);
      }
    }
  }
}

/** 广度优先，按层级顺序产出。 */
export function* bfs(
  snapshot: Snapshot,
  ...starts: NodeId[]
): Generator<NodeId> {
  const { offset, other } = snapshot.outbound;
  const seen = new Uint8Array(snapshot.order);
  const queue: number[] = [];

  for (const start of starts) {
    const s = snapshot.indexOf(start);
    if (s >= 0 && seen[s] === 0) {
      seen[s] = 1;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    yield snapshot.label(u);
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (seen[v] === 0) {
        seen[v] = 1;
        queue.push(v);
      }
    }
  }
}

/** 各节点到起点集的最短跳数；不可达为 -1。下标即节点索引。 */
export function levels(
  snapshot: Snapshot,
  starts: Iterable<NodeId>,
): Int32Array {
  const { offset, other } = snapshot.outbound;
  const depth = new Int32Array(snapshot.order).fill(-1);
  let frontier: number[] = [];

  for (const start of starts) {
    const s = snapshot.indexOf(start);
    if (s >= 0 && depth[s] === -1) {
      depth[s] = 0;
      frontier.push(s);
    }
  }
  for (let level = 1; frontier.length > 0; level++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        if (depth[v] === -1) {
          depth[v] = level;
          next.push(v);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/** 事件式深度优先遍历，可按边的分类做环检测。回调不分配对象。 */
export interface Visitor {
  discover?(node: NodeId): Control | void;
  finish?(node: NodeId): Control | void;
  /** 通往未访问节点的树边。 */
  tree?(from: NodeId, to: NodeId): Control | void;
  /** 指向 DFS 路径上祖先的回边——存在即成环。 */
  back?(from: NodeId, to: NodeId): Control | void;
  /** 指向已完成节点的横叉边或前向边。 */
  cross?(from: NodeId, to: NodeId): Control | void;
}

/** `starts` 为 `null` 时扫描全图。 */
export function visit(
  snapshot: Snapshot,
  starts: Iterable<NodeId> | null,
  visitor: Visitor,
): Control {
  const { order, labels } = snapshot;
  const { offset, other } = snapshot.outbound;
  const color = new Uint8Array(order);
  const stack = new Int32Array(order);
  const cursor = new Int32Array(order);
  let depth = 0;

  const enter = (u: number): Control => {
    color[u] = GRAY;
    const control = visitor.discover?.(labels[u]!) ?? "continue";
    if (control === "break") return "break";
    if (control === "prune") {
      color[u] = BLACK;
      return visitor.finish?.(labels[u]!) === "break" ? "break" : "prune";
    }
    stack[depth] = u;
    cursor[depth] = offset[u]!;
    depth++;
    return "continue";
  };

  for (const root of starts ?? labels) {
    const r = snapshot.indexOf(root);
    if (r < 0 || color[r] !== WHITE) continue;
    if (enter(r) === "break") return "break";

    while (depth > 0) {
      const top = depth - 1;
      const u = stack[top]!;

      if (cursor[top]! >= offset[u + 1]!) {
        color[u] = BLACK;
        depth--;
        if (visitor.finish?.(labels[u]!) === "break") return "break";
        continue;
      }

      const k = cursor[top]!;
      cursor[top] = k + 1;
      const v = other[k]!;
      const shade = color[v]!;
      if (shade === WHITE) {
        const control = visitor.tree?.(labels[u]!, labels[v]!) ?? "continue";
        if (control === "break") return "break";
        if (control === "prune") continue;
        if (enter(v) === "break") return "break";
      } else if (shade === GRAY) {
        if (visitor.back?.(labels[u]!, labels[v]!) === "break") return "break";
      } else if (visitor.cross?.(labels[u]!, labels[v]!) === "break") {
        return "break";
      }
    }
  }
  return "continue";
}

/** 后序（DFS 完成序）。 */
export function postorder(
  snapshot: Snapshot,
  starts?: Iterable<NodeId>,
): NodeId[] {
  const finished: NodeId[] = [];
  visit(snapshot, starts ?? null, {
    finish(node) {
      finished.push(node);
    },
  });
  return finished;
}
