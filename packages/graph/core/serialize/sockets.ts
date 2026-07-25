import { Socket } from "../model";

/** Socket 查找表，可为按名称索引的 Map 或 Socket 数组。 */
export type SocketLookup = ReadonlyMap<string, Socket> | ReadonlyArray<Socket>;

/** 内置 Socket 类型查找表（number、string、boolean、object、array、exec、any）。 */
export const BUILTINS: ReadonlyMap<string, Socket> = new Map<string, Socket>([
  ["number", Socket.number],
  ["string", Socket.string],
  ["boolean", Socket.boolean],
  ["object", Socket.object],
  ["array", Socket.array],
  ["exec", Socket.exec],
  ["*", Socket.any],
]);

/** 将自定义 Socket 查找表与内置表合并，自定义项覆盖同名内置项。 */
export function mergeLookup(
  custom?: SocketLookup,
): ReadonlyMap<string, Socket> {
  if (!custom) return BUILTINS;
  const merged = new Map<string, Socket>(BUILTINS);
  if (Array.isArray(custom)) {
    for (const socket of custom) merged.set(socket.name, socket);
  } else {
    for (const [name, socket] of custom as ReadonlyMap<string, Socket>) {
      merged.set(name, socket);
    }
  }
  return merged;
}
