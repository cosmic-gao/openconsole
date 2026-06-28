import type { NodeId } from '../types';

export class Registry {
  private readonly _order: NodeId[] = [];
  private readonly _index = new Map<NodeId, number>();

  public add(node: NodeId): number {
    const index = this._order.length;
    this._index.set(node, index);
    this._order.push(node);
    return index;
  }

  public remove(node: NodeId): boolean {
    const index = this._index.get(node);
    if (index === undefined) return false;
    const lastIndex = this._order.length - 1;
    if (index !== lastIndex) {
      const last = this._order[lastIndex]!;
      this._order[index] = last;
      this._index.set(last, index);
    }
    this._order.pop();
    this._index.delete(node);
    return true;
  }

  public bound(): number {
    return this._order.length;
  }

  public at(index: number): NodeId | undefined {
    return this._order[index];
  }

  public indexOf(node: NodeId): number {
    return this._index.get(node) ?? -1;
  }

  public clear(): void {
    this._order.length = 0;
    this._index.clear();
  }
}
