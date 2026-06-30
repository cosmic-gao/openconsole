import type { Port } from "../classic";
import type { JsonPort, PortId, Ports } from "../types";

export interface PortConstraints {
  m?: boolean;
  r?: boolean;
  f?: unknown;
}

export type PortTuple =
  | [string, PortId, string]
  | [string, PortId, string, PortConstraints];

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

export function compactPorts(
  ports: Ports,
  forward?: ReadonlyMap<string, string>,
): ReadonlyArray<PortTuple> | null {
  const result: PortTuple[] = [];
  for (const name in ports) {
    const port = ports[name];
    if (!port) continue;
    const id = forward ? (forward.get(String(port.id))! as PortId) : port.id;
    const c: PortConstraints = {};
    if (!port.multiple) c.m = false;
    if (port.required) c.r = true;
    if (port.fallback !== undefined) c.f = port.fallback;
    result.push(
      c.m !== undefined || c.r !== undefined || c.f !== undefined
        ? [name, id, port.socket.name, c]
        : [name, id, port.socket.name],
    );
  }
  return result.length > 0 ? result : null;
}

export function portsJson(ports: Ports): Record<string, JsonPort | null> {
  const result: Record<string, JsonPort | null> = {};
  for (const name in ports) {
    const port = ports[name];
    if (!port) {
      result[name] = null;
      continue;
    }
    const entry: {
      id: PortId;
      socket: string;
      multiple?: boolean;
      required?: boolean;
      fallback?: unknown;
    } = { id: port.id, socket: port.socket.name };
    if (!port.multiple) entry.multiple = false;
    if (port.required) entry.required = true;
    if (port.fallback !== undefined) entry.fallback = port.fallback;
    result[name] = entry;
  }
  return result;
}
