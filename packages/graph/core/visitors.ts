/**
 * 访问者 (visitor) 模块。
 *
 * @remarks
 * 借鉴 petgraph 的 `visit` 子模块，提供两种访问风格：
 *
 * 1. **状态化遍历器** ({@link Dfs}、{@link Bfs}、{@link DfsPostorder}、{@link Topo})
 *    - 暴露 `next(graph)` 接口，调用方控制推进节奏；
 *    - 支持 `moveTo` / `reset` 重新开始；
 *    - 内部使用 `Set<NodeId>` 维护已访问集合，`O(1)` 查询。
 *
 * 2. **事件回调遍历** ({@link dfsVisit})
 *    - 通过 `discover` / `finish` / `treeEdge` / `backEdge` 等事件回调驱动；
 *    - 回调返回 {@link Control} 决定是否继续 / 剪枝 / 中止；
 *    - 用以编写环检测、强连通分量、支配树等高级算法。
 *
 * 两种风格可与 {@link Reversed} 适配器组合，从而在反向图上零开销复用。
 */

import type {
  Control,
  DfsEvent,
  Neighbors,
  IntoDegree,
  Catalog,
  NodeId,
  Topology,
  Walkable,
} from './types';

/**
 * 深度优先遍历器（迭代实现，可暂停 / 恢复）。
 *
 * @example
 * ```ts
 * const dfs = Dfs.start(graph, root);
 * while (true) {
 *   const node = dfs.next(graph);
 *   if (node === undefined) break;
 *   console.log(node);
 * }
 * ```
 */
export class Dfs {
  /** 待访问栈（自顶向下推进）。 */
  public readonly stack: NodeId[];

  /** 已 discover 的节点集合。 */
  public readonly discovered: Set<NodeId>;

  /**
   * @param start 起点节点 ID
   */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    if (start !== undefined) {
      this.stack.push(start);
    }
  }

  /**
   * 工厂方法：从指定起点构造遍历器。
   *
   * @param _graph 图实例（仅用于类型推导，不保存引用）
   * @param start 起点节点 ID
   */
  public static start<G extends Neighbors>(_graph: G, start: NodeId): Dfs {
    return new Dfs(start);
  }

  /**
   * 推进一步，返回下一个 discovered 节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例（每次调用传入，便于在不同视图间切换）
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    while (this.stack.length > 0) {
      const nodeId = this.stack.pop()!;
      if (this.discovered.has(nodeId)) continue;
      this.discovered.add(nodeId);

      // 反向压栈以保持出邻居的原始访问顺序。
      const neighbors = Array.from(graph.outgoingNeighbors(nodeId));
      for (let i = neighbors.length - 1; i >= 0; i--) {
        const neighbor = neighbors[i]!;
        if (!this.discovered.has(neighbor)) this.stack.push(neighbor);
      }

      return nodeId;
    }
    return undefined;
  }

  /**
   * 跳转到新的起点（保留 discovered 集合）。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this.stack.push(start);
  }

  /** 清空 discovered 集合与栈，从头开始。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
  }

  /**
   * 把遍历器适配为可迭代对象，便于 `for...of` 消费。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public iter<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    const self = this;
    const iter: IterableIterator<NodeId> = {
      [Symbol.iterator]() {
        return iter;
      },
      next() {
        const value = self.next(graph);
        return value === undefined
          ? { value: undefined as unknown as NodeId, done: true }
          : { value, done: false };
      },
    };
    return iter;
  }
}

/**
 * 广度优先遍历器（迭代实现，使用游标队列）。
 *
 * @example
 * ```ts
 * const bfs = Bfs.start(graph, root);
 * while (true) {
 *   const node = bfs.next(graph);
 *   if (node === undefined) break;
 * }
 * ```
 */
export class Bfs {
  /** 待访问队列（用游标推进，避免 `Array#shift` 的 O(n) 拷贝）。 */
  public readonly queue: NodeId[];

  /** 已访问节点集合。 */
  public readonly visited: Set<NodeId>;

  /** 队列读游标。 */
  private _head: number;

  /**
   * @param start 起点节点 ID
   */
  public constructor(start?: NodeId) {
    this.queue = [];
    this.visited = new Set();
    this._head = 0;
    if (start !== undefined) {
      this.queue.push(start);
      this.visited.add(start);
    }
  }

