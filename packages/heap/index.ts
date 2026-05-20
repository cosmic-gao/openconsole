export type Comparator<T> = (a: T, b: T) => number;

export class BinaryHeap<T> {
  public readonly heap: T[] = []

  protected readonly indices: Map<T, number> = new Map()

  public get size(): number {
    return this.heap.length
  }

  public constructor(protected readonly comparator: Comparator<T>) { }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public poll(): T | undefined {
    if (this.size === 0) return undefined;
    return this.deleteAt(0);
  }

  public push(...nodes: T[]): number {
    if (nodes.length === 0) return this.size;

    const lastIndex = this.size;
    this.heap.push(...nodes);

    if (nodes.length === 1) {
      this.indices.set(nodes[0], lastIndex);
      this.heapifyUp(lastIndex);
      return this.size;
    }

    for (let i = (this.size >> 1) - 1; i >= 0; i--) {
      this.heapifyDown(i);
    }

    for (let i = lastIndex; i < this.size; i++) {
      this.indices.set(this.heap[i], i);
    }

    return this.size;
  }

  public replace(node: T): T | undefined {
    if (this.size === 0) {
      this.heap.push(node);
      this.indices.set(node, 0);
      return undefined;
    }

    const top = this.heap[0];
    this.indices.delete(top);
    this.heap[0] = node;
    this.indices.set(node, 0);
    this.heapifyDown();

    return top;
  }

  public delete(node: T): boolean {
    const index = this.indices.get(node);
    if (index === undefined) return false;
    this.deleteAt(index);
    return true;
  }

  public has(node: T) {
    return this.indices.has(node);
  }

  public clear(): void {
    this.heap.length = 0;
    this.indices.clear();
  }

  public empty(): boolean {
    return this.size === 0
  }

  protected heapifyUp(index: number = this.size - 1): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.comparator(this.heap[index], this.heap[parentIndex]) >= 0) break;

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  protected heapifyDown(index: number = 0): void {
    const halfIndex = this.size >> 1;

    while (index < halfIndex) {
      let leftIndex = (index << 1) + 1;
      let rightIndex = leftIndex + 1;
      let smallestIndex = leftIndex;

      if (rightIndex < this.size && this.comparator(this.heap[rightIndex], this.heap[leftIndex]) < 0) {
        smallestIndex = rightIndex;
      }

      if (this.comparator(this.heap[index], this.heap[smallestIndex]) <= 0) break;

      this.swap(index, smallestIndex);
      index = smallestIndex;
    }
  }

  protected deleteAt(index: number = 0): T {
    const lastIndex = this.size - 1;
    const removed = this.heap[index];
    this.indices.delete(removed);

    if (index === lastIndex) {
      this.heap.pop();
      return removed;
    }

    const last = this.heap.pop()!;
    this.heap[index] = last;
    this.indices.set(last, index);

    const parentIndex = (index - 1) >> 1;
    if (index > 0 && this.comparator(this.heap[index], this.heap[parentIndex]) < 0) {
      this.heapifyUp(index);
    } else {
      this.heapifyDown(index);
    }

    return removed;
  }

  private swap(i: number, j: number): void {
    [this.heap[i], this.heap[j]] = [this.heap[j], this.heap[i]];

    this.indices.set(this.heap[i], i);
    this.indices.set(this.heap[j], j);
  }
}

export class FibonacciHeap<T> {

}

export type Nullable<T> = T | null;

export type NullableNode<T> = Nullable<PairingNode<T>>;

export interface PairingNode<T> {
  value: T;
  child: NullableNode<T>;
  next: NullableNode<T>;
  prev: NullableNode<T>;
}

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
    if (!this.root) return undefined

    const topValue = this.root.value;
    this.root = this.collapse(this.root.child);
    if (this.root) this.root.prev = null;
    this._size--;
    return topValue
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

    this.root = this.meld(this.root, merged);
    this._size--;
    return true
  }

  public update(node: PairingNode<T>, value: T): void {
    const cmp = this.comparator(value, node.value);
    node.value = value;

    if (cmp < 0) {
      if (node !== this.root) {
        this.detach(node);
        this.root = this.meld(this.root, node);
      }
    } else if (cmp > 0) {
      this.delete(node);
      this.push(value);
    }
  }

  public clear(): void {
    this.root = null;
    this._size = 0;
  }

  public empty(): boolean {
    return this.size === 0 && this.root === null
  }

  private detach(node: PairingNode<T>) {
    const prev = node.prev;
    const next = node.next;

    if (prev) {
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