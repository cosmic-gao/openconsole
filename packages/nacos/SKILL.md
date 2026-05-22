---
name: nacos
description: >
  Use this skill to integrate, configure, or troubleshoot the
  `@openclound/nacos` client in a Next.js 16+ app — service registry,
  discovery, config center, load balancing, custom plugins, and the
  `nacos://service/path` URL convention. Triggers on phrases like "set up
  nacos", "add @openclound/nacos to my app", "register this service with
  nacos", "call another service via nacos", "write a nacos plugin",
  "nacos config not updating", "nacos load balancer", or anything that
  imports from `@openclound/nacos` / `@openclound/nacos/next` or uses
  `nacos://` URLs.
type: lifecycle
library: "@openclound/nacos"
library_version: "0.1.0"
runtime:
  node: ">=18.18"
  next: "^15 || ^16"
peers:
  nacos: "^2"
---

# `@openclound/nacos` — integration & usage

An opinionated Nacos client for Next.js 16+ apps that wires registry,
discovery, load balancing, config center, and a fetch-style HTTP client
behind one `create()` factory. Open out of the box, with a pluggable
backend and pipeline.

This skill teaches Claude how to:

1. **Prompt the user for the required config** (do this first)
2. Install and bootstrap the client from `instrumentation.ts`
3. Consume services via `nacos://` URLs and `client.service(name)`
4. Read live config from the snapshot with Next.js cache revalidation
5. Register the running app as a service provider
6. Author custom plugins (auth, tracing, retry policy)
7. Pick and customize load balancers
8. Avoid runtime gotchas (Edge runtime, HMR, streaming bodies,
   AbortSignal + timeout, non-JSON configs, multi-NIC IPs)
9. Diagnose common errors

---

## When to apply this skill

Apply when the user is doing any of:

- **Adding `@openclound/nacos` to a new Next.js app** — configure env vars,
  wire `instrumentation.ts`, expose typed helpers.
- **Calling another service through Nacos** (`nacos://user-service/...`)
  from a Server Component, Route Handler, Server Action, or background job.
- **Reading dynamic configuration** that lives in a Nacos dataId and should
  flow into RSC renders via `revalidateTag`.
- **Registering the current app** so other services can discover it
  (consumer + provider mode).
- **Writing a custom plugin** for auth, OpenTelemetry, redaction, header
  propagation, or per-call retry policy.
- **Tuning load balancing** — switching between `weighted` / `round-robin`
  / `random` / `sticky`, or supplying a custom `Balancer`.
- **Debugging** errors like `NoInstanceError`, `TimeoutError`, "client not
  initialized", duplicate registrations after HMR, or config that doesn't
  refresh.

Do NOT apply for unrelated Nacos products (the Nacos Java SDK, the Nacos
admin console) — this skill is specifically for `@openclound/nacos`.

---

## Architecture at a glance

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

| Module | Responsibility |
|---|---|
| `NacosRegistry` | Translates SDK shapes ↔ `Instance`; holds dual SDK clients (naming + config) |
| `Discovery` | In-process instance cache fed by registry push subscriptions |
| `Http` | `nacos://` resolution, retries, timeout, plugin pipeline |
| `Provider` | Registers this app, deregisters on SIGTERM/SIGINT |
| `Config` | Long-polled snapshot + Next.js `revalidateTag` |
| `Plugins` | `onRequest` / `onResponse` / `onError` pipeline + built-ins |
| `balancer` | `weighted` / `round-robin` / `random` / `sticky` factories |
| `next` adapter | HMR-safe singleton via `globalThis` |

---

## Step 1 — Ask the user for config values

**Before writing any code, prompt the user for the values below.** Use
`AskUserQuestion` to gather them — group related fields per question. Do
not assume project-specific values (server addresses, service names,
dataIds, credentials); only the marked defaults are safe unprompted.

### Always ask

