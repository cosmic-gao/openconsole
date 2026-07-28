import { inboundOf, outDegree, type Structure } from "../snapshot";

/** 访问者的返回值：继续、剪掉该子树、整体中止。 */
export type Control = "continue" | "prune" | "break";

const WHITE = 0;
const GRAY = 1;
const BLACK = 2;

/** 深度优先，按发现顺序产出节点索引；多起点依次展开，已访问的不重复产出。 */
export function* dfs(
  structure: Structure,
  ...starts: number[]
): Generator<number> {
  const { offset, other } = structure.outbound;
  const seen = new Uint8Array(structure.order);
  const stack: number[] = [];

  for (const s of starts) {
    if (s < 0 || s >= structure.order) continue;
    stack.push(s);
    while (stack.length > 0) {
      const u = stack.pop()!;
      if (seen[u] === 1) continue;
      seen[u] = 1;
      yield u;
      // 逆序压栈，使出栈顺序与邻接顺序一致。
      for (let k = offset[u + 1]! - 1; k >= offset[u]!; k--) {
        if (seen[other[k]!] === 0) stack.push(other[k]!);
      }
    }
  }
}

/** 广度优先，按层级顺序产出节点索引。 */
export function* bfs(
  structure: Structure,
  ...starts: number[]
): Generator<number> {
  const { offset, other } = structure.outbound;
  const seen = new Uint8Array(structure.order);
  const queue: number[] = [];

  for (const s of starts) {
    if (s >= 0 && s < structure.order && seen[s] === 0) {
      seen[s] = 1;
      queue.push(s);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]!;
    yield u;
    for (let k = offset[u]!; k < offset[u + 1]!; k++) {
      const v = other[k]!;
      if (seen[v] === 0) {
        seen[v] = 1;
        queue.push(v);
      }
    }
  }
}

/** 方向优化 BFS 的切换阈值（Beamer；GAP 基准的缺省值）。 */
const ALPHA = 15;
const BETA = 18;

/**
 * BFS 前沿：一层已领到深度、待向外扩张的节点，以及决定扩张方向所需的两个规模计数。
 *
 * 两种扩张方式等价，开销不同（Beamer 的方向优化）：{@link Frontier.push} 沿出边正向认领，
 * 代价与前沿的出边数同阶；{@link Frontier.pull} 让未访问节点在自己的入边里找前沿，命中即领、
 * 立即 break，前沿覆盖大半个图时省掉的是对已访问区的整片重复检查。
 */
class Frontier {
  /** 各节点到起点集的最短跳数；不可达为 -1。 */
  public readonly depth: Int32Array;
  private _nodes: number[] = [];
  /** 前沿的出边总数。 */
  private _scout = 0;
  /** 未访问节点的出边总数。 */
  private _remaining: number;
  private _level = 0;

  public constructor(private readonly _structure: Structure) {
    this.depth = new Int32Array(_structure.order).fill(-1);
    this._remaining = _structure.outbound.offset[_structure.order]!;
  }

  public seed(s: number): void {
    if (s < 0 || s >= this._structure.order || this.depth[s] !== -1) return;
    this.depth[s] = 0;
    this._nodes.push(s);
    this._scout += outDegree(this._structure, s);
    this._remaining -= outDegree(this._structure, s);
  }

  public get active(): boolean {
    return this._nodes.length > 0;
  }

  /** 前沿的出边规模压过未访问区的 1/{@link ALPHA}，且有入向可用——反向扫描更省。 */
  public get dense(): boolean {
    return (
      this._structure.inbound !== undefined &&
      this._scout * ALPHA > this._remaining
    );
  }

  /** 正向推进一层：前沿沿出边认领未访问节点。 */
  public push(): void {
    const { offset, other } = this._structure.outbound;
    const next: number[] = [];
    let reach = 0;
    for (const u of this._nodes) {
      for (let k = offset[u]!; k < offset[u + 1]!; k++) {
        const v = other[k]!;
        if (this.depth[v] === -1) {
          this.depth[v] = this._level + 1;
          next.push(v);
          reach += offset[v + 1]! - offset[v]!;
        }
      }
    }
    this._nodes = next;
    this._scout = reach;
    this._remaining -= reach;
    this._level++;
  }

