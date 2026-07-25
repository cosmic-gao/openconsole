/**
 * 配对堆句柄：`push` 的返回值，可长期持有用于后续 `update` / `delete`。
 *
 * @remarks 只暴露 `value`——树指针是实现细节，外部无法借句柄改坏堆结构。
 *   元素出堆后句柄失效，对失效句柄调用 `update` / `delete` 返回 `false`。
 */
export interface PairingNode<T> {
  readonly value: T;
}

/**
 * 内部节点：句柄加三个树指针。`child` 指向首个子节点，`next` 指向下一个兄弟，
 * `prev` 在节点为首个子节点时指向父节点、否则指向左兄弟——省掉了每节点一个 parent 指针。
 *
 * @remarks 由此得到贯穿实现的不变式：**根节点 `prev` 为 `null`，在树中的非根节点
 *   `prev` 必非 `null`**。{@link attached} 靠它 O(1) 判断句柄是否仍在堆内。
 */
export interface Linked<T> extends PairingNode<T> {
  value: T;
  child: Linked<T> | null;
  next: Linked<T> | null;
  prev: Linked<T> | null;
}

export function create<T>(value: T): Linked<T> {
  return { value, child: null, next: null, prev: null };
}

/**
 * 句柄 → 内部节点：句柄只能由 {@link create} 产生，运行时形态就是 {@link Linked}。
 * 公开类型刻意收窄成只读视图，故这里是全包唯一一处断言。
 */
export function unwrap<T>(handle: PairingNode<T>): Linked<T> {
  return handle as Linked<T>;
}

/** 节点是否仍挂在堆上；依赖 prev 不变式，O(1)。 */
export function attached<T>(node: Linked<T>, root: Linked<T> | null): boolean {
  return node === root || node.prev !== null;
}

/** 把 `node` 从父 / 兄弟链中摘除，保留其子树。 */
export function detach<T>(node: Linked<T>): void {
  const prev = node.prev;
  const next = node.next;

  if (prev !== null) {
    if (prev.child === node) prev.child = next;
    else prev.next = next;
  }
  if (next !== null) next.prev = prev;

  node.prev = null;
  node.next = null;
}

/** 清掉全部指针，避免被移出的节点拖住已合并的子树。 */
export function isolate<T>(node: Linked<T>): void {
  node.child = null;
  node.next = null;
  node.prev = null;
}