  /**
   * 工厂方法：从指定起点构造遍历器。
   *
   * @param _graph 图实例（仅用于类型推导）
   * @param start 起点节点 ID
   */
  public static start<G extends Neighbors>(_graph: G, start: NodeId): Bfs {
    return new Bfs(start);
  }

  /**
   * 推进一步，返回下一个访问到的节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._head >= this.queue.length) return undefined;
    const nodeId = this.queue[this._head++]!;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      if (this.visited.has(neighbor)) continue;
      this.visited.add(neighbor);
      this.queue.push(neighbor);
    }
    return nodeId;
  }

  /**
   * 重置遍历器到新的起点。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.queue.length = 0;
    this.visited.clear();
    this.queue.push(start);
    this.visited.add(start);
    this._head = 0;
  }

  /** 清空状态。 */
  public reset(): void {
    this.queue.length = 0;
    this.visited.clear();
    this._head = 0;
  }

  /**
   * 适配为可迭代对象。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public iter<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    const self = this;
    const iter: IterableIterator<NodeId> = {
      [Symbol.iterator]() {
        return iter;
      },
      next() {
        const value = self.next(graph);
        return value === undefined
          ? { value: undefined as unknown as NodeId, done: true }
          : { value, done: false };
      },
    };
    return iter;
  }
}

/**
 * DFS 后序状态化遍历器（迭代实现，可暂停 / 恢复）。
 *
 * @remarks
 * - 借鉴 petgraph 的 `DfsPostOrder`：每个 `next(graph)` 调用返回下一个 finish 节点；
 * - 后序意味着节点在所有后代访问完成后才被产出，逆后序天然就是 DAG 的拓扑序；
 * - 内部维护栈帧 `(node, iter)`，无递归调用，深图也不会栈溢出。
 *
 * @example
 * ```ts
 * const post = DfsPostorder.start(graph, root);
 * while (true) {
 *   const node = post.next(graph);
 *   if (node === undefined) break;
 *   // node 已完成所有后代访问
 * }
 * ```
 */
export class DfsPostorder {
  /** 当前 DFS 调用栈：每帧持有节点与其后继迭代器。 */
  public readonly stack: Array<{ node: NodeId; iter: Iterator<NodeId> }>;

  /** 已 discover 的节点集合（含已 finish）。 */
  public readonly discovered: Set<NodeId>;

  /** 已 finish 的节点集合。 */
  public readonly finished: Set<NodeId>;

  /** 待 lazy 推入栈的起点（首次 `next()` 时消费）。 */
  private _initial: NodeId | undefined;

  /**
   * @param start 起点节点 ID（lazy 入栈，等到首次 `next(graph)` 时再用 graph 拿迭代器）
   */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    this.finished = new Set();
    this._initial = start;
  }

  /**
   * 工厂方法：从指定起点构造遍历器（即时入栈，直接持有 graph 拿到的子迭代器）。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @param start 起点节点 ID
   */
  public static start<G extends Neighbors>(graph: G, start: NodeId): DfsPostorder {
    const inst = new DfsPostorder();
    inst.discovered.add(start);
    inst.stack.push({ node: start, iter: graph.outgoingNeighbors(start)[Symbol.iterator]() });
    return inst;
  }

  /**
   * 推进一步，返回下一个 finish 节点；遍历结束返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._initial !== undefined) {
      const start = this._initial;
      this._initial = undefined;
      this.discovered.add(start);
      this.stack.push({ node: start, iter: graph.outgoingNeighbors(start)[Symbol.iterator]() });
    }

    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1]!;

      let pushed = false;
      while (true) {
        const r = frame.iter.next();
        if (r.done) break;
        const child = r.value;
        if (this.discovered.has(child)) continue;
        this.discovered.add(child);
        this.stack.push({
          node: child,
          iter: graph.outgoingNeighbors(child)[Symbol.iterator](),
        });
        pushed = true;
        break;
      }

      if (pushed) continue;

      this.stack.pop();
      this.finished.add(frame.node);
      return frame.node;
    }
    return undefined;
  }

  /**
   * 跳转到新的起点（保留 discovered / finished 集合）。
   *
   * @param start 新起点
   */
  public moveTo(start: NodeId): void {
    this.stack.length = 0;
    this._initial = start;
  }

  /** 清空状态，从头开始。 */
  public reset(): void {
    this.stack.length = 0;
    this.discovered.clear();
    this.finished.clear();
    this._initial = undefined;
  }

