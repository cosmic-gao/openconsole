/**
 * 端口字典通用助手：classic 与 serialize 共享，避免在多个文件里重复同一段端口遍历逻辑。
 *
 * @internal
 */

// 仅类型 import：internal ↔ classic（barrel 中含 Graph，Graph 又依赖 internal）
// 构成循环；只有保持 `import type` 才能让 TS 擦除消解，不可升级为值 import。
import type { Port } from '../classic';
import type { Ports, PortId } from '../types';

/** 压缩格式中单个端口的元组形态：`[name, portId, socketName]`。 */
type Tuple = [string, PortId, string];

/**
 * 在端口字典中按 ID 线性查找。
 *
 * @remarks 端口字典是 "name → port" 的稀疏对象；ID 不是键，需要遍历比对。
 *
 * @template P 端口具体类型（继承自 {@link Port}）
 * @param ports 端口字典
 * @param id 待查的端口 ID
 * @returns 命中的端口；未找到时返回 `undefined`
 */
export function lookupPort<P extends Port>(
  ports: Ports<P>,
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
 * @returns 紧凑元组数组；空字典返回 `null`
 */
export function compactPorts(
  ports: Ports,
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
 *
 * @param ports 端口字典
 * @returns `{ portName: { id, socket } | null }` 形态
 */
export function portsJson(
  ports: Ports,
): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const name in ports) {
    const port = ports[name];
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}
