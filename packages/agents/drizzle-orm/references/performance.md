# Performance (template-aligned)

Drizzle performance tuning for the unified Next.js scaffold. Stack: `drizzle-orm/postgres-js` + `postgres@^3.4.9`, `prepare: false`. `DATABASE_URL` is provided by the user — the scaffold supports both **direct Postgres :5432** and **Postgres behind pgbouncer transaction mode :6432**.

> Generic Drizzle docs often show `pg.Pool` / `node-postgres` examples and prepared-statement patterns. **Ignore those for this scaffold** — we use `postgres-js`, and `.prepare()` is unsafe whenever the user's Postgres might be behind pgbouncer transaction mode (which the scaffold has no way to know).

---

## 1. Connection pool sizing

The scaffold's `lib/db/index.ts` reads `DATABASE_POOL_MAX` (default `5`) and passes it to `postgres()`:

```ts
postgres(env.DATABASE_URL, {
  max: env.DATABASE_POOL_MAX,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
});
```

**Sizing rule depends on the deployment**:

- **Direct Postgres (5432)**: `N × DATABASE_POOL_MAX ≤ Postgres max_connections` (typically 100 by default). Each Next.js replica's `DATABASE_POOL_MAX` is its own slice.
- **Behind pgbouncer transaction mode (6432)**: `N × DATABASE_POOL_MAX ≤ pgbouncer DEFAULT_POOL_SIZE`. Pgbouncer multiplexes many client connections onto a smaller server-side pool.

**Symptoms of misconfigured pool:**

| Symptom | Likely cause |
| --- | --- |
| Requests stall ~10s then "connect_timeout" | Pool exhausted (`DEFAULT_POOL_SIZE` for pgbouncer, or `max_connections` for direct PG) |
| Random "no more connections allowed" / "too many clients already" errors | N × DATABASE_POOL_MAX > server-side limit |
| Slow startup | `lazyConnect` not enabled, pool warming up |

**Never** open new `postgres()` instances per request — the scaffold uses a `globalThis` singleton to prevent dev HMR connection leaks.

---

## 2. Index every foreign key and frequently-filtered column

Drizzle does not auto-create indexes on `references(...)`. Add them explicitly:

```ts
import { pgTable, serial, text, integer, index, timestamp } from "drizzle-orm/pg-core";

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    authorId: integer("author_id").notNull().references(() => authors.id),
    status: text("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    authorIdx: index("posts_author_id_idx").on(table.authorId),
    statusIdx: index("posts_status_idx").on(table.status),
    authorStatusIdx: index("posts_author_status_idx").on(table.authorId, table.status),
  }),
);
```

Run `pnpm db:generate` after adding indexes to produce the migration SQL.

**Partial index** for sparse / boolean-filtered columns:

```ts
import { sql } from "drizzle-orm";

(table) => ({
  activePostsIdx: index("posts_active_idx")
    .on(table.authorId)
    .where(sql`${table.status} = 'published'`),
})
```

Partial indexes are smaller and faster when the filter matches a small fraction of rows.

---

## 3. Select only the columns you need

`db.select()` reads every column. On wide tables (large `text` / `jsonb`) this is expensive.

```ts
// ❌ Reads all columns including large content / jsonb
const list = await db.select().from(notes).limit(100);

// ✓ Reads only the 3 columns the list view shows
const list = await db
  .select({
    id: notes.id,
    title: notes.title,
    updatedAt: notes.updatedAt,
  })
  .from(notes)
  .limit(100);
```

In `_cached.ts` files (Cache Components), selecting fewer columns also keeps the cache entry small.

---

## 4. Paginate always

Never `findMany()` without `limit`. The scaffold's `features/notes/_cached.ts` shows the pattern:

```ts
return db.query.notes.findMany({
  orderBy: desc(notes.updatedAt),
  limit: 100,
});
```

**Keyset pagination** (cursor-based) — preferred over `offset` for large tables:

```ts
import { and, lt, desc } from "drizzle-orm";

async function pageAfter(cursor?: { id: number; updatedAt: Date }) {
  const where = cursor ? lt(notes.updatedAt, cursor.updatedAt) : undefined;

  return db
    .select()
    .from(notes)
    .where(where)
    .orderBy(desc(notes.updatedAt), desc(notes.id))
    .limit(20);
}
```

`offset` is OK for small tables and explicit page-number UIs; avoid it past 10k rows.

---

## 5. Prevent N+1 with `with: { … }` (Drizzle Query API)

```ts
// ❌ N+1: one query for authors, then one query per author for posts
const authors = await db.query.authors.findMany();
for (const author of authors) {
  const posts = await db.query.posts.findMany({
    where: eq(posts.authorId, author.id),
  });
}

// ✓ Single query with relation join
const authors = await db.query.authors.findMany({
  with: { posts: true },
});
```

