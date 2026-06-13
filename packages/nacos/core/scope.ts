import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<Headers>();

export function withRequestHeaders<T>(headers: Headers, fn: () => T): T {
  return store.run(headers, fn);
}

export function currentRequestHeaders(): Headers | null {
  return store.getStore() ?? null;
}
