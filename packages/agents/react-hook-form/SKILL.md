---
name: react-hook-form
description: |
  Form state management with react-hook-form + @hookform/resolvers/zod + @openconsole/shadcn Form components. Use whenever the user is building, validating, or debugging a form in this template — create/edit pages, sheet-based inline forms, multi-step wizards, file uploads. Triggers on "build a form", "form validation", "useForm", "zodResolver", "form submission", "FormField", "react-hook-form". Replaces the upstream `tanstack-form` skill — this template does NOT use TanStack Form.
---

# React Hook Form + Zod + shadcn Form

> **Replaces the upstream `tanstack-form` skill.** This template uses `react-hook-form` + `@hookform/resolvers/zod` + `@openconsole/shadcn` Form components. If you see TanStack Form patterns elsewhere (the source repo's `useAppForm`, `useFormFields<T>()`, `form.AppForm`, `form.Form`), translate them to the patterns here.

## Stack

| Concern | Choice |
| --- | --- |
| State + validation entry point | `react-hook-form` `useForm` |
| Schema-driven validation | `@hookform/resolvers/zod` `zodResolver` |
| Field layout + accessibility | `@openconsole/shadcn` `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` |
| Submission | `@tanstack/react-query` `useMutation` invoking a Server Action |
| Toasts | `sonner` |
| Navigation after success | `next/navigation` `useRouter` |

## The canonical pattern

权威实现:`features/notes/components/note-form.tsx`(opentemplate)。模板里
用的是 Dialog 形式,逻辑相同。

```tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  Button,
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
  Input, Textarea,
} from "@openconsole/shadcn";

import type { Note } from "@/lib/db/schema";

import { createNote, updateNote } from "../actions";
import { noteKeys } from "../queries/keys";
import { NoteInput } from "../schemas";

export function NoteForm({ initial }: { initial?: Note }) {
  const router = useRouter();
  const qc = useQueryClient();

  const form = useForm<NoteInput>({
    resolver: zodResolver(NoteInput),
    defaultValues: initial
      ? { title: initial.title, content: initial.content }
      : { title: "", content: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: NoteInput) =>
      initial ? updateNote(initial.id, values) : createNote(values),
    onSuccess: (row) => {
      // 直接 setQueryData 避免一次 refetch
      qc.setQueryData<Note[]>(noteKeys.list(), (old = []) => {
        if (!row) return old;
        return initial
          ? old.map((n) => (n.id === row.id ? row : n))
          : [row, ...old];
      });
      toast.success(initial ? "已更新" : "已创建");
      router.push("/notes");
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>标题</FormLabel>
              <FormControl>
                <Input placeholder="给这条笔记起个名字" {...field} />
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
              <FormLabel>内容</FormLabel>
              <FormControl>
                <Textarea rows={10} placeholder="正文（最长 10000 字）" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={mutation.isPending}
          >
            取消
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

## Schema-driven validation

Zod schema 是单一事实来源 —— 同一个 schema 在客户端经 `zodResolver` 校验、在 Server Action 内经 `Schema.parse(input)` 校验。

```ts
// features/notes/schemas.ts(opentemplate 模板原样)
import { z } from "zod";

export const NoteInput = z.object({
  title: z.string().trim().min(1, "Title is required").max(120),
  content: z.string().trim().max(10_000),
});

export type NoteInput = z.infer<typeof NoteInput>;

export const NoteId = z.coerce.number().int().positive();
```

数据库行的 TS 类型来自 Drizzle:

```ts
// lib/db/schema/notes.ts
export type Note = typeof notes.$inferSelect;     // 查询出来的形态
export type NewNote = typeof notes.$inferInsert;  // 插入用的形态
```

业务里 `import type { Note } from "@/lib/db/schema"`,**不**自己用 zod 再造一份。

`<FormMessage />` automatically reads from `form.formState.errors[name]` — no wiring needed.

## Field component reference

All from `@openconsole/shadcn`:

| Use | Field components | Notes |
| --- | --- | --- |
| Single-line text | `Input` | `type="text"` default; `"email"`, `"number"`, `"password"` available |
| Multi-line text | `Textarea` | `rows={10}` for big fields |
| Dropdown | `Select` + `SelectTrigger` + `SelectContent` + `SelectItem` + `SelectValue` | wire `onValueChange={field.onChange}` |
| Boolean | `Checkbox` | `checked={field.value}` + `onCheckedChange={field.onChange}` |
| Boolean (toggle) | `Switch` | same wiring as Checkbox |
| Multi-choice | `RadioGroup` + `RadioGroupItem` | `value={field.value}` + `onValueChange={field.onChange}` |
| Date | `Calendar` inside `Popover` | requires `react-day-picker` (already a dep) |

Always wrap a field with `<FormField control={form.control} name="…" render={({ field }) => (<FormItem>…</FormItem>)} />`. Inside `<FormItem>`: `FormLabel`, `FormControl` (wraps the input), `FormMessage` (error slot).

## Number inputs

`<Input type="number" />` gives you a string; the form value needs to be a number. Convert in `onChange`:

```tsx
<FormField
  control={form.control}
  name="total"
  render={({ field }) => (
    <FormItem>
      <FormLabel>金额</FormLabel>
      <FormControl>
        <Input
          type="number"
          {...field}
          onChange={(e) => field.onChange(Number(e.target.value))}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

Or use `z.coerce.number()` on the schema and accept a string from the input — both approaches work.

## Form-level validation

For cross-field rules:

```ts
export const TransferFormSchema = z.object({
  from: z.string(),
  to: z.string(),
  amount: z.number().positive(),
}).refine((data) => data.from !== data.to, {
  message: "源和目标账户不能相同",
  path: ["to"],
});
```

The error appears on the `to` field via `path`.

## Defense in depth — server still validates

模板里的每个 Server Action 都用同一份 schema 做 `Schema.parse(input)`:

```ts
"use server";

import { unauthorized } from "next/navigation";

import { getSession } from "@/features/auth/server/session";

import { NoteId, NoteInput } from "./schemas";

export async function updateNote(rawId: unknown, input: unknown) {
  const session = await getSession();
  if (!session) unauthorized();

  const id = NoteId.parse(rawId);
  const { title, content } = NoteInput.parse(input);    // ZodError on bad input
  // …mutation
}
```

即使脚本绕过客户端表单,服务端仍然拒绝。抛出的 `ZodError` 会通过
`useMutation.onError` 暴露给业务。

## Sheet / Dialog forms

For inline create/edit inside a side panel (no dedicated route):

```tsx
"use client";

import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@openconsole/shadcn";

export function NoteFormSheet({
  note,
  open,
  onOpenChange,
}: {
  note?: Note;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isEdit = !!note;
  const form = useForm<NoteInput>({
    resolver: zodResolver(NoteInput),
    defaultValues: note ?? { title: "", content: "" },
  });
  const mutation = useMutation({
    mutationFn: (values: NoteInput) =>
      isEdit ? updateNote(note.id, values) : createNote(values),
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEdit ? "编辑笔记" : "新建笔记"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-auto">
          <Form {...form}>
            <form
              id="note-sheet-form"
              onSubmit={form.handleSubmit((v) => mutation.mutate(v))}
              className="space-y-4"
            >
              {/* FormField entries */}
            </form>
          </Form>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="submit" form="note-sheet-form" disabled={mutation.isPending}>
            {mutation.isPending ? "保存中…" : isEdit ? "更新" : "创建"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

The `<button form="note-sheet-form">` in the sheet footer connects to the form's `id` so the submit lives outside the form element.

## Multi-step forms

Track step in local state; validate the step's fields via `form.trigger()`:

```tsx
const STEPS = [
  ["customer"],
  ["status", "total"],
] as const;

const [step, setStep] = useState(0);
const form = useForm<OrderInput>({
  resolver: zodResolver(OrderInput),
  defaultValues: { customer: "", status: "pending", total: 0 },
});

const next = async () => {
  const ok = await form.trigger(STEPS[step]);   // validates just this step's fields
  if (ok) setStep((s) => s + 1);
};
```

## Reset / dirty / touched

- `form.reset(values?)` — reset to defaults or a new value set.
- `form.formState.isDirty` — true once the user has changed any field.
- `form.formState.isSubmitting` — true while the submit handler is running.
- `form.formState.dirtyFields` — map of changed fields, useful for partial-update PATCHes.

## Performance — `mode` and `reValidateMode`

By default `react-hook-form` validates on submit. For inline feedback:

```ts
const form = useForm({
  resolver: zodResolver(schema),
  mode: "onBlur",         // validate when a field loses focus
  reValidateMode: "onChange",  // after first validation, re-check on every change
});
```

`mode: "onChange"` is heaviest — only use it when the UX benefit is worth it.

## Common mistakes

| Mistake | Effect | Fix |
| --- | --- | --- |
| Forgetting `"use client"` at the top | Server Component can't use hooks | add the directive |
| `<FormItem>` without `<FormField>` wrapper | label/error don't bind | always `FormField → render → FormItem` |
| Plain `<input>` instead of `<FormControl><Input /></FormControl>` | label/error don't connect via `id`/`aria-describedby` | use `FormControl` |
| `defaultValues: undefined` for an edit form | controlled-to-uncontrolled warning | `initial ?? { …concrete defaults }` |
| `field.value` undefined on a Select | uncontrolled warning | sensible default in `defaultValues` |
| Forgetting `qc.invalidateQueries(...)` in `onSuccess` | list/detail pages stay stale | always invalidate L2 after a write |
| `form.reset()` after `router.push` | runs against unmounted form | drop the reset; let unmount clean up |
| `mode: "onChange"` for a 30-field form | re-validates the entire schema on every keystroke | `"onBlur"` instead |
| `field.onChange(e.target.value)` for `type="number"` | string saved to a `z.number()` field | `field.onChange(Number(e.target.value))` |
| Skipping server-side `Schema.parse()` | client bypass = bad data through | every Server Action validates again |

## Migrating from TanStack Form

If you're translating examples from the source repo:

| TanStack Form | react-hook-form equivalent |
| --- | --- |
| `useAppForm({ defaultValues, validators: { onSubmit: schema }, onSubmit })` | `useForm({ resolver: zodResolver(schema), defaultValues })` + `form.handleSubmit(onSubmit)` |
| `useFormFields<T>()` typed field components | plain `FormField` from `@openconsole/shadcn` (less type ergonomics, more familiar React patterns) |
| `<form.AppForm><form.Form>...</form.Form></form.AppForm>` | `<Form {...form}><form onSubmit={form.handleSubmit(...)}>...</form></Form>` |
| `<form.SubmitButton>` (auto-disable on invalid/submitting) | `<Button type="submit" disabled={mutation.isPending}>` |
| `validators: { onChange: zodValidator(schema) }` | `mode: "onChange"` + `resolver: zodResolver(schema)` |
| `form.AppField` low-level render-prop | `Controller` from `react-hook-form` (or just use `field` inside `FormField`'s render) |
