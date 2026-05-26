# Scaffold —— `drizzle/` 迁移产物

> drizzle-kit 生成的 SQL 迁移文件 + meta。骨架首次提交时可写入下方的 0000 迁移样板,**日常迭代不要手写**,改 `lib/db/schema/*.ts` 后跑 `pnpm db:generate`。

| # | 文件 | 用途 |
| --- | --- | --- |
| 62 | `drizzle/0000_initial.sql` | 初始迁移 SQL(notes 表) |
| 63 | `drizzle/meta/_journal.json` | drizzle-kit 维护的迁移历史 |
| 64 | `drizzle/meta/0000_snapshot.json` | 该次迁移的 schema 快照 |

> `drizzle/meta/_journal.json.lock` 不提交(`.gitignore` 已忽略)。

---

## [62] `drizzle/0000_initial.sql`

```sql
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
```

## [63] `drizzle/meta/_journal.json`

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {
      "idx": 0,
      "version": "7",
      "when": <CURRENT_TIMESTAMP_MS>,
      "tag": "0000_initial",
      "breakpoints": true
    }
  ]
}
```

> 占位符 `<CURRENT_TIMESTAMP_MS>` 替换为生成时的 Unix 毫秒时间戳(`Date.now()`)。

## [64] `drizzle/meta/0000_snapshot.json`

由 drizzle-kit 生成,内容较长。**做法**:不要手写,跑

```bash
pnpm db:generate
```

让 drizzle-kit 基于当前 `lib/db/schema/*.ts` 自动产生(同时会生成 `0000_<random>.sql` 与 `_journal.json`)。提交进 git。

---

## `contexts/.gitkeep`(占位)

`contexts/` 目录用来存跨 feature 的全局 Context,默认是空的。提交一个 `.gitkeep` 空文件让 git 保留目录:

```
# contexts/.gitkeep —— 空文件
```

---

下一步:[`public.md`](./public.md) —— 静态资源(favicon + loading 动画)
