/**
 * 稳定索引分配器：键与整数索引的双向映射。删除留下的空位进入自由表等待复用，
 * 已分配的索引在 {@link Slots.compact} 之前永不移动，外部持有的索引不会静默改指。
 */
export class Slots<K> {
  private readonly _index = new Map<K, number>();
  private readonly _keys: Array<K | undefined> = [];
  private readonly _free: number[] = [];

  public get size(): number {
    return this._index.size;
  }

  /** 索引上界，含尚未回收的空位。 */
  public get bound(): number {
    return this._keys.length;
  }

  /** 分配索引；键已存在时返回其现有索引。 */
  public add(key: K): number {
    const existing = this._index.get(key);
    if (existing !== undefined) return existing;
    const index = this._free.pop() ?? this._keys.length;
    this._keys[index] = key;
    this._index.set(key, index);
    return index;
  }

  /** 释放键占用的索引；键不存在返回 -1。 */
  public remove(key: K): number {
    const index = this._index.get(key);
    if (index === undefined) return -1;
    this._keys[index] = undefined;
    this._index.delete(key);
    this._free.push(index);
    return index;
  }

  public indexOf(key: K): number {
    return this._index.get(key) ?? -1;
  }

  /** 外部查询用：空位或越界返回 `undefined`。 */
  public at(index: number): K | undefined {
    return this._keys[index];
  }

  /**
   * 内部用：索引取自已登记的槽位，取不到属于程序错误而非查询失败。
   * 不变量收在一处，调用点就不必写非空断言。
   */
  public key(index: number): K {
    const found = this._keys[index];
    if (found === undefined) {
      throw new RangeError(`slot ${index} is empty or out of range`);
    }
    return found;
  }

  public has(key: K): boolean {
    return this._index.has(key);
  }

  public keys(): IterableIterator<K> {
    return this._index.keys();
  }

  public clear(): void {
    this._index.clear();
    this._keys.length = 0;
    this._free.length = 0;
  }

  /**
   * 消除空位并重新稠密编号。
   *
   * @returns 旧索引到新索引的映射，空位为 -1；调用方须据此重排自己的平行数组。
   */
  public compact(): Int32Array {
    const remap = new Int32Array(this._keys.length).fill(-1);
    let next = 0;
    for (let i = 0; i < this._keys.length; i++) {
      const key = this._keys[i];
      if (key === undefined) continue;
      remap[i] = next;
      this._keys[next] = key;
      this._index.set(key, next);
      next++;
    }
    this._keys.length = next;
    this._free.length = 0;
    return remap;
  }
}

/** 按 {@link Slots.compact} 的映射原地压缩平行数组。 */
export function gather<T>(list: T[], remap: Int32Array, length: number): void {
  for (let i = 0; i < remap.length; i++) {
    const to = remap[i]!;
    if (to >= 0) list[to] = list[i]!;
  }
  list.length = length;
}