| Env var | What it is | Default |
|---|---|---|
| `NACOS_SERVER_ADDR` | Nacos server `host:port` (e.g. `127.0.0.1:8848`) | — (required) |
| `NACOS_NAMESPACE` | Tenant/namespace id | `public` |
| `NACOS_USERNAME` / `NACOS_PASSWORD` | Auth credentials | — (skip if auth disabled) |
| `NACOS_GROUP` | Group for services + config | `DEFAULT_GROUP` |
| `NACOS_REQUEST_TIMEOUT` | Registry call timeout (ms) | `6000` |

### Ask if the app will publish itself (provider mode)

| Env var | What it is | Default |
|---|---|---|
| `NACOS_ENABLE_DISCOVERY` | `true` to register this app | `false` |
| `NACOS_SERVICE_NAME` | The name this app publishes as | — (required if enabled) |
| `APP_VERSION` | Surfaced as instance metadata | `dev` |

### Ask if the app will read Nacos config center

| Env var | What it is | Default |
|---|---|---|
| `NACOS_DATA_ID` | dataId of the config to subscribe to | — (required) |

### Ask only for multi-NIC / K8s / mesh sidecar deployments

| Env var | What it is |
|---|---|
| `NACOS_HOST_IP` | Pin advertised IP (highest priority) |
| `NACOS_PREFER_INTERFACE` | Interface name to scan (e.g. `eth0`) — falls back to first non-internal IPv4 |
| `POD_IP` | Auto-picked up from K8s downward API |

After gathering values, write them to `.env.local` (dev) and remind the
user to mirror them in production. **Never hardcode secrets in source.**

The package itself reads only the `NEXT_RUNTIME` env. Every other env var
above is read by *your* bootstrap code (Step 3) and passed in as options.

---

## Step 2 — Install

```bash
pnpm add @openclound/nacos nacos
# or
npm install @openclound/nacos nacos
```

`nacos` is a required peer dependency (the underlying Node SDK).
`next` is an optional peer — only needed for the `/next` subpath.

---

## Step 3 — Bootstrap from `instrumentation.ts`

`instrumentation.ts` (at your app root) is the only Next.js hook that
runs **before** the first request on a Node.js server. The Nacos SDK
uses gRPC/net and cannot run in the Edge runtime, so guard explicitly:

```ts
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Dynamic import keeps the SDK out of the Edge build's static analysis.
  const { init } = await import("@openclound/nacos/next");
  const { logger } = await import("@openclound/nacos");

  if (!process.env.NACOS_SERVER_ADDR) {
    console.warn("[nacos] NACOS_SERVER_ADDR not set — skipping");
    return;
  }

  await init(() => ({
    registry: {
      server: process.env.NACOS_SERVER_ADDR!,
      namespace: process.env.NACOS_NAMESPACE ?? "public",
      username: process.env.NACOS_USERNAME,
      password: process.env.NACOS_PASSWORD,
      timeout: Number(process.env.NACOS_REQUEST_TIMEOUT ?? 6000),
    },
    provider: {
      enabled: process.env.NACOS_ENABLE_DISCOVERY === "true",
      service: process.env.NACOS_SERVICE_NAME ?? "my-app",
      port: Number(process.env.PORT ?? 3000),
      group: process.env.NACOS_GROUP ?? "DEFAULT_GROUP",
      metadata: { version: process.env.APP_VERSION ?? "dev" },
    },
    consumer: {
      balancer: "weighted",
      timeout: 5_000,
      retry: { attempts: 3, delays: [100, 500, 1500] },
      ttl: 5_000,
    },
    config: {
      sources: [
        {
          dataId: process.env.NACOS_DATA_ID ?? "app-config.json",
          group: process.env.NACOS_GROUP ?? "DEFAULT_GROUP",
          key: "root",
        },
      ],
      tag: "nacos:app-config",
    },
    plugins: [logger({ success: false })],
  }));
}
```

`init()` is idempotent and HMR-safe — it stashes the client on
`globalThis.__nacos` and reuses it across module reloads. See the HMR
gotcha section below.

> **Tip.** For larger apps you'll usually want a wrapper module like
> `lib/nacos.ts` that owns the option-building and exports typed
> helpers (`getConfig`, `nacosFetch`, `service`). Keep `init()` inside
> that wrapper so `instrumentation.ts` stays short.

---

