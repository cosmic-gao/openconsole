# 性能优化（按需查阅）

整合自 [vercel-react-best-practices](https://github.com/vercel-labs/agent-skills) 的 64 条规则，挑出最高 ROI 的一组。性能 profiling 显示具体瓶颈再查；不要预先优化。

## 高 ROI 规则（先看这些）

### Server-side：用 `React.cache()` 去重

同一 RSC 请求里多个组件调同一函数，自动去重，避免重复 IO：

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

本项目 `features/auth/server/session.ts` 的 `getSession()` 已经用 `React.cache()` 包过。

### 不要在组件里定义内嵌组件

```tsx
// ❌ 每次 render 都重新定义，React 当新组件，子树重 mount
function Page() {
  const Inner = () => <div>...</div>;
  return <Inner />;
}

// ✓ 抽到外面
const Inner = () => <div>...</div>;
function Page() {
  return <Inner />;
}
```

### 派生状态在 render 里算，不用 useEffect

```tsx
// ❌ useEffect 多一次 render
const [fullName, setFullName] = useState("");
useEffect(() => setFullName(`${first} ${last}`), [first, last]);

// ✓ 直接派生
const fullName = `${first} ${last}`;
```

### 非紧急更新用 `useTransition`

```tsx
const [pending, startTransition] = useTransition();

const handleClick = () => {
  startTransition(() => {
    setBigList(computeExpensive());  // 不阻塞输入响应
  });
};
```

### 长列表用 `content-visibility`

```css
.list-item {
  content-visibility: auto;
  contain-intrinsic-size: 200px;
}
```

视口外的项不渲染、不计算样式。

### 把 effect 里的"响应交互"逻辑挪到 event handler

```tsx
// ❌ useEffect 监听 state 变化做事，多一次 render
useEffect(() => {
  if (justSubmitted) showToast();
}, [justSubmitted]);

// ✓ 在事件处理里直接做
const handleSubmit = () => {
  saveData();
  showToast();
};
```

### `useDeferredValue` 给昂贵渲染一个缓冲

```tsx
const deferredQuery = useDeferredValue(query);
// deferredQuery 滞后于 query，input 仍然响应快
return <ExpensiveList query={deferredQuery} />;
```

### Effect 依赖用 primitive，不用对象

```tsx
// ❌ 每次 render 对象新引用，effect 总跑
useEffect(() => fetch(filters), [filters]);

// ✓ 解构出 primitive
useEffect(() => fetch({ status, page }), [status, page]);
```

### 把不需要订阅的 state 放 ref

频繁变化但只在 event handler / effect 里用的值（鼠标位置、滚动位置等）：

```tsx
const scrollY = useRef(0);

useEffect(() => {
  const onScroll = () => { scrollY.current = window.scrollY; };
  window.addEventListener("scroll", onScroll, { passive: true });
  return () => window.removeEventListener("scroll", onScroll);
}, []);
```

ref 改变不触发 render。

### `passive: true` 滚动监听

```ts
element.addEventListener("scroll", handler, { passive: true });
```

告诉浏览器你不会 preventDefault，浏览器可以并行滚动+JS，scroll FPS 显著提升。

---

## 打包侧（高 ROI）

### 避免 barrel 导入

```ts
// ❌ 整个 barrel 拉进来
import { Button, Card, Modal } from "@my-org/ui";

// ✓ 直接路径
import { Button } from "@my-org/ui/button";
```

### 重组件用 `next/dynamic`

```tsx
const Chart = dynamic(() => import("@/features/dashboard/components/chart"), {
  loading: () => <div>加载中...</div>,
  ssr: false,
});
```

适合：图表库（recharts/echarts）、富文本编辑器、Markdown 渲染器（几百 KB 量级）。

### 延迟加载第三方脚本

```tsx
import Script from "next/script";

<Script src="https://analytics.example.com/script.js" strategy="lazyOnload" />
```

`lazyOnload` 在 onLoad + 浏览器空闲后执行，不影响 LCP / FID。

---

## 服务端侧（高 ROI）

### Server Action 也要鉴权

Server Actions 是公开 RPC 端点，客户端能直接构造请求调。**所有改用户数据的 Action 第一行调 `protect()`**。

```ts
"use server";
import { protect } from "@/lib/auth/guards";

export async function deleteOrder(id: string) {
  await protect();  // 强制
  // ...
}
```

### 跨请求缓存用 LRU

`React.cache()` 只在单请求内去重。跨请求要缓存（昂贵的第三方 API 调用、不变的配置）用 LRU：

```ts
import LRU from "quick-lru";

const cache = new LRU<string, Data>({ maxSize: 100 });

export async function getData(id: string) {
  if (cache.has(id)) return cache.get(id);
  const data = await fetchExpensive(id);
  cache.set(id, data);
  return data;
}
```

Next 16 推荐用 `'use cache'` + `cacheTag()` 替代手写 LRU——除非你需要更精细的失效控制。

### 静态 IO（字体、logo）放模块级

```ts
// ❌ 每次请求都读
async function Page() {
  const logo = await fs.readFile("logo.svg");
  return <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} />;
}

// ✓ 模块级，启动时读一次
const logoData = await fs.readFile("logo.svg");
const logoSrc = `data:image/svg+xml;base64,${logoData.toString("base64")}`;

function Page() {
  return <img src={logoSrc} />;
}
```

### 跨 RSC 边界少传数据

Server → Client 传的 props 要序列化、传输、反序列化。只传客户端真需要的字段：

```tsx
// ❌ 传整个 user 对象（含 hashedPassword 等敏感字段！）
<Profile user={user} />

// ✓ 只传需要展示的字段
<Profile name={user.name} avatarUrl={user.avatarUrl} />
```

### 后续清理用 `after()`

```ts
import { after } from "next/server";

export async function POST(req: Request) {
  const result = await processOrder(...);

  after(async () => {
    await logToAnalytics(...);  // 不阻塞响应
    await sendNotification(...);
  });

  return Response.json(result);
}
```

---

## JavaScript 微优化（低 ROI，profiling 看见再用）

下面这些规则单独看是 micro-optimization，profiling 发现具体热点时才需要：

- `Set` / `Map` 比数组的 `.includes()` 快得多（大量查找时）
- 数组 `length` 在循环条件里先读出来
- 循环外 hoist 出 RegExp 字面量
- 用 `Array.toSorted()` 而非 `.sort()`（避免 in-place 变异）
- 用 `flatMap` 把 map+filter 合一
- 模块级 `Map` 缓存纯函数结果

更细的规则集： [vercel-react-best-practices rules](https://github.com/vercel-labs/agent-skills/tree/main/skills/vercel-react-best-practices/rules)

---

## Rendering 细节（中 ROI）

### 三元而非 `&&` 写条件渲染

```tsx
// ⚠️ 边缘情况：数字 0 / 空字符串会渲染出来
{items.length && <List items={items} />}  // items.length=0 时会输出 "0"

// ✓ 显式三元
{items.length > 0 ? <List items={items} /> : null}
```

### 静态 JSX 抽出组件

```tsx
// ❌ 每次 render 重新构造
function App() {
  return <div><Logo /><Nav /></div>;
}

// 如果有大量静态 JSX，抽出来，让 React 跳过 reconcile
const StaticHeader = <><Logo /><Nav /></>;
function App() {
  return <div>{StaticHeader}</div>;
}
```

### 资源提示（preload / preconnect）

```tsx
// React 19 DOM API
import { preload, preconnect } from "react-dom";

preconnect("https://api.example.com");
preload("/critical-image.jpg", { as: "image" });
```

或者 `<link rel="preconnect">` 写在 head 里。

---

## 何时**不**优化

- 还没 profile 之前
- 代码可读性更重要的地方
- 改动让代码难懂、难改的时候
- 微秒级差异、用户感知不到的地方

React 19 的 React Compiler 自动做了大量 memo 工作（本项目暂未启用，可在 `next.config.ts` 加 `reactCompiler: true` 开启），手动 `React.memo` / `useMemo` / `useCallback` 的必要性下降了很多。
