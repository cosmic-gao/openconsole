# Scaffold —— `features/notes/` 示例切片

> 示范一个完整 feature 切片(可保留作样板,也可重命名为业务 feature)。展示 Cache Components + Drizzle + TanStack Query + react-hook-form + sonner toast 的完整闭环。
>
> 加新 feature 的完整流程见 [`../features.md`](../features.md);客户端 TanStack Query 见 [`../../../tanstack-query/SKILL.md`](../../../tanstack-query/SKILL.md);表单见 [`../../../react-hook-form/SKILL.md`](../../../react-hook-form/SKILL.md)。

| # | 文件 | 用途 |
| --- | --- | --- |
| 53 | `features/notes/actions.ts` | `'use server'` —— list / get / create / update / delete + `updateTag` 失效 |
| 54 | `features/notes/_cached.ts` | `'use cache'` —— Cache Components 读 |
| 55 | `features/notes/schemas.ts` | `NoteInput` + `NoteId` zod schemas |
| 56 | `features/notes/components/notes-table.tsx` | 列表 + Empty 状态 + 编辑 / 删除按钮 |
| 57 | `features/notes/components/note-form.tsx` | Dialog 表单(react-hook-form + zodResolver + useMutation) |
| 58 | `features/notes/components/note-delete-dialog.tsx` | AlertDialog 删除确认 |
| 59 | `features/notes/queries/keys.ts` | `noteKeys` 工厂 |
| 60 | `features/notes/queries/options.ts` | `noteQueries.list()` / `.detail(id)` |

---

## [53] `features/notes/actions.ts`

```ts
"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

import { NoteId, NoteInput } from "./schemas";
import { getNoteCached, listNotesCached } from "./_cached";

export async function listNotes() {
  return listNotesCached();
}

export async function getNote(rawId: unknown) {
  const id = NoteId.parse(rawId);
  return getNoteCached(id);
}

export async function createNote(input: unknown) {
  const { title, content } = NoteInput.parse(input);

  const [row] = await db.insert(notes).values({ title, content }).returning();

  updateTag("notes:list");
  return row;
}

export async function updateNote(rawId: unknown, input: unknown) {
  const id = NoteId.parse(rawId);
  const { title, content } = NoteInput.parse(input);

  const [row] = await db
    .update(notes)
    .set({ title, content, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();

  if (!row) throw new Error("Note not found");

  updateTag("notes:list");
  updateTag(`notes:item:${id}`);
  return row;
}

export async function deleteNote(rawId: unknown) {
  const id = NoteId.parse(rawId);

  const [row] = await db
    .delete(notes)
    .where(eq(notes.id, id))
    .returning({ id: notes.id });

  if (!row) throw new Error("Note not found");

  updateTag("notes:list");
  updateTag(`notes:item:${id}`);
  return { id: row.id };
}
```

## [54] `features/notes/_cached.ts`

```ts
import "server-only";

import { desc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";

export async function listNotesCached() {
  "use cache";
  cacheLife("hours");
  cacheTag("notes:list");

  return db.query.notes.findMany({
    orderBy: desc(notes.updatedAt),
    limit: 100,
  });
}

export async function getNoteCached(id: number) {
  "use cache";
  cacheLife("hours");
  cacheTag(`notes:item:${id}`);

  const [row] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return row ?? null;
}
```

## [55] `features/notes/schemas.ts`

```ts
import { z } from "zod";

export const NoteInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  content: z.string().trim().max(10_000),
});

export type NoteInput = z.infer<typeof NoteInput>;

export const NoteId = z.coerce.number().int().positive();
```

## [56] `features/notes/components/notes-table.tsx`

