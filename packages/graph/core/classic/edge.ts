import type { Direction, EdgeId, NodeId } from '../types';
import type { Endpoint } from './endpoint';

export class Edge<W = unknown> {
  public weight: W | undefined;

  public constructor(
    public readonly id: EdgeId,
    public readonly source: Endpoint,
    public readonly target: Endpoint,
    weight?: W,
  ) {
    this.weight = weight;
  }

  public get sourceId(): NodeId {
    return this.source.nodeId;
  }

  public get targetId(): NodeId {
    return this.target.nodeId;
  }

  public connects(node: NodeId): boolean {
    return this.source.nodeId === node || this.target.nodeId === node;
  }

  public opposite(direction: Direction): NodeId {
    return direction === 'input' ? this.source.nodeId : this.target.nodeId;
  }
}
