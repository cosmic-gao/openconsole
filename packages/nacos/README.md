# @openclound/nacos

A small, opinionated Nacos client for Next.js 16+ apps. Bundles service
registry, discovery, load balancing, configuration center, and a fetch-style
HTTP client behind a single `create()` factory.

## Why

- **Open-out-of-the-box.** One `create({ ... })` wires registry, discovery,
  config and provider. No DI container, no decorators.
- **Next.js 16 native.** Ships a `/next` subpath with an idempotent `init()`
  for the `instrumentation.ts` hook and an HMR-safe singleton accessor.
- **`nacos://` URL convention.** `client.fetch('nacos://user-service/path')`
  resolves an instance via the configured balancer and falls back to
  `fetch()` semantics.
- **Pluggable balancers.** Built-ins: `weighted` (default), `round-robin`,
  `random`, `sticky`. Pass a custom `Balancer` for anything else.
- **Plugin pipeline.** `onRequest` / `onResponse` / `onError` interceptors.
  Built-in `logger` and `headers`; plug OpenTelemetry, auth, tracing.
- **Swappable backend.** `Registry` is an interface — the Nacos
  implementation is one swap from in-memory mocks for tests.

## Install

```bash
pnpm add @openclound/nacos nacos
```

## Quick start (Next.js 16+)

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { init } = await import('@openclound/nacos/next');
  const { logger } = await import('@openclound/nacos');

  await init(() => ({
    registry: {
      server: process.env.NACOS_SERVER!,
      namespace: process.env.NACOS_NAMESPACE,
      username: process.env.NACOS_USERNAME,
      password: process.env.NACOS_PASSWORD,
    },
    provider: {
      enabled: process.env.NACOS_ENABLE_DISCOVERY === 'true',
      service: 'nextjs-admin',
      port: Number(process.env.PORT ?? 3000),
      metadata: { version: process.env.APP_VERSION ?? 'dev' },
    },
    consumer: {
      balancer: 'weighted',
      timeout: 5_000,
      retry: { attempts: 3, delays: [100, 500, 1500] },
    },
    config: {
      sources: [{ dataId: 'app.json', key: 'app' }],
      tag: 'nacos:app',
    },
    plugins: [logger()],
  }));
}
```

Consume anywhere:

```ts
// app/dashboard/page.tsx
import { client } from '@openclound/nacos/next';

export default async function Page() {
  const users = client().service('user-service');
  const me = await users.get<{ id: string; name: string }>('/users/me');
  return <div>{me.name}</div>;
}
```

## Concepts

```
              ┌────────────────────┐
              │   Registry         │  ← Nacos SDK adapter
              │  (list/watch/read) │
              └─────────┬──────────┘
                        │
       ┌────────────────┼──────────────────┐
       │                │                  │
┌──────▼─────┐   ┌──────▼──────┐    ┌──────▼──────┐
│ Provider   │   │ Discovery   │    │ Config      │
│ (register) │   │ (cache+pick)│    │ (snapshot)  │
└────────────┘   └──────┬──────┘    └─────────────┘
                        │
                  ┌─────▼─────┐
                  │   Http    │  ← nacos:// + plugins
                  └───────────┘
```

## API

### `create(options)` → `Client`

Wires the runtime. Returns lifecycle methods (`start`/`stop`), a
service-aware `fetch`, a `service(name)` builder, and access to lower-level
modules (`registry`, `discovery`, `http`, `config`, `plugins`).

### `client.fetch(url, init)`

Drop-in `fetch` with two extras:

- `nacos://service-name/path` resolves through the balancer.
- `init.balancer`, `init.hint`, `init.timeout`, `init.retry`, `init.group`
  override per call.

### `client.service(name)`

Returns `{ get, post, put, del, fetch }`. JSON in/out by default; throws
`HttpError` on non-2xx.

### `client.config.get(key, fallback?)`

Synchronous read against the long-polled snapshot. Use `on()` for in-process
listeners.

### `init(factory)` (from `/next`)

Idempotent bootstrap, returns a Promise. Safe under HMR — stores the client
on `globalThis`.

### `client()` / `tryClient()` (from `/next`)

Singleton accessors. `client()` throws if not initialized; `tryClient()`
returns `null`.

## Plugins

```ts
import type { Plugin } from '@openclound/nacos';

export const auth = (token: () => string): Plugin => ({
  name: 'auth',
  onRequest({ request }) {
    const next = new Request(request);
    next.headers.set('authorization', `Bearer ${token()}`);
    return next;
  },
});
```

Register at construction (`plugins: [auth(...)]`) or at runtime
(`client.use(auth(...))`).

## Edge runtime

The Node SDK uses gRPC/net — it does **not** run in the Edge runtime. Always
guard with `process.env.NEXT_RUNTIME === 'nodejs'` in `instrumentation.ts`.

## License

MIT