Define the relations in your schema files (`relations(...)` helper) — see `references/advanced-schemas.md`.

---

## 6. Use EXPLAIN ANALYZE to diagnose slow queries

Drizzle exposes the underlying SQL — capture it and run `EXPLAIN ANALYZE`:

```ts
const query = db.select().from(notes).where(eq(notes.id, 1));
console.log(query.toSQL());
// Then in psql:
//   EXPLAIN ANALYZE SELECT ...;
```

`EXPLAIN ANALYZE` shows whether the planner uses your index, the actual row count, and the time spent at each node. If you see `Seq Scan` on a large table you expected indexed, the index is missing or the planner judged it not worth using (often a stats issue — run `ANALYZE <table>;`).

---

## 7. Batch inserts in one statement, not in a loop

```ts
// ❌ N round-trips to Postgres
for (const row of bulk) {
  await db.insert(notes).values(row);
}

// ✓ Single round-trip
await db.insert(notes).values(bulk);

// With upsert
await db.insert(notes)
  .values(bulk)
  .onConflictDoUpdate({
    target: notes.id,
    set: { title: sql`EXCLUDED.title` },
  });
```

For very large bulk loads (10k+ rows), chunk them — `postgres-js` will buffer otherwise:

```ts
const CHUNK = 1000;
for (let i = 0; i < bulk.length; i += CHUNK) {
  await db.insert(notes).values(bulk.slice(i, i + CHUNK));
}
```

If you need raw `COPY` throughput (millions of rows), do it outside the app process — a one-off script that connects directly to Postgres (bypassing pgbouncer if there is one), where you can also enable prepared statements.

---

## 8. Cache the read, invalidate on write

This is the scaffold's recommended pattern, documented in `data-layer.md`. Brief recap:

- `features/<domain>/_cached.ts` wraps the read with `'use cache'` + `cacheLife("hours")` + `cacheTag("<entity>:list")`
- `features/<domain>/actions.ts` calls `updateTag(...)` after every write

Cache Components + Redis cache backend together do per-tag invalidation across all replicas. **Do not** layer a manual in-process LRU on top — it bypasses the tag invalidation.

---

## 9. Use `db.transaction` only when atomicity is required

Transactions are fine on either deployment (direct Postgres or pgbouncer transaction mode), **as long as everything stays inside one `db.transaction(async (tx) => { ... })` call**:

```ts
await db.transaction(async (tx) => {
  await tx.insert(orders).values({ /* ... */ });
  await tx.update(inventory).set({ qty: sql`${inventory.qty} - 1` }).where(/* ... */);
});
```

**Anti-patterns:**

- Spanning a transaction across HTTP requests — pgbouncer reclaims the connection between statements; on direct PG you'd still hold a backend connection for too long
- Calling external APIs inside a transaction — locks held the whole time
- Long-running transactions with sleep / heavy compute — block the connection pool (worse on pgbouncer where the pool is smaller)

---

## 10. Monitoring

Track these (the exact source depends on whether the user's Postgres is behind pgbouncer):

| Metric | Source | Healthy | Warning |
| --- | --- | --- | --- |
| Postgres `pg_stat_activity` count | direct PG / via pgbouncer backend | < 80% `max_connections` (PG) or `DEFAULT_POOL_SIZE` (pgbouncer) | Tune `DATABASE_POOL_MAX` |
| Postgres `pg_stat_activity` long queries | both | none > 30s | Investigate / cancel |
| Postgres `idle_in_transaction` | both | none | App is holding txns too long |
| pgbouncer `cl_active` | pgbouncer only | < 80% MAX_CLIENT_CONN | Increase pool or scale down callers |
| pgbouncer `sv_active` | pgbouncer only | < 80% DEFAULT_POOL_SIZE | Tune `DATABASE_POOL_MAX` or pgbouncer config |

For pgbouncer deployments, expose its admin console (`pgbouncer -p <port> -admin`) or scrape with `pgbouncer_exporter` + Prometheus. For direct Postgres, scrape `pg_stat_*` views or use `postgres_exporter`.

---

## 11. What NOT to do (scaffold-specific)

| ❌ Don't | ✓ Do |
| --- | --- |
| `import { Pool } from "pg"` | `import postgres from "postgres"` (already in `lib/db/index.ts`) |
| `.prepare("name")` | Plain query — let postgres-js handle prepared-statement-like reuse internally |
| New `postgres()` per request | Use the `globalThis` singleton in `lib/db/index.ts` |
| Modify `prepare: false` | Leave it — required if user's PG is behind pgbouncer, harmless otherwise |
| `db.transaction` spanning HTTP calls | Keep everything inside one server action |
| Manual LRU around `_cached.ts` reads | Trust `'use cache'` + `cacheTag` + cache-handler.mjs |
| `db.select()` on wide tables in list view | Select only the columns the UI shows |
