# Scaffold —— `public/` 静态资源

| # | 文件 | 用途 |
| --- | --- | --- |
| 66 | `public/favicon.png` | 浏览器 tab 图标(32×32 png) |
| 67 | `public/loading.json` | `app/loading.tsx` 的 Lottie 动画源(可选) |

> **不要**把敏感配置 / `.env` / 密钥放进 `public/` —— 目录里所有文件都通过 HTTP 直接暴露。

---

## [66] `public/favicon.png`

二进制文件,放任意 32×32 png 即可。可临时用一张占位图,后续替换为品牌 logo。

`app/layout.tsx` 里通过 `icons: { icon: "/favicon.png" }` 引用。

## [67] `public/loading.json`

`app/loading.tsx` 用的 Lottie 动画源文件(可选)。

**获取方式**:

1. 去 [LottieFiles](https://lottiefiles.com/free-animations/loading) 下载任意符合品牌色的 Lottie JSON
2. 放进 `public/loading.json`
3. 文件名必须与 `app/loading.tsx` 里的 `src="/loading.json"` 对齐

**不想用 Lottie?** 把 `app/loading.tsx` 改成静态 Skeleton:

```tsx
import { Skeleton } from "@openconsole/shadcn";

export default function Loading() {
  return (
    <div className="flex min-h-svh w-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
```

---

至此,所有 66 个文件齐了。回到 [`../scaffold.md`](../scaffold.md) 的「完成后验证」段执行启动检查。

> Postgres / Redis / Nacos 不在骨架内 —— 它们的连接串都通过 `.env.local` 传入。Scaffold 流程开始前必须先用 AskUserQuestion 问用户拿到这些值,详见 [`../../SKILL.md`](../../SKILL.md) Step 1。