## Step 4 — Consume services

### 4a. `nacos://` URLs with the global `client.fetch`

```ts
import { client } from "@openclound/nacos/next";

const res = await client().fetch("nacos://user-service/users/me", {
  // Standard RequestInit + per-call balancer / hint / timeout / retry / group
  method: "POST",
  body: JSON.stringify({ id: "42" }),
  headers: { "content-type": "application/json" },
  hint: { key: req.headers.get("x-tenant-id") ?? undefined },
  timeout: 3_000,
});
```

URL anatomy:

- `nacos://<service-name>/<path>` — discovery resolves an instance via the
  configured balancer, then issues a plain `fetch`.
- Optional `?scheme=https` query — forces HTTPS. Case-insensitive
  (`HTTPS` / `Https` also work).
- Other query params pass through unchanged.

For code paths that may run before `init()` resolves, use `tryClient()`:

```ts
import { tryClient } from "@openclound/nacos/next";

const c = tryClient();
if (!c) throw new Error("nacos client not initialized");
```

### 4b. Fluent sub-client per service

For JSON-in / JSON-out APIs, use `service(name)`:

```ts
import { client } from "@openclound/nacos/next";

const users = client().service("user-service");

// GET → JSON parsed body, throws HttpError on non-2xx
const me = await users.get<{ id: string; name: string }>("/users/me");

// POST/PUT — body auto-encoded by type:
//   string         → application/json (preserves pre-serialized JSON)
//   plain object   → JSON.stringify + application/json
//   FormData       → no content-type (lets fetch set multipart boundary)
//   URLSearchParams → application/x-www-form-urlencoded;charset=utf-8
//   Blob           → blob.type or application/octet-stream
//   ArrayBuffer / TypedArray → application/octet-stream
//   ReadableStream → application/octet-stream (NB: not safe with retry > 1)
await users.post("/users", { name: "Ada" });
await users.put("/users/42", { name: "Ada Lovelace" });
await users.del("/users/42");
```

Caller-supplied `content-type` always wins over the inferred default —
the package merges via `new Headers(init.headers)` and only sets
`content-type` when the caller didn't.

### 4c. Plain http/https passes through

`client.fetch("https://api.stripe.com/...")` works untouched — same
plugin pipeline, same retry logic. One surface for internal + external.

---

## Step 5 — Configuration center

### 5a. Read the snapshot

```ts
import { client } from "@openclound/nacos/next";

// Per-key read with fallback (synchronous against the long-polled snapshot)
const flags = client().config.get<{ darkMode: boolean }>("featureFlags", {
  darkMode: false,
});

// Whole snapshot
const all = client().config.get();
```

The top-level snapshot keys come from `config.sources[].key` (or the
`dataId` itself when `key` is omitted). A common pattern: set
`key: "root"` for a single dataId so the whole config object hangs off
one snapshot key.

### 5b. Live updates trigger Next.js revalidation

The `config.tag` option is fired through `revalidateTag(tag, { expire: 0 })`
on every push. Any RSC segment or `fetch()` tagged with that same tag
re-renders on the next request:

```tsx
// app/dashboard/page.tsx
import { client } from "@openclound/nacos/next";

export default async function Page() {
  // The page itself can read straight from the snapshot:
  const flags = client().config.get<{ darkMode: boolean }>("featureFlags", {
    darkMode: false,
  });

  // Or, fetched data downstream of the config can also tag itself:
  const data = await fetch("https://api.example.com/me", {
    next: { tags: ["nacos:app-config"] },
  }).then((r) => r.json());

  return <Dashboard dark={flags.darkMode} data={data} />;
}
```

Force revalidation manually (handy for a `POST /api/nacos/revalidate`
webhook route):

```ts
await client().config.revalidate();
```

### 5c. In-process listeners

For non-RSC callers that need a callback on change:

```ts
const off = client().config.on((key, value) => {
  console.info("[config] changed", key, value);
});
// ...later
off();
```

### 5d. Non-JSON configs

The built-in parser tries `JSON.parse` first; on failure it stores the
raw string and prints a warning. If you need YAML/properties parsing,
post-process inside an `on()` listener:

```ts
import YAML from "yaml";

client().config.on((key, value) => {
  if (key === "app" && typeof value === "string") {
    const parsed = YAML.parse(value);
    // route parsed value to wherever you need
  }
});
```

---

## Step 6 — Register this app (Provider mode)

Set `provider.enabled: true`. The provider:

1. Detects the host IP — env first
   (`NACOS_HOST_IP` → `POD_IP` → `HOST_IP`), then
   `NACOS_PREFER_INTERFACE`, then the first non-internal IPv4. The
   chosen IP and source are logged on startup.
2. Registers via `registry.register()` with `ephemeral: true` by default
   (heartbeat is managed by the Nacos SDK).
3. Hooks SIGTERM and SIGINT to deregister on shutdown — races the
   deregister against a 3 s timeout so a stalled Nacos can't stretch
   K8s grace periods, then re-raises the signal so the host can exit.

**Multi-NIC pin recipe** (Pod with sidecar + service mesh):

```ini
NACOS_PREFER_INTERFACE=eth0
# or pin completely:
NACOS_HOST_IP=10.244.5.18
```

---

## Step 7 — Plugins

Plugins are objects implementing one or more of `onRequest`, `onResponse`,
`onError`. They form an axios/Koa-style pipeline; returning a new
`Request` / `Response` from a hook replaces the in-flight one, returning
void leaves it untouched. Errors thrown from `onError` are swallowed so
the original failure isn't masked.

```ts
import type { Plugin } from "@openclound/nacos";

// Auth: inject a bearer token resolved per-request.
export const auth = (token: () => Promise<string> | string): Plugin => ({
  name: "auth",
  async onRequest({ request }) {
    const next = new Request(request);
    next.headers.set("authorization", `Bearer ${await token()}`);
    return next;
  },
});

// Tracing: propagate W3C trace context.
import { context as otelContext, propagation } from "@opentelemetry/api";

export const tracing = (): Plugin => ({
  name: "otel",
  onRequest({ request }) {
    const headers = new Headers(request.headers);
    propagation.inject(otelContext.active(), headers, {
      set: (h, k, v) => h.set(k, String(v)),
    });
    return new Request(request, { headers });
  },
});
```

Register at construction:

```ts
plugins: [auth(getToken), tracing(), logger()];
```

Or at runtime:

```ts
client().use(auth(getToken));
```

**Built-ins:**

- `logger({ logger?, success? })` — info on 2xx, warn on non-2xx, error
  on thrown. Pass `success: false` to log only failures.
- `headers({ headers })` — static headers merged on every request.

---

## Step 8 — Load balancers

Set `consumer.balancer` to a strategy name or a custom `Balancer`:

| Strategy | When to use |
|---|---|
| `weighted` (default) | Heterogeneous fleets — instances with `weight: 2` get twice the traffic |
| `round-robin` | Homogeneous fleets, deterministic distribution |
| `random` | Stateless instances, no affinity needs |
| `sticky` | Same `hint.key` (user/tenant id) always routes to the same instance |

Per-call override:

```ts
import { sticky } from "@openclound/nacos";

const stickyForTenant = sticky();
await client().fetch("nacos://svc/x", {
  balancer: stickyForTenant,
  hint: { key: tenantId },
});
```

Custom balancer:

```ts
import type { Balancer, Instance, Hint } from "@openclound/nacos";

export const leastBusy = (load: Map<string, number>): Balancer => ({
  name: "least-busy",
  pick(instances: Instance[], hint?: Hint) {
    void hint;
    if (instances.length === 0) return null;
    return instances.reduce((best, i) =>
      (load.get(i.id ?? `${i.ip}:${i.port}`) ?? 0) <
      (load.get(best.id ?? `${best.ip}:${best.port}`) ?? 0)
        ? i
        : best,
    );
  },
});
```

Contract: `pick()` is always called with instances of a single service.

---

## Gotchas

These are the runtime behaviors that bite users in production. Read
before debugging.

### Edge runtime is not supported

The `nacos` SDK uses `net` / gRPC. Always guard:

```ts
if (process.env.NEXT_RUNTIME !== "nodejs") return;
```

Importing the package inside an Edge function or `middleware.ts` will
fail at build or first-request time. Use a dynamic `await import()`
inside the guard if you also need to silence Edge build static analysis.

### HMR singleton lifecycle

`init()` checks `globalThis.__nacos` and reuses it across HMR reloads —
without this, every save would register a new provider instance with
Nacos and pile up SIGTERM handlers. If you need a hard reset (test or
intentional restart):

```ts
import { dispose } from "@openclound/nacos/next";
await dispose(); // stops the client and clears globalThis.__nacos
await init(/* ... */); // safe to re-init now
```

### Streaming bodies and retry don't mix

`ReadableStream` bodies are consumed on the first read. The Http layer
rejects them up-front when `retry.attempts > 1`:

```
[nacos] cannot retry a request with a ReadableStream body; set retry.attempts=1 or buffer the body before sending
```

Either buffer the body into a `Uint8Array` / `Blob` / `string` first, or
disable retry for that call: `retry: { attempts: 1 }`.

### AbortSignal + timeout

When you pass `init.signal` AND configure a `timeout`, both are honored —
whichever aborts first wins, and the aborter's `reason` is preserved on
the rejection. (Implemented via `AbortSignal.any()` on Node 20+ with a
manual fallback for older runtimes.)

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(new Error("user cancelled")), 5_000);
await client().fetch("nacos://svc/x", { signal: ac.signal, timeout: 30_000 });
// Cancels after 5s with the user's reason, not the timeout's.
```

### Non-JSON configs

Configs that don't parse as JSON are stored as raw strings (with a
`console.warn`). Read `client().config.get('mykey')` and post-process if
you need structured data. See the YAML recipe above.

### `nacos://` resolution happens per attempt

Each retry attempt re-runs the balancer, so a flaky instance can be
skipped on the second try. The attempt counter is passed to the
balancer via `hint.attempt`, so sticky/custom balancers can deliberately
shift instance on retry.

### IP detection on multi-NIC hosts

Pure interface scanning picks the first non-internal IPv4, which is
arbitrary on hosts with VPN tunnels or service-mesh sidecars. Pin with
env: `NACOS_PREFER_INTERFACE=eth0` or `NACOS_HOST_IP=10.0.0.42`. The
chosen IP and source are logged on startup.

### Watch failure recovery

If the registry subscription fails on first connect, Discovery falls
back to TTL polling (`consumer.ttl`, default 5 s) and prints a warn line.
A transient registry hiccup will not permanently freeze the cache.

---

## Troubleshooting

### `[nacos] not initialized; call init() from instrumentation.ts`

`client()` was called before `init()` resolved. Either:
- You're calling from the Edge runtime (move to Node)
- `register()` in `instrumentation.ts` is gated on a missing env var
- The path imports happen too early — use `tryClient()` for code paths
  that may run pre-init

### `NoInstanceError: no healthy instance for service: <name>`

- Service isn't registered (check Nacos console)
- All instances are `healthy: false` or `enabled: false` — Discovery
  filters them via `callable()`
- Wrong group — pass `init.group` per call or set `provider.group`

### `TimeoutError: request timed out after Nms`

- Tune `consumer.timeout` (global) or pass `init.timeout` per call
- Check the downstream service health
- Plain-network connectivity from this pod to the resolved IP

### Config doesn't refresh after Nacos update

1. Confirm the dataId matches exactly (case-sensitive, including `.json`)
2. Confirm the group matches
3. Check the bootstrap logs for a `parse` warn — non-JSON content is
   returned as raw string, not exploded into the snapshot
4. RSC pages need `next: { tags: ['<your tag>'] }` in their fetch /
   `unstable_cache` options to react to `revalidateTag`

### Duplicate registrations after deploy

If you see two instances of the same service+port in Nacos:
- Make sure your platform actually sends SIGTERM and waits for the
  process — short grace periods (< 3 s) can let pods exit before
  deregister finishes
- The provider hook re-raises the signal after `stop()` — don't add
  another `process.on('SIGTERM', ...)` that exits immediately

