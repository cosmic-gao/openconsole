# Scaffold —— `config/` 静态配置

> 纯数据 + 纯类型,**禁止**带副作用(不能 `fetch` / 读 cookie / 调 API)。

| # | 文件 | 用途 |
| --- | --- | --- |
| 30 | `config/site.ts` | name / description / defaultRedirect |
| 31 | `config/sidebar.ts` | 侧边栏菜单数据(icon 必须是字符串) |

---

## [30] `config/site.ts`

> `name` 与 `defaultRedirect` 用用户在 SKILL.md Step 1/3 填入的值替换。

```ts
export const siteConfig = {
  name: "<PROJECT_DISPLAY_NAME>",
  description: "<PROJECT_DISPLAY_NAME> Dashboard",
  defaultRedirect: "<DEFAULT_REDIRECT>",
} as const;
```

## [31] `config/sidebar.ts`

> `icon` 必须是 lucide-react 图标的字符串名(PascalCase),不是组件 —— 这份数据要从 RSC 序列化到 client。

```ts
import type { SidebarProps } from "@openconsole/atoms";

export const siderConfig: Pick<SidebarProps, "brand" | "menu"> = {
  brand: {
    name: "<PROJECT_DISPLAY_NAME>",
    logo: "Command",
    description: "NextJs + ShadcnUI",
  },
  menu: [
    {
      items: [
        {
          label: "Dashboard",
          href: "/dashboard",
          icon: "LayoutDashboard",
        },
        {
          label: "Notes",
          href: "/notes",
          icon: "NotebookPen",
        },
      ],
    },
  ],
};
```

---

下一步:[`lib.md`](./lib.md) —— 跨 feature 基建(db / redis / query / request / logger)
