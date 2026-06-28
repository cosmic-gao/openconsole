import type { NodeId, PortId } from '../types';
import type { Port } from './port';
import type { Vertex } from './vertex';

export class Endpoint<N extends Vertex = Vertex, P extends Port = Port> {
  public constructor(
    public readonly node: N,
    public readonly port: P,
  ) {}

  public get nodeId(): NodeId {
    return this.node.id;
  }

  public get portId(): PortId {
    return this.port.id;
  }
}