  /**
   * 适配为可迭代对象。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public iter<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    const self = this;
    const iter: IterableIterator<NodeId> = {
      [Symbol.iterator]() {
        return iter;
      },
      next() {
        const value = self.next(graph);
        return value === undefined
          ? { value: undefined as unknown as NodeId, done: true }
          : { value, done: false };
      },
    };
    return iter;
  }
}

/**
 * 拓扑序状态化遍历器（Kahn 算法的可暂停版）。
 *
 * @remarks
 * - `next(graph)` 一次返回一个入度为 0 的节点；
 * - 用 `_pending` 跟踪剩余入度，避免每次重新计算；
 * - 检测到环时 `next` 返回 `undefined`，可调用 {@link cycleNodes} 取得环上节点。
 *
 * @example
 * ```ts
 * const topo = Topo.start(graph);
 * for (const node of topo.iter(graph)) {
 *   evaluate(node);
 * }
 * if (topo.cycleNodes().length > 0) console.warn('cycle detected');
 * ```
 */
export class Topo {
  /** 当前可输出的节点队列。 */
  public readonly queue: NodeId[];

  /** 节点 → 当前剩余入度。 */
  private _pending: Map<NodeId, number>;

  /** 队列读游标。 */
  private _head: number;

  /** 已经被 next() 输出的节点数（用于环检测）。 */
  private _emitted: number;

  /** 总节点数（构建时一次性确定）。 */
  private readonly _total: number;

  /**
   * 内部构造器；调用方应使用 {@link Topo.start}。
   *
   * @internal
   */
  private constructor(pending: Map<NodeId, number>, total: number) {
    this.queue = [];
    this._pending = pending;
    this._head = 0;
    this._emitted = 0;
    this._total = total;
    for (const [nodeId, degree] of pending) {
      if (degree === 0) this.queue.push(nodeId);
    }
  }

  /**
   * 工厂方法：基于图的当前结构构造拓扑遍历器。
   *
   * @template G 满足 {@link Walkable} + 可选 {@link IntoDegree} 的图类型
   * @param graph 图实例
   */
  public static start<G extends Walkable & Partial<IntoDegree>>(graph: G): Topo {
    const pending = new Map<NodeId, number>();
    let total = 0;

    if (typeof graph.inDegree === 'function') {
      for (const nodeId of graph.nodeIds) {
        pending.set(nodeId, graph.inDegree(nodeId));
        total++;
      }
    } else {
      for (const nodeId of graph.nodeIds) {
        pending.set(nodeId, 0);
        total++;
      }
      // 仅对 nodeIds 中的节点累计入度；`outgoingNeighbors` 偶发返回的孤儿节点
      // (不在 nodeIds 中) 不应被算入拓扑空间，否则会出现 emit count > total 的不一致。
      for (const nodeId of graph.nodeIds) {
        for (const neighbor of graph.outgoingNeighbors(nodeId)) {
          if (pending.has(neighbor)) {
            pending.set(neighbor, pending.get(neighbor)! + 1);
          }
        }
      }
    }

    return new Topo(pending, total);
  }

  /**
   * 推进一步，返回拓扑序中下一个节点；剩余节点都在环上时返回 `undefined`。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public next<G extends Neighbors>(graph: G): NodeId | undefined {
    if (this._head >= this.queue.length) return undefined;
    const nodeId = this.queue[this._head++]!;
    this._emitted++;
    for (const neighbor of graph.outgoingNeighbors(nodeId)) {
      // 跳过孤儿邻居（不在 nodeIds 拓扑空间内的节点）。否则会因 `?? 1 - 1 = 0`
      // 把它意外纳入队列，最终被 next() 输出。
      const current = this._pending.get(neighbor);
      if (current === undefined) continue;
      const remaining = current - 1;
      this._pending.set(neighbor, remaining);
      if (remaining === 0) this.queue.push(neighbor);
    }
    return nodeId;
  }

  /**
   * 适配为可迭代对象。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   */
  public iter<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    const self = this;
    const iter: IterableIterator<NodeId> = {
      [Symbol.iterator]() {
        return iter;
      },
      next() {
        const value = self.next(graph);
        return value === undefined
          ? { value: undefined as unknown as NodeId, done: true }
          : { value, done: false };
      },
    };
    return iter;
  }

