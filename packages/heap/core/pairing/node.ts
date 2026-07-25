/**
 * 配对堆句柄：{@link PairingHeap.push} 的返回值，可长期持有，用于后续
 * {@link PairingHeap.update} / {@link PairingHeap.delete}。
 *
 * @remarks 只暴露 `value`（只读）——树指针是实现细节，不进入公开类型，
 *   外部无法借句柄改坏堆结构。句柄在元素被 `poll` / `delete` 移出堆后即失效，
 *   对失效句柄调用 `update` / `delete` 会返回 `false` 而不是破坏堆。
 *
 * @typeParam T - 元素类型
 */
export interface PairingNode<T> {
  /** 当前值；`update` 后同步更新。 */
  readonly value: T;
}

/**
 * 内部节点：在句柄之上带三个树指针。
 *
 * @remarks `child` 指向第一个子节点；`next` 指向同层下一个兄弟；
 *   `prev` 在节点为父的「第一个子节点」时指向父节点，否则指向左兄弟。
 *   这一编码省掉了每节点一个 parent 指针，且所有指针更新都是 O(1)。
 *
 *   由此得到一条贯穿实现的不变式：**根节点的 `prev` 为 `null`，
 *   而在树中的非根节点 `prev` 必非 `null`**——{@link attached} 就是靠它
 *   O(1) 判断句柄是否仍在堆内。
 */
export interface Linked<T> extends PairingNode<T> {
  value: T;
  child: Linked<T> | null;
  next: Linked<T> | null;
  prev: Linked<T> | null;
}

/** 新建一个孤立节点。 */
export function create<T>(value: T): Linked<T> {
  return { value, child: null, next: null, prev: null };
}

/**
 * 句柄 → 内部节点。
 *
 * @remarks 句柄只能由 {@link create} 产生，运行时形态就是 {@link Linked}；
 *   公开类型刻意收窄成只读视图，故这里是整个包唯一一处必要断言。
 */
export function unwrap<T>(handle: PairingNode<T>): Linked<T> {
  return handle as Linked<T>;
}

/**
 * 判断节点是否仍挂在堆上（`root` 需单独传入，它是唯一 `prev` 为 null 的在堆节点）。
 *
 * @remarks 依赖 {@link Linked} 的 prev 不变式，O(1)。既能挡住重复 `delete`，
 *   也能挡住对已 `poll` 出的句柄再做 `update`。
 */
export function attached<T>(node: Linked<T>, root: Linked<T> | null): boolean {
  return node === root || node.prev !== null;
}

/**
 * 把 `node` 从其父 / 兄弟链中摘除，保留其子树。
 */
export function detach<T>(node: Linked<T>): void {
  const prev = node.prev;
  const next = node.next;

  if (prev !== null) {
    // prev.child === node 表示 node 是 prev 的首个子节点，否则 prev 是左兄弟。
    if (prev.child === node) prev.child = next;
    else prev.next = next;
  }
  if (next !== null) next.prev = prev;

  node.prev = null;
  node.next = null;
}

/** 清掉节点的全部指针，避免被移出的节点拖住已合并的子树。 */
export function isolate<T>(node: Linked<T>): void {
  node.child = null;
  node.next = null;
  node.prev = null;
}