  /** 反向推进若干层，直到前沿缩回 V/{@link BETA} 且不再增长，再切回正向。 */
  public pull(): void {
    const { offset, other } = inboundOf(this._structure, "levels");
    const order = this._structure.order;
    let awake = this._nodes.length;
    let before: number;
    do {
      before = awake;
      awake = 0;
      for (let v = 0; v < order; v++) {
        if (this.depth[v] !== -1) continue;
        for (let k = offset[v]!; k < offset[v + 1]!; k++) {
          if (this.depth[other[k]!] === this._level) {
            this.depth[v] = this._level + 1;
            awake++;
            break;
          }
        }
      }
      this._level++;
    } while (awake >= before || awake * BETA > order);
    this._rally();
  }

  /** 反向推进只写深度不记名单，切回正向前重建前沿与两侧计数。 */
  private _rally(): void {
    this._nodes = [];
    this._scout = 0;
    this._remaining = 0;
    for (let v = 0; v < this._structure.order; v++) {
      if (this.depth[v] === this._level) {
        this._nodes.push(v);
        this._scout += outDegree(this._structure, v);
      } else if (this.depth[v] === -1) {
        this._remaining += outDegree(this._structure, v);
      }
    }
  }
}

/**
 * 各节点到起点集的最短跳数；不可达为 -1。下标即节点索引。
 *
 * @remarks 扩张方向自适应（见文件内 `Frontier`）：前沿小走正向，前沿大且有入向邻接时走反向。
 *   低直径图上实测 4×；缺入向时始终正向，行为与朴素分层 BFS 一致。
 */
export function levels(
  structure: Structure,
  starts: Iterable<number>,
): Int32Array {
  const frontier = new Frontier(structure);
  for (const s of starts) frontier.seed(s);
  while (frontier.active) {
    if (frontier.dense) frontier.pull();
    else frontier.push();
  }
  return frontier.depth;
}

/** 事件式深度优先遍历，可按边的分类做环检测。回调收到的是节点索引，不分配对象。 */
export interface Visitor {
  discover?(node: number): Control | void;
  finish?(node: number): Control | void;
  /** 通往未访问节点的树边。 */
  tree?(from: number, to: number): Control | void;
  /** 指向 DFS 路径上祖先的回边——存在即成环。 */
  back?(from: number, to: number): Control | void;
  /** 指向已完成节点的横叉边或前向边。 */
  cross?(from: number, to: number): Control | void;
}

/** `starts` 为 `null` 时扫描全图。 */
export function visit(
  structure: Structure,
  starts: Iterable<number> | null,
  visitor: Visitor,
): Control {
  const { order } = structure;
  const { offset, other } = structure.outbound;
  const color = new Uint8Array(order);
  const stack = new Int32Array(order);
  const cursor = new Int32Array(order);
  let depth = 0;

  const enter = (u: number): Control => {
    color[u] = GRAY;
    const control = visitor.discover?.(u) ?? "continue";
    if (control === "break") return "break";
    if (control === "prune") {
      color[u] = BLACK;
      return visitor.finish?.(u) === "break" ? "break" : "prune";
    }
    stack[depth] = u;
    cursor[depth] = offset[u]!;
    depth++;
    return "continue";
  };

  for (const r of starts ?? everything(order)) {
    if (r < 0 || r >= order || color[r] !== WHITE) continue;
    if (enter(r) === "break") return "break";

    while (depth > 0) {
      const top = depth - 1;
      const u = stack[top]!;

      if (cursor[top]! >= offset[u + 1]!) {
        color[u] = BLACK;
        depth--;
        if (visitor.finish?.(u) === "break") return "break";
        continue;
      }

      const k = cursor[top]!;
      cursor[top] = k + 1;
      const v = other[k]!;
      const shade = color[v]!;
      if (shade === WHITE) {
        const control = visitor.tree?.(u, v) ?? "continue";
        if (control === "break") return "break";
        if (control === "prune") continue;
        if (enter(v) === "break") return "break";
      } else if (shade === GRAY) {
        if (visitor.back?.(u, v) === "break") return "break";
      } else if (visitor.cross?.(u, v) === "break") {
        return "break";
      }
    }
  }
  return "continue";
}

function* everything(order: number): Generator<number> {
  for (let u = 0; u < order; u++) yield u;
}

/** 后序（DFS 完成序）的节点索引。 */
export function postorder(
  structure: Structure,
  starts?: Iterable<number>,
): Int32Array {
  const finished = new Int32Array(structure.order);
  let at = 0;
  visit(structure, starts ?? null, {
    finish(node) {
      finished[at++] = node;
    },
  });
  return finished.subarray(0, at);
}