  /** 当前已输出节点数 < 总数时即存在环；返回剩余的环上节点。 */
  public cycleNodes(): NodeId[] {
    if (this._emitted >= this._total) return [];
    const remaining: NodeId[] = [];
    for (const [nodeId, degree] of this._pending) {
      if (degree > 0) remaining.push(nodeId);
    }
    return remaining;
  }

  /** 一次性 drain 出全部拓扑序与环路信息（与 algorithms.topology 等价）。 */
  public collect<G extends Neighbors>(graph: G): Topology {
    const order: NodeId[] = [];
    while (true) {
      const next = this.next(graph);
      if (next === undefined) break;
      order.push(next);
    }
    const cycleNodes = this.cycleNodes();
    if (cycleNodes.length > 0) order.push(...cycleNodes);
    return {
      order,
      cycles: { hasCycle: cycleNodes.length > 0, cycleNodes },
    };
  }
}

/**
 * DFS 访问者回调集合。
 *
 * @remarks 任意回调可省略；返回 {@link Control} 决定遍历继续 / 剪枝 / 中止。
 */
export interface DfsVisitor {
  /** 节点首次进入栈，准备访问其后继。 */
  discover?(event: DfsEvent): Control | void;
  /** 节点的所有后继都访问完毕，回溯前调用。 */
  finish?(event: DfsEvent): Control | void;
  /** 树边：从已 discover 但未 finish 的节点指向尚未 discover 的节点。 */
  treeEdge?(event: DfsEvent): Control | void;
  /** 后向边：指向当前 DFS 栈中的节点（环的指示）。 */
  backEdge?(event: DfsEvent): Control | void;
  /** 横向 / 前向边：指向已 finish 的节点。 */
  crossForwardEdge?(event: DfsEvent): Control | void;
}

/**
 * 事件回调风格的 DFS。
 *
 * @remarks
 * - 状态：每个节点处于 `白色`(未访问) / `灰色`(在栈上) / `黑色`(已 finish) 三态；
 * - 边事件根据邻居颜色派发为 treeEdge / backEdge / crossForwardEdge；
 * - 任意回调返回 `'break'` 立即中止整次遍历并返回 `'break'`，否则返回最终的 {@link Control}。
 *
 * @template G 实现 {@link Catalog} + {@link Neighbors} 的图类型
 * @param graph 图实例
 * @param starts 起点节点序列；若省略则按 `graph.nodeIds` 全图扫描
 * @param visitor 回调集合
 * @returns 整体控制流结果
 */
export function dfsVisit<G extends Catalog & Neighbors>(
  graph: G,
  starts: Iterable<NodeId> | null,
  visitor: DfsVisitor,
): Control {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<NodeId, number>();
  let timer = 0;

  type Frame = { node: NodeId; iter: Iterator<NodeId> };
  const stack: Frame[] = [];

  const push = (node: NodeId): Control => {
    color.set(node, GRAY);
    const result = visitor.discover?.({ kind: 'discover', node, time: timer++ }) ?? 'continue';
    if (result === 'break') return 'break';
    if (result === 'prune') {
      // discover 通过、立即 finish。
      color.set(node, BLACK);
      return visitor.finish?.({ kind: 'finish', node, time: timer++ }) ?? 'continue';
    }
    stack.push({ node, iter: graph.outgoingNeighbors(node)[Symbol.iterator]() });
    return 'continue';
  };

  const roots = starts ?? graph.nodeIds;
  for (const root of roots) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    if (push(root) === 'break') return 'break';

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.iter.next();

      if (next.done) {
        color.set(frame.node, BLACK);
        const result =
          visitor.finish?.({ kind: 'finish', node: frame.node, time: timer++ }) ?? 'continue';
        stack.pop();
        if (result === 'break') return 'break';
        continue;
      }

      const target = next.value;
      const targetColor = color.get(target) ?? WHITE;

      if (targetColor === WHITE) {
        const result =
          visitor.treeEdge?.({ kind: 'treeEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
        if (result === 'prune') continue;
        if (push(target) === 'break') return 'break';
      } else if (targetColor === GRAY) {
        const result =
          visitor.backEdge?.({ kind: 'backEdge', node: frame.node, target }) ?? 'continue';
        if (result === 'break') return 'break';
      } else {
        const result =
          visitor.crossForwardEdge?.({
            kind: 'crossForwardEdge',
            node: frame.node,
            target,
          }) ?? 'continue';
        if (result === 'break') return 'break';
      }
    }
  }

  return 'continue';
}