---

## API surface

```ts
// Main entry
import {
  create,           // factory
  HttpError,        // thrown by service.get/post/put/del on non-2xx
  NoInstanceError,  // thrown when balancer has nothing to pick
  TimeoutError,     // thrown by AbortSignal timeout path
  logger,           // built-in plugin
  headers,          // built-in plugin
  roundRobin, random, weighted, sticky, strategy, // balancer factories
  type Client, type Service, type Plugin,
  type FetchOptions, type Hint, type Instance,
  type Options, type Strategy, type Balancer, type Retry,
  type Registry, type ProviderOptions, type ConsumerOptions,
  type ConfigOptions, type RegistryOptions,
} from "@openclound/nacos";

// Next.js singleton accessor
import { init, client, tryClient, dispose } from "@openclound/nacos/next";
```

Key option types (the full schema lives in the package's `types.ts`):

```ts
interface Options {
  registry: { server: string; namespace?: string; username?: string; password?: string; timeout?: number };
  provider?: {
    enabled: boolean;
    service: string;
    port: number;
    ip?: string;
    group?: string;
    weight?: number;
    cluster?: string;
    metadata?: Record<string, string>;
    ephemeral?: boolean;
  };
  consumer?: {
    balancer?: "round-robin" | "random" | "weighted" | "sticky" | Balancer;
    timeout?: number;
    retry?: { attempts: number; delays?: number[]; when?: (input) => boolean };
    ttl?: number;
  };
  config?: {
    sources?: Array<{ dataId: string; group?: string; key?: string }>;
    tag?: string;
  };
  plugins?: Plugin[];
}

interface FetchOptions extends RequestInit {
  balancer?: Balancer;
  hint?: { key?: string; attempt?: number };
  timeout?: number;
  retry?: Retry;
  group?: string;
}
```

---

## Testing your integration

The package ships a vitest suite covering Discovery cache, balancer
weights, Http retry/URL parsing, and Config subscribe/unsubscribe.

To unit-test your own code that consumes the package without spinning up
real Nacos, inject a fake `Registry` (the interface is the only required
surface) and construct the lower-level modules directly:

```ts
import type { Registry, Instance } from "@openclound/nacos";
import { Discovery, Http, Plugins } from "@openclound/nacos";

class FakeRegistry implements Registry {
  async ready() {}
  async close() {}
  async register() {}
  async deregister() {}
  async list(_service: string) { return [] as Instance[]; }
  async watch() {}
  async unwatch() {}
  async read() { return null; }
  async observe() {}
  async unobserve() {}
}

const registry = new FakeRegistry();
const discovery = new Discovery({ registry });
const plugins = new Plugins([]);
const http = new Http({ discovery, plugins });
// ...
```

`create()` always wires a real `NacosRegistry`, so for fully-mocked unit
tests skip `create()` and assemble the modules yourself as above.

---

## Quick checklist when adding to a new app

- [ ] **Asked the user for `NACOS_SERVER_ADDR`** and any auth credentials
- [ ] **Asked which modes are needed** (provider / config / consumer)
- [ ] **Asked for `NACOS_SERVICE_NAME`** if provider mode is on
- [ ] **Asked for `NACOS_DATA_ID`** if config center is used
- [ ] `pnpm add @openclound/nacos nacos`
- [ ] `instrumentation.ts` exists and guards on `NEXT_RUNTIME === 'nodejs'`
- [ ] `init()` called from inside the guard, with options built from env
- [ ] `.env.local` has `NACOS_SERVER_ADDR` at minimum
- [ ] For provider mode: set `NACOS_ENABLE_DISCOVERY=true` and pick a
      `NACOS_SERVICE_NAME`
- [ ] For config: define `config.sources` with the right dataIds and a
      `tag` if you want Next.js cache revalidation
- [ ] Plugins: at least `logger({ success: false })` so failures show up
- [ ] Multi-NIC / K8s: set `NACOS_PREFER_INTERFACE` or `NACOS_HOST_IP`
- [ ] Edge runtime: never `import '@openclound/nacos'` in Edge code paths
