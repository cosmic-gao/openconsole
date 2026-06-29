import type { Direction, EdgeId, PortId } from '../types';
import type { Socket } from './socket';

export abstract class Port<S extends Socket = Socket> {
  public abstract readonly direction: Direction;

  public readonly edges: EdgeId[] = [];

  private readonly _index = new Map<EdgeId, number>();

  protected constructor(
    public readonly socket: S,
    public readonly id: PortId,
  ) {}

  public get connected(): boolean {
    return this.edges.length > 0;
  }

  public attach(edge: EdgeId): boolean {
    if (this._index.has(edge)) return false;
    this._index.set(edge, this.edges.length);
    this.edges.push(edge);
    return true;
  }

  public detach(edge: EdgeId): boolean {
    const index = this._index.get(edge);
    if (index === undefined) return false;
    const lastIndex = this.edges.length - 1;
    if (index !== lastIndex) {
      const last = this.edges[lastIndex]!;
      this.edges[index] = last;
      this._index.set(last, index);
    }
    this.edges.pop();
    this._index.delete(edge);
    return true;
  }

  public clear(): void {
    this.edges.length = 0;
    this._index.clear();
  }
}

export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction = 'input' as const;

  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction = 'output' as const;

  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}