```tsx
"use client";

import {
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openconsole/shadcn";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { Note } from "@/lib/db/schema";

import { noteQueries } from "../queries/options";
import { NoteDeleteDialog } from "./note-delete-dialog";
import { NoteFormDialog } from "./note-form";

type NotesTableProps = {
  initialData: Note[];
};

export function NotesTable({ initialData }: NotesTableProps) {
  const { data: notes } = useSuspenseQuery({
    ...noteQueries.list(),
    initialData,
  });

  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Note | null>(null);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Notes</h2>
          <p className="text-muted-foreground text-sm">
            {notes.length} note{notes.length === 1 ? "" : "s"} in your list.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          New note
        </Button>
      </div>

      {notes.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>No notes yet</EmptyTitle>
            <EmptyDescription>
              Create your first note to get started.
            </EmptyDescription>
          </EmptyHeader>
          <Button onClick={() => setCreating(true)} variant="outline">
            <Plus />
            New note
          </Button>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead className="hidden md:table-cell">Content</TableHead>
                <TableHead className="hidden w-[180px] md:table-cell">
                  Updated
                </TableHead>
                <TableHead className="w-[110px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {notes.map((note) => (
                <TableRow key={note.id}>
                  <TableCell className="font-medium">{note.title}</TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-[400px] truncate md:table-cell">
                    {note.content || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                    {new Date(note.updatedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setEditing(note)}
                        aria-label={`Edit ${note.title}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDeleting(note)}
                        aria-label={`Delete ${note.title}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <NoteFormDialog open={creating} onOpenChange={setCreating} />
      <NoteFormDialog
        open={!!editing}
        onOpenChange={(open) => !open && setEditing(null)}
        note={editing}
      />
      <NoteDeleteDialog
        note={deleting}
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </>
  );
}
```

## [57] `features/notes/components/note-form.tsx`

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Textarea,
} from "@openconsole/shadcn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import type { Note } from "@/lib/db/schema";

import { createNote, updateNote } from "../actions";
import { noteKeys } from "../queries/keys";
import { NoteInput } from "../schemas";

type NoteFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: Note | null;
};

export function NoteFormDialog({
  open,
  onOpenChange,
  note,
}: NoteFormDialogProps) {
  const editing = !!note;
  const queryClient = useQueryClient();

  const form = useForm<NoteInput>({
    resolver: zodResolver(NoteInput),
    defaultValues: { title: "", content: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ title: note?.title ?? "", content: note?.content ?? "" });
    }
  }, [open, note, form]);

  const mutation = useMutation({
    mutationFn: async (input: NoteInput) => {
      return editing ? updateNote(note!.id, input) : createNote(input);
    },
    onSuccess: (row) => {
      queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) => {
        if (!row) return old;
        if (editing) return old.map((n) => (n.id === row.id ? row : n));
        return [row, ...old];
      });
      if (editing && note) {
        queryClient.setQueryData(noteKeys.detail(note.id), row);
      }
      toast.success(editing ? "Note updated" : "Note created");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit note" : "New note"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the title or content of this note."
              : "Add a new note to your list."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            id="note-form"
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
          >
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Untitled note"
                      autoFocus
                      maxLength={120}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Write something..."
                      rows={6}
                      maxLength={10_000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="note-form"
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? editing
                ? "Saving…"
                : "Creating…"
              : editing
                ? "Save changes"
                : "Create note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

## [58] `features/notes/components/note-delete-dialog.tsx`

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@openconsole/shadcn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { Note } from "@/lib/db/schema";

import { deleteNote } from "../actions";
import { noteKeys } from "../queries/keys";

type NoteDeleteDialogProps = {
  note: Note | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NoteDeleteDialog({
  note,
  open,
  onOpenChange,
}: NoteDeleteDialogProps) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: number) => deleteNote(id),
    onSuccess: ({ id }) => {
      queryClient.setQueryData<Note[]>(noteKeys.list(), (old = []) =>
        old.filter((n) => n.id !== id),
      );
      queryClient.removeQueries({ queryKey: noteKeys.detail(id) });
      toast.success("Note deleted");
      onOpenChange(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this note?</AlertDialogTitle>
          <AlertDialogDescription>
            {note?.title
              ? `"${note.title}" will be permanently removed.`
              : "This note will be permanently removed."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              if (note) mutation.mutate(note.id);
            }}
            disabled={mutation.isPending || !note}
          >
            {mutation.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

## [59] `features/notes/queries/keys.ts`

```ts
export const noteKeys = {
  all: () => ["notes"] as const,
  list: () => [...noteKeys.all(), "list"] as const,
  detail: (id: number) => [...noteKeys.all(), "detail", id] as const,
};
```

## [60] `features/notes/queries/options.ts`

```ts
import { queryOptions } from "@tanstack/react-query";

import { getNote, listNotes } from "../actions";
import { noteKeys } from "./keys";

export const noteQueries = {
  list: () =>
    queryOptions({
      queryKey: noteKeys.list(),
      queryFn: () => listNotes(),
      staleTime: 30 * 1000,
    }),
  detail: (id: number) =>
    queryOptions({
      queryKey: noteKeys.detail(id),
      queryFn: () => getNote(id),
      staleTime: 30 * 1000,
    }),
};
```

---

下一步:[`drizzle.md`](./drizzle.md) —— 数据库迁移产物
