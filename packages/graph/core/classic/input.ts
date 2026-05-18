/**
 * Input：fan-in 方向的 Port 实现。
 */

import type { PortId } from '../types';
import { Port } from './port';
import type { Socket } from './socket';

/**
 * 输入端口（fan-in）。
 *
 * @template S 关联的 Socket 类型
 */
export class Input<S extends Socket = Socket> extends Port<S> {
  public readonly direction: 'input' = 'input';

  /**
   * @param socket 端口承载的 Socket
   * @param id 端口唯一标识
   */
  public constructor(socket: S, id: PortId) {
    super(socket, id);
  }
}
