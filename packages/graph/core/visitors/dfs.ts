/**
 * DFS 家族：状态化 {@link Dfs} / {@link DfsPostorder} 与事件回调式 {@link dfsVisit}。
 */

import type {
  Catalog,
  Control,
  DfsEvent,
  Neighbors,
  NodeId,
} from '../types';
import { asIterator } from './iterator';

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
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return asIterator(() => this.next(graph));
  }
}

/**
 * DFS 后序状态化遍历器（迭代实现，可暂停 / 恢复）。
 *
 * @remarks
 * - 每个 `next(graph)` 调用返回下一个 finish 节点；
 * - 后序意味着节点在所有后代访问完成后才被产出，逆后序天然就是 DAG 的拓扑序；
 * - 内部维护栈帧 `(node, neighbors)`，无递归调用，深图也不会栈溢出。
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
  public readonly stack: Array<{ node: NodeId; neighbors: Iterator<NodeId> }>;

  /** 已 discover 的节点集合(含已 finish)。 */
  public readonly discovered: Set<NodeId>;

  /** 已 finish 的节点集合。 */
  public readonly finished: Set<NodeId>;

  /** 待 lazy 推入栈的起点(首次 `next()` 时消费)。 */
  private _initial: NodeId | undefined;

  /**
   * @param start 起点节点 ID(lazy 入栈，等到首次 `next(graph)` 时再用 graph 拿迭代器)
   */
  public constructor(start?: NodeId) {
    this.stack = [];
    this.discovered = new Set();
    this.finished = new Set();
    this._initial = start;
  }

  /**
   * 工厂方法：从指定起点构造遍历器(即时入栈，直接持有 graph 拿到的子迭代器)。
   *
   * @template G 实现 {@link Neighbors} 的图类型
   * @param graph 图实例
   * @param start 起点节点 ID
   */
  public static start<G extends Neighbors>(graph: G, start: NodeId): DfsPostorder {
    const instance = new DfsPostorder();
    instance.discovered.add(start);
    instance.stack.push({ node: start, neighbors: graph.outgoingNeighbors(start)[Symbol.iterator]() });
    return instance;
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
      this.stack.push({ node: start, neighbors: graph.outgoingNeighbors(start)[Symbol.iterator]() });
    }

    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1]!;

      let pushed = false;
      while (true) {
        const step = frame.neighbors.next();
        if (step.done) break;
        const child = step.value;
        if (this.discovered.has(child)) continue;
        this.discovered.add(child);
        this.stack.push({
          node: child,
          neighbors: graph.outgoingNeighbors(child)[Symbol.iterator](),
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
   * 跳转到新的起点(保留 discovered / finished 集合)。
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
  public iterator<G extends Neighbors>(graph: G): IterableIterator<NodeId> {
    return asIterator(() => this.next(graph));
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
  /** 后向边：指向当前 DFS 栈中的节点(环的指示)。 */
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

  type Frame = { node: NodeId; neighbors: Iterator<NodeId> };
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
    stack.push({ node, neighbors: graph.outgoingNeighbors(node)[Symbol.iterator]() });
    return 'continue';
  };

  const roots = starts ?? graph.nodeIds;
  for (const root of roots) {
    if ((color.get(root) ?? WHITE) !== WHITE) continue;
    if (push(root) === 'break') return 'break';

    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const next = frame.neighbors.next();

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
