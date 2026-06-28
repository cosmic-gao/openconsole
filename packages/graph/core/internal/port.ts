import type { Port } from '../classic';
import type { Ports, PortId } from '../types';

type Tuple = [string, PortId, string];

export function lookupPort<P extends Port>(ports: Ports<P>, id: PortId): P | undefined {
  for (const key in ports) {
    const port = ports[key];
    if (port && port.id === id) return port;
  }
  return undefined;
}

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

export function portsJson(ports: Ports): Record<string, { id: PortId; socket: string } | null> {
  const result: Record<string, { id: PortId; socket: string } | null> = {};
  for (const name in ports) {
    const port = ports[name];
    result[name] = port ? { id: port.id, socket: port.socket.name } : null;
  }
  return result;
}
