/**
 * 比较器：返回负数表示 `a` 应排在 `b` 之前，正数表示之后，0 表示等价。
 * 最小堆默认按比较器升序排列（栈顶为最小元素）。
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * 基于数组的二叉堆。维护 `value -> index` 索引，使 {@link BinaryHeap.delete}、
 * {@link BinaryHeap.has} 摊销 O(log n)。
 *
 * @remarks
 * 索引表以 `SameValueZero` 比较键，若两个元素被视作"同值"（例如相等的原语），
 * 后入元素会覆盖先入元素的索引并导致 {@link BinaryHeap.delete} 误删；
 * 需要稳定句柄时请使用对象引用。
 */
export class BinaryHeap<T> {
  public readonly heap: T[] = [];

  protected readonly indices: Map<T, number> = new Map();

  public get size(): number {
    return this.heap.length;
  }

  public constructor(protected readonly comparator: Comparator<T>) { }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public poll(): T | undefined {
    if (this.heap.length === 0) return undefined;
    return this.deleteAt(0);
  }

  public push(...nodes: T[]): number {
    const count = nodes.length;
    if (count === 0) return this.heap.length;

    if (count === 1) {
      const node = nodes[0]!;
      const index = this.heap.length;
      this.heap.push(node);
      this.indices.set(node, index);
      this.heapifyUp(index);
      return this.heap.length;
    }

    // 批量追加：避免 `Array.push(...nodes)` 在极大数组上触发栈深溢出，
    // 同时把索引登记合并进单趟遍历。
    const start = this.heap.length;
    for (let i = 0; i < count; i++) {
      const node = nodes[i]!;
      this.heap.push(node);
      this.indices.set(node, start + i);
    }

    // Floyd build-heap：自下而上 sift-down，整体 O(n) 重建。
    for (let i = (this.heap.length >> 1) - 1; i >= 0; i--) {
      this.heapifyDown(i);
    }

    return this.heap.length;
  }

  public replace(node: T): T | undefined {
    if (this.heap.length === 0) {
      this.heap.push(node);
      this.indices.set(node, 0);
      return undefined;
    }

    const top = this.heap[0]!;
    this.indices.delete(top);
    this.heap[0] = node;
    this.indices.set(node, 0);
    this.heapifyDown(0);

    return top;
  }

  public delete(node: T): boolean {
    const index = this.indices.get(node);
    if (index === undefined) return false;
    this.deleteAt(index);
    return true;
  }

  public has(node: T): boolean {
    return this.indices.has(node);
  }

  public clear(): void {
    this.heap.length = 0;
    this.indices.clear();
  }

  public empty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Sift-up：缓存待调整元素，逐层下移祖先后单次写回。
   * 相比逐对交换，写次数减半（O(log n) → O(log n) 次写，但常数 ~1/2）。
   */
  protected heapifyUp(index: number = this.heap.length - 1): void {
    const node = this.heap[index]!;

    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      const parent = this.heap[parentIndex]!;
      if (this.comparator(node, parent) >= 0) break;

      this.heap[index] = parent;
      this.indices.set(parent, index);
      index = parentIndex;
    }

    this.heap[index] = node;
    this.indices.set(node, index);
  }

  /**
   * Sift-down：与 {@link BinaryHeap.heapifyUp} 对称。
   */
  protected heapifyDown(index: number = 0): void {
    const node = this.heap[index]!;
    const length = this.heap.length;
    const halfIndex = length >> 1;

    while (index < halfIndex) {
      let smallestIndex = (index << 1) + 1;
      const rightIndex = smallestIndex + 1;

      if (rightIndex < length && this.comparator(this.heap[rightIndex]!, this.heap[smallestIndex]!) < 0) {
        smallestIndex = rightIndex;
      }

      const smallest = this.heap[smallestIndex]!;
      if (this.comparator(node, smallest) <= 0) break;

      this.heap[index] = smallest;
      this.indices.set(smallest, index);
      index = smallestIndex;
    }

    this.heap[index] = node;
    this.indices.set(node, index);
  }

  protected deleteAt(index: number = 0): T {
    const lastIndex = this.heap.length - 1;
    const removed = this.heap[index]!;
    this.indices.delete(removed);

    if (index === lastIndex) {
      this.heap.pop();
      return removed;
    }

    const last = this.heap.pop()!;
    this.heap[index] = last;
    this.indices.set(last, index);

    const parentIndex = (index - 1) >> 1;
    if (index > 0 && this.comparator(last, this.heap[parentIndex]!) < 0) {
      this.heapifyUp(index);
    } else {
      this.heapifyDown(index);
    }

    return removed;
  }
}

/**
 * Fibonacci heap 占位实现：API 与其它堆保持一致，调用构造函数会抛出错误。
 *
 * @internal 实现待补全。
 */
export class FibonacciHeap<T> {
  public constructor(_comparator: Comparator<T>) {
    throw new Error("FibonacciHeap is not implemented yet.");
  }
}

export type Nullable<T> = T | null;

export type NullableNode<T> = Nullable<PairingNode<T>>;

