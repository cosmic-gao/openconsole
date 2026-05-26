# React 组合模式(索引)

`rules/` 下的 8 条规则是 [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `vercel-composition-patterns` 规则集的本地副本。本文件是索引,**没有正文** —— 找具体规则按下表直接进 `rules/`。

> 这套规则与统一骨架的 `nextjs-best-practices` / `ui` skill **互补、不冲突**:
> - 这里讲「怎么组合 React 组件」(架构层面)
> - `nextjs-best-practices` 讲「Next.js 怎么写」(框架层面)
> - `ui` 讲「用哪个 UI 库,怎么用」(库选型层面)
>
> 设计新组件时三方都要参考。

---

## 主题目录

### 1. 组件架构 (HIGH)

| 规则 | 文件 | 何时翻 |
| --- | --- | --- |
| 避免布尔 prop 增生 | [`rules/architecture-avoid-boolean-props.md`](./rules/architecture-avoid-boolean-props.md) | 组件已有 3+ 个 `isXxx` / `hasXxx` 布尔 prop |
| 使用 Compound Components | [`rules/architecture-compound-components.md`](./rules/architecture-compound-components.md) | 设计一组**协作的子组件**(Tabs / Select / Dialog 等) |

### 2. 状态管理 (MEDIUM)

| 规则 | 文件 | 何时翻 |
| --- | --- | --- |
| 状态管理与 UI 解耦 | [`rules/state-decouple-implementation.md`](./rules/state-decouple-implementation.md) | 组件难以单元测试,因为 UI 与状态混在一起 |
| Context 接口用于依赖注入 | [`rules/state-context-interface.md`](./rules/state-context-interface.md) | 子组件需要订阅一组共享状态(比 props drilling 更优雅) |
| 把状态提升到 Provider | [`rules/state-lift-state.md`](./rules/state-lift-state.md) | 多个兄弟组件需要协作共享状态 |

### 3. 实现模式 (MEDIUM)

| 规则 | 文件 | 何时翻 |
| --- | --- | --- |
| 显式 variants 替代布尔组合 | [`rules/patterns-explicit-variants.md`](./rules/patterns-explicit-variants.md) | 你正在加 `variant` / `size` 这类外观参数(对照 shadcn 的 `cva` 用法) |
| 组合 children 替代 render props | [`rules/patterns-children-over-render-props.md`](./rules/patterns-children-over-render-props.md) | 在写 `(state) => JSX` 风格的 API,考虑改用 children + context |

### 4. React 19 API (MEDIUM)

| 规则 | 文件 | 何时翻 |
| --- | --- | --- |
| 不要再用 `forwardRef` | [`rules/react19-no-forwardref.md`](./rules/react19-no-forwardref.md) | React 19 起 `ref` 直接是 prop,`forwardRef` 是反模式 |

---

## 与骨架其它 skill 的关系

| 场景 | 看哪 |
| --- | --- |
| 在 features 里加新组件 | 先 [`../ui/SKILL.md`](../ui/SKILL.md)(用 atoms/shadcn 还是自拼)→ 再翻这里(组合方式) |
| 设计 `<XxxProvider>` + 子组件 | [`rules/state-context-interface.md`](./rules/state-context-interface.md) + [`rules/architecture-compound-components.md`](./rules/architecture-compound-components.md) |
| 重构布尔 prop 太多的组件 | [`rules/architecture-avoid-boolean-props.md`](./rules/architecture-avoid-boolean-props.md) + [`rules/patterns-explicit-variants.md`](./rules/patterns-explicit-variants.md) |
| `forwardRef` 报警 | [`rules/react19-no-forwardref.md`](./rules/react19-no-forwardref.md) |
