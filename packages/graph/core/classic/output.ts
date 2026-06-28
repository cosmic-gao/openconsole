import type { PortId } from '../types';
import { Port } from './port';
import type { Socket } from './socket';

export class Output<S extends Socket = Socket> extends Port<S> {
  public readonly direction = 'output' as const;

  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}