/**
 * 配对堆节点。`child` 指向第一个子节点；`next` 指向同层下一个兄弟；
 * `prev` 在节点为父的"第一个子节点"时指向父节点，否则指向左兄弟。
 * 这一编码避免了额外的 parent 指针，所有更新均 O(1)。
 */
export interface PairingNode<T> {
  value: T;
  child: NullableNode<T>;
  next: NullableNode<T>;
  prev: NullableNode<T>;
}

/**
 * 配对堆 (pairing heap)。`push`/`peek` 为 O(1)，`poll`/`delete`/`update`
 * 摊销 O(log n)。{@link PairingHeap.push} 返回的节点可作为稳定句柄
 * 用于后续 {@link PairingHeap.delete}、{@link PairingHeap.update}，
 * 即便 `update` 触发 increase-key，节点引用也不会失效。
 */
export class PairingHeap<T> {
  private _size: number = 0;
  private root: NullableNode<T> = null;

  public get size(): number {
    return this._size;
  }

  public constructor(protected readonly comparator: Comparator<T>) { }

  public push(value: T): PairingNode<T> {
    const node: PairingNode<T> = { value, child: null, next: null, prev: null };
    this.root = this.meld(this.root, node);
    this._size++;
    return node;
  }

  public peek(): T | undefined {
    return this.root?.value;
  }

  public poll(): T | undefined {
    const top = this.root;
    if (!top) return undefined;

    this.root = this.collapse(top.child);
    if (this.root) this.root.prev = null;

    // 解除引用避免被弹出的节点拖住已合并子树。
    top.child = null;
    top.next = null;
    top.prev = null;
    this._size--;
    return top.value;
  }

  public delete(node: PairingNode<T>): boolean {
    if (!node) return false;

    if (node === this.root) {
      this.poll();
      return true;
    }

    this.detach(node);

    const merged = this.collapse(node.child);
    if (merged) merged.prev = null;

    node.child = null;

    this.root = this.meld(this.root, merged);
    this._size--;
    return true;
  }

  /**
   * 将 `node` 的值更新为 `value`：
   *  - 值减小走标准 decrease-key（detach + meld）；
   *  - 值增大保留同一节点引用，等价于"原地" delete + reinsert，
   *    调用方持有的 {@link PairingNode} 句柄在调用前后始终有效。
   */
  public update(node: PairingNode<T>, value: T): void {
    const cmp = this.comparator(value, node.value);
    node.value = value;

    if (cmp === 0) return;

    if (cmp < 0) {
      if (node !== this.root) {
        this.detach(node);
        this.root = this.meld(this.root, node);
      }
      return;
    }

    // Increase-key：剥离子树后将 `node` 作为单点重新并入。
    const children = this.collapse(node.child);
    node.child = null;
    if (children) children.prev = null;

    if (node === this.root) {
      this.root = this.meld(children, node);
      return;
    }

    this.detach(node);
    this.root = this.meld(this.root, this.meld(children, node));
  }

  public clear(): void {
    this.root = null;
    this._size = 0;
  }

  public empty(): boolean {
    return this._size === 0;
  }

  private detach(node: PairingNode<T>): void {
    const prev = node.prev;
    const next = node.next;

    if (prev) {
      // prev.child === node 表示 node 是 prev 的首个子节点；否则 prev 是左兄弟。
      if (prev.child === node) {
        prev.child = next;
      } else {
        prev.next = next;
      }
    }
    if (next) next.prev = prev;

    node.prev = null;
    node.next = null;
  }

  private meld(a: NullableNode<T>, b: NullableNode<T>): NullableNode<T> {
    if (!a) return b;
    if (!b) return a;

    if (this.comparator(a.value, b.value) > 0) {
      b.prev = null;
      a.prev = b;
      a.next = b.child;
      if (b.child) b.child.prev = a;
      b.child = a;
      return b;
    }

    a.prev = null;
    b.prev = a;
    b.next = a.child;
    if (a.child) a.child.prev = b;
    a.child = b;
    return a;
  }

  /**
   * 两阶段配对合并：
   *  1. 左到右两两 meld 得到一串子树（暂用 `prev` 串成单链）；
   *  2. 自右向左累积 meld 得到单一根。
   * 这是 pairing heap 摊销 O(log n) 的关键路径。
   */
  private collapse(node: NullableNode<T>): NullableNode<T> {
    if (!node) return null;

    let tail: NullableNode<T> = null;
    let a: PairingNode<T>;
    let b: NullableNode<T>;
    let next: NullableNode<T> = node;
    let result: NullableNode<T> = null;

    while (next) {
      a = next;
      b = a.next;
      if (b) {
        next = b.next;
        a.next = null;
        b.next = null;
        const merged = this.meld(a, b);
        merged!.prev = tail;
        tail = merged;
      } else {
        a.prev = tail;
        tail = a;
        break;
      }
    }

    while (tail) {
      next = tail.prev;
      tail.prev = null;
      result = this.meld(result, tail);
      tail = next;
    }

    return result;
  }
}
