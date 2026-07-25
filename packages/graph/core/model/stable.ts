import { Graph } from "./graph";
import { StableRegistry, type Indexer } from "./registry";

/**
 * 下标稳定的有向图：与 {@link Graph} 行为一致，但节点删除采用 free-list 空位复用，
 * 已分配的整数下标（{@link Graph.at} / {@link Graph.indexOf}）在删除后不会移动。
 *
 * 适合外部长期持有节点下标引用的场景（如 UI 选中态、缓存映射）。
 * 代价：`bound()` 计入空位、`at()` 可能返回 `undefined`；`copy` / `subgraph` / `union`
 * 仍返回普通 {@link Graph}（下标语义随之回到 swap-and-pop）。
 */
export class StableGraph<N = unknown, E = unknown> extends Graph<N, E> {
  protected override createRegistry(): Indexer {
    return new StableRegistry();
  }
}
