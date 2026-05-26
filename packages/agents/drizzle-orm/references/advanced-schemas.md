# Advanced Schemas (template-aligned, Postgres-only)

The unified scaffold is **Postgres-only** (`drizzle-orm/postgres-js` + `postgres`). All examples in this file use `drizzle-orm/pg-core` — generic Drizzle docs that show MySQL or SQLite syntax do not apply here.

---

## Custom column types

### JSONB with TypeScript shape

```ts
import { pgTable, serial, jsonb, text } from "drizzle-orm/pg-core";

type UserPrefs = {
  theme: "light" | "dark" | "system";
  locale: string;
  notifications: { email: boolean; sms: boolean };
};

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  prefs: jsonb("prefs").$type<UserPrefs>().notNull().default({
    theme: "system",
    locale: "en",
    notifications: { email: true, sms: false },
  }),
});
```

Drizzle parses / serializes JSON automatically. The `$type<>()` annotation buys type safety on reads and inserts, but **does not validate at runtime** — pair with a zod schema.

### Enums (Postgres native)

```ts
import { pgEnum, pgTable, serial, text } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "editor", "viewer"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull().default("viewer"),
});

type Role = (typeof userRole.enumValues)[number];   // "admin" | "editor" | "viewer"
```

**Migration note:** dropping or renaming enum values is non-trivial in Postgres — `pnpm db:generate` emits `ALTER TYPE` for additions, but value removals usually need a manual SQL migration.

Alternative — store as `text` with a TS literal type, much easier to refactor:

```ts
role: text("role", { enum: ["admin", "editor", "viewer"] }).notNull().default("viewer"),
```

The `enum: [...]` array gives Drizzle the same TS narrowing without a Postgres enum type.

### Arrays

```ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  tags: text("tags").array().notNull().default([]),
});

const tagged = await db
  .select()
  .from(articles)
  .where(sql`${articles.tags} @> ARRAY['featured']`);
```

For frequent `@>` queries add a GIN index:

```ts
import { index } from "drizzle-orm/pg-core";

(table) => ({
  tagsIdx: index("articles_tags_idx").using("gin", table.tags),
})
```

### Generated columns

```ts
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const articles = pgTable("articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  searchVector: text("search_vector").generatedAlwaysAs(
    sql`to_tsvector('english', title || ' ' || body)`,
    { mode: "stored" },
  ),
});
```

---

## Composite primary keys

```ts
import { pgTable, integer, text, primaryKey, index } from "drizzle-orm/pg-core";

export const usersToGroups = pgTable(
  "users_to_groups",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    groupId: integer("group_id").notNull().references(() => groups.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.groupId] }),
    byGroup: index("users_to_groups_by_group_idx").on(table.groupId, table.userId),
  }),
);
```

The composite PK acts as both a uniqueness constraint AND an index on `(userId, groupId)`. For the reverse direction queries, add a separate index as shown.

---

## Indexes

```ts
import { index, uniqueIndex, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    tenantId: text("tenant_id").notNull(),
    status: text("status").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => ({
    statusIdx: index("posts_status_idx").on(table.status),
    tenantStatusIdx: index("posts_tenant_status_idx").on(table.tenantId, table.status),
    tenantSlugUnique: uniqueIndex("posts_tenant_slug_unique").on(table.tenantId, table.slug),
    publishedIdx: index("posts_published_idx")
      .on(table.publishedAt)
      .where(sql`${table.status} = 'published'`),
    lowerSlugIdx: index("posts_lower_slug_idx").on(sql`lower(${table.slug})`),
  }),
);
```

Choosing an index type:

| Type | When |
| --- | --- |
| Plain b-tree | Equality + range queries on scalars (default) |
| Composite b-tree | Multi-column filters; column order = filter order |
| Unique | Logical uniqueness — also gives you a unique-violation error |
| Partial | Filter matches a small subset of rows |
| Expression | Always query `lower(col)` or `(col_a + col_b)` |
| GIN (`.using("gin", col)`) | Array `@>` / JSONB `?` / tsvector full-text |

---

## Check constraints

```ts
import { check, pgTable, serial, integer } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    price: integer("price").notNull(),
    cost: integer("cost").notNull(),
  },
  (table) => ({
    positivePrice: check("price_positive", sql`${table.price} > 0`),
    priceGteCost: check("price_gte_cost", sql`${table.price} >= ${table.cost}`),
  }),
);
```

Check constraints are enforced by Postgres and catch bad data even when application code bypasses zod validation.

---

## Relations (one-to-many, many-to-many)

