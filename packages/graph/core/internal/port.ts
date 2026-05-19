/**
 * 端口字典通用助手：classic 与 serialize 共享，避免在多个文件里重复同一段端口遍历逻辑。
 *
 * @internal
 */

// 仅类型 import：internal ↔ classic（barrel 中含 Graph，Graph 又依赖 internal）
// 构成循环；只有保持 `import type` 才能让 TS 擦除消解，不可升级为值 import。
import type { Socket } from '../classic';
import type { PortId } from '../types';

/** 端口字典最小契约：键 → 端口（含 id 与 socket）。 */
type Dict<P extends { id: PortId; socket: Socket } = { id: PortId; socket: Socket }> = {
  readonly [key: string]: P | undefined;
};

/** 压缩格式中单个端口的元组形态：`[name, portId, socketName]`。 */
type Tuple = [string, PortId, string];

/**
 * 在端口字典中按 ID 线性查找。
 *
 * @remarks 端口字典是 "name → port" 的稀疏对象；ID 不是键，需要遍历比对。
 */
export function lookupPort<P extends { id: PortId }>(
  ports: { readonly [key: string]: P | undefined },
  id: PortId,
): P | undefined {
  for (const key in ports) {
    const port = ports[key];
    if (port && port.id === id) return port;
  }
  return undefined;
}

/**
 * 把端口字典压成紧凑元组数组（`[name, portId, socketName][]`）；空字典返回 `null`。
 *
 * @param ports 端口字典
 * @param forward 可选的 ID 重映射表：原始 PortId → 紧凑 PortId
 */
export function compactPorts(
  ports: Dict,
  forward?: ReadonlyMap<string, string>,
): ReadonlyArray<Tuple> | null {
  const result: Tuple[] = [];
  for (const name in ports) {
    const port = ports[name];
    if (!port) continue;
    const id = forward ? (forward.get(String(port.id))! as PortId) : port.id;
    result.push([name, id, port.socket.name]);
  }
  return result.length > 0 ? result : null;
}

/**
 * 把端口字典序列化为 GraphJson 风格的对象：`{ portName: { id, socket } | null }`。
 */
export function portsJson(
  ports: Dict,
): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const name in ports) {
    const port = ports[name];
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}
