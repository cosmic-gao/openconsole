# 安全检查

## 已实现的安全措施

- [x] Token cookie 是 `httpOnly`（XSS 读不到）
- [x] 生产环境加 `Secure` 标志（只在 HTTPS 上发送）
- [x] `SameSite: lax`（顶层跨站导航能带，后台 fetch 拦截掉）
- [x] Token 长度上限（`max(4096)` —— 大 JWT 可以放宽）
- [x] `tenant_code` 用正则 `/^[A-Za-z0-9_-]+$/` 防 CRLF 注入
- [x] `resolve()` 拒绝外部 URL（必须以单 `/` 开头、不允许 `//` 开头）
- [x] `Sec-Fetch-Dest: document` 守卫 `continue` cookie，防探测污染
- [x] `history.replaceState` 立刻清掉地址栏的 fragment
- [x] Server Action 用 zod 校验入参（即便客户端被绕过也守得住）

## 未实现的安全措施

| 项目 | 说明 | 何时实现 |
| --- | --- | --- |
| CSRF `state` 参数 | 如果登录服务支持就加上；不加的话，知道 redirect_uri 的攻击者可以构造任意 token 灌给 `authenticate` Action | 登录服务支持时 |
| Token 签名验证 | 如果你收到的是 JWT，应该在 `getSession()` 里用登录服务的 JWKS 验签 | 收到 JWT 时 |
