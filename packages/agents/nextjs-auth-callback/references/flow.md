# 端到端流程

## 认证流程

```
1. 未鉴权访问
   GET /dashboard
   ▸ proxy.ts: 没有 token cookie
   ▸ 写 continue=/dashboard（5 分钟、httpOnly）
   ▸ 302 Location: ${LOGIN_URL}/login#redirect_uri=${APP}&source=sso

2. 外部登录
   浏览器跳到登录 SPA，SPA 读自己的 location.hash 拿 redirect_uri
   [用户完成登录]
   登录 SPA: window.location.href = "${APP}#token=…&tenant_code=…"

3. 回调 bootstrap（关键部分）
   GET /                                ← fragment 永远不到服务器
     Cookie: continue=/dashboard        ← 跨整段登录跳转保留下来了
   ▸ app/page.tsx 渲染 <Callback />，此时还没有 session
   浏览器 hydrate，useEffect 触发：
     ▸ window.location.hash → { token, tenant_code }
     ▸ history.replaceState 立刻清掉地址栏的 fragment
     ▸ POST / (authenticate Server Action)
         Set-Cookie: token=…   (httpOnly)
         Set-Cookie: tenant_code=…
         Set-Cookie: continue=; Max-Age=0   ← 消费掉
         Body: { next: "/dashboard" }       ← 从 continue cookie 读出来
     ▸ window.location.replace("/dashboard")

4. 已鉴权访问
   GET /dashboard
     Cookie: token=…
   ▸ proxy.ts: 有 token → NextResponse.next()
   ▸ 200 OK
```

## 三个关键机制

| 机制 | 为什么不能少 |
| --- | --- |
| proxy.ts 在 302 前写 `continue` cookie | URL fragment 无法跨登录页可靠传递"原始路径"；cookie 在浏览器侧能跨整段登录跳转保留 |
| `Sec-Fetch-Dest: document` 检查 | 后台探测（DevTools 的 `.well-known`、source map 等）不会污染 `continue` |
| `window.location.replace`（不是 `router.replace`） | 刚写好的 cookie 需要走完整页面导航才能稳带；软导航的 RSC fetch 会撞 "Failed to fetch RSC payload" |

## Fragment 参数说明

关于 fragment 里的 `source=sso` 字段：这只是登录服务约定的一个标识参数，名字"sso"是登录服务那边的命名，并不代表本 skill 实现了 SSO。把它换成 `source=login` 之类也完全可以——看登录服务期望什么字符串。
