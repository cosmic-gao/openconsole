import { Socket } from '../classic';

export type SocketLookup = ReadonlyMap<string, Socket> | ReadonlyArray<Socket>;

export const BUILTINS: ReadonlyMap<string, Socket> = new Map<string, Socket>([
  ['number', Socket.number],
  ['string', Socket.string],
  ['boolean', Socket.boolean],
  ['object', Socket.object],
  ['array', Socket.array],
  ['exec', Socket.exec],
  ['*', Socket.any],
]);

export function mergeLookup(custom?: SocketLookup): ReadonlyMap<string, Socket> {
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
