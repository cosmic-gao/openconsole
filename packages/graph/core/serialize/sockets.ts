/**
 * Socket 名 → 实例的查找表助手；unpack 与 diff/apply 共享。
 */

import { Socket } from '../classic';

/** Socket 名称查找表（Map 或扁平数组皆可）。 */
export type SocketLookup = ReadonlyMap<string, Socket> | ReadonlyArray<Socket>;

/** 内置 Socket 名称 → 实例的查找表。 */
export const BUILTINS: ReadonlyMap<string, Socket> = new Map<string, Socket>([
  ['number', Socket.number],
  ['string', Socket.string],
  ['boolean', Socket.boolean],
  ['object', Socket.object],
  ['array', Socket.array],
  ['exec', Socket.exec],
  ['*', Socket.any],
]);

/**
 * 把内置 Socket 表与用户自定义表合并；用户表同名 Socket 会覆盖内置版本。
 */
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