```ts
import { relations } from "drizzle-orm";
import { pgTable, serial, text, integer, primaryKey } from "drizzle-orm/pg-core";

// One-to-many: author has many posts
export const authors = pgTable("authors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull().references(() => authors.id),
});

export const authorsRelations = relations(authors, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(authors, {
    fields: [posts.authorId],
    references: [authors.id],
  }),
}));

// Many-to-many: users ↔ groups via usersToGroups
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});

export const usersToGroups = pgTable(
  "users_to_groups",
  {
    userId: integer("user_id").notNull().references(() => users.id),
    groupId: integer("group_id").notNull().references(() => groups.id),
  },
  (table) => ({ pk: primaryKey({ columns: [table.userId, table.groupId] }) }),
);

export const usersRelations = relations(users, ({ many }) => ({
  groups: many(usersToGroups),
}));

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(usersToGroups),
}));

export const usersToGroupsRelations = relations(usersToGroups, ({ one }) => ({
  user: one(users, { fields: [usersToGroups.userId], references: [users.id] }),
  group: one(groups, { fields: [usersToGroups.groupId], references: [groups.id] }),
}));
```

**Important — barrel re-export every relation:**

```ts
// lib/db/schema/index.ts
export * from "./authors";
export * from "./posts";
export * from "./users";
export * from "./groups";
export * from "./users-to-groups";
```

Drizzle's relational query API (`db.query.<table>.findMany({ with: { … } })`) needs the relations registered through the schema barrel that `lib/db/index.ts` imports.

---

## Multi-tenant patterns

The scaffold's `proxy.ts` writes `tenant_code` to a cookie; `features/auth/server/session.ts` exposes it via `getSession()`. Two ways to scope data per tenant:

### Pattern A — Tenant ID column + composite indexes (recommended)

```ts
export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),   // matches getSession().tenantCode
    title: text("title").notNull(),
  },
  (table) => ({
    byTenant: index("documents_tenant_idx").on(table.tenantId, table.id),
  }),
);
```

Always filter by `tenantId` in your Server Actions:

```ts
"use server";

export async function listDocuments() {
  const session = await getSession();
  if (!session) unauthorized();
  return listDocumentsCached(session.tenantCode);
}
```

```ts
// features/documents/_cached.ts
export async function listDocumentsCached(tenantId: string) {
  "use cache";
  cacheLife("minutes");
  cacheTag(`documents:list:${tenantId}`);

  return db.query.documents.findMany({
    where: eq(documents.tenantId, tenantId),
    limit: 100,
  });
}
```

`cacheTag` includes the tenant — `updateTag("documents:list:acme")` only invalidates `acme`'s list, not the world.

### Pattern B — Row-level security (RLS)

For defense in depth, also turn on Postgres RLS so even a query that forgets `WHERE tenant_id = …` cannot leak cross-tenant data. RLS policies live in a hand-written migration (drizzle-kit does not generate them):

```sql
-- drizzle/<num>_rls.sql (hand-written, append after drizzle-kit output)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY documents_tenant_isolation ON documents
  USING (tenant_id = current_setting('app.tenant_id', true));
```

The app then runs each request inside a transaction that sets `app.tenant_id`:

```ts
await db.transaction(async (tx) => {
  await tx.execute(sql`SELECT set_config('app.tenant_id', ${session.tenantCode}, true)`);
  // ... queries here are RLS-filtered
});
```

This is heavier (every request needs its own transaction) — use it when the consequences of a tenant-isolation bug are catastrophic.

---

## Soft delete

```ts
export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

const live = await db
  .select()
  .from(notes)
  .where(isNull(notes.deletedAt));
```

For a multi-feature app, wrap this in a `liveOnly()` helper to avoid forgetting the filter. Better: lift it to a Postgres view (`CREATE VIEW notes_live AS SELECT * FROM notes WHERE deleted_at IS NULL`) and point Drizzle at the view.

---

## Naming + casing

The scaffold sets `DATABASE_CASING=snake_case`. Define TS fields in camelCase; the column names are inferred:

```ts
// TS: createdAt   →   SQL: created_at
createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
```

You **can** override per-column by passing the SQL name as the first arg (shown above). Without an explicit arg, Drizzle uses the TS name and applies the casing — but the explicit form is clearer and survives field renames.

---

## What NOT to do

- ❌ Skip the `relations(...)` declarations — `db.query.<table>.findMany({ with: { … } })` won't work
- ❌ Forget to add the new file to `lib/db/schema/index.ts` — drizzle-kit won't pick it up
- ❌ Write raw `ALTER TABLE` SQL outside of drizzle-kit migrations (drift between `meta/_journal.json` and reality)
- ❌ Use MySQL `int(11)` or SQLite types — Postgres only
- ❌ Generate UUIDs in app code when the DB can do it: prefer `uuid("id").primaryKey().defaultRandom()` over Node-side `crypto.randomUUID()` for new rows
