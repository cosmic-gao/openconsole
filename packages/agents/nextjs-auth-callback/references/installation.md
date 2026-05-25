# 安装步骤

## 安装前问用户

用 AskUserQuestion 问用户两个网址。**面向用户的话术保持口语化**：

```jsonc
{
  "questions": [
    {
      "question": "登录页面的网址是什么？没登录的用户会被自动跳过去登录。",
      "header": "登录地址",
      "options": [
        { "label": "https://app.mspbots.ai", "description": "示例：换成你的登录系统地址" },
        { "label": "https://appstg.mspbots.ai", "description": "示例：测试环境的登录地址" }
      ],
      "multiSelect": false
    },
    {
      "question": "你当前应用部署在哪里？登录完成后会跳回到这里。",
      "header": "应用地址",
      "options": [
        { "label": "http://localhost:3000", "description": "本地开发（在自己电脑上调试）" },
        { "label": "https://app.example.com", "description": "线上正式部署（换成你的实际域名）" }
      ],
      "multiSelect": false
    }
  ]
}
```

拿到答案后写入 `.env.local`：

```env
NEXT_PUBLIC_AUTH_URL=<问题 1 的答案>
NEXT_PUBLIC_APP_URL=<问题 2 的答案>
```

## 可调参数

| 参数 | 位置 | 默认值 | 何时改 |
| --- | --- | --- | --- |
| Token cookie 名 | `lib/auth/cookies.ts` `TOKEN_COOKIE` | `"token"` | 后端要求特定名字 |
| Token 有效期 | `TOKEN_MAX_AGE` | 30 天 | 匹配真实会话时长 |
| 公开路径白名单 | `proxy.ts` `PUBLIC_PATHS` | `["/"]` | 加 `/health`、`/about` 等未登录可访问的路径 |
| 默认登录后落地页 | `authenticate.ts` `resolve()` fallback | `"/dashboard"` | 你应用的默认首页 |
| 登录页路径 | `proxy.ts` `new URL("/login", …)` | `/login` | 登录服务用 `/auth/sign-in` 等其它路径时改 |
| Fragment 字段名 | `proxy.ts` + `callback.tsx` | `redirect_uri`、`source`、`token`、`tenant_code` | 匹配登录服务实际字段 |

## 文件清单

### 可直接拷贝的文件（项目里通常没有）

- `lib/auth/cookies.ts`
- `lib/auth/session.ts`
- `lib/auth/guards.ts`
- `lib/auth/authenticate.ts`
- `features/auth/components/callback.tsx`
- `features/auth/index.ts`

### 需要合并的文件（项目里通常已存在）

- `env.ts`
- `proxy.ts`（如果存在）
- `app/page.tsx`

## 验收清单

装完跟用户对一遍：

- [ ] 创建了 `lib/auth/{cookies,session,guards,authenticate}.ts` 四个文件
- [ ] 创建了 `features/auth/{index.ts,components/callback.tsx}` 两个文件
- [ ] 创建/合并了 `proxy.ts`
- [ ] `env.ts` 包含 `NEXT_PUBLIC_AUTH_URL` + `NEXT_PUBLIC_APP_URL` 两条 schema 字段 + runtimeEnv 映射
- [ ] `app/page.tsx` 包含 `<Callback />` 渲染
- [ ] `.env.local` 填了两个 URL（提示用户填）
- [ ] 访问受保护路径（如 `/dashboard`）会被 302 跳到 `NEXT_PUBLIC_AUTH_URL/login`
- [ ] 模拟登录回来（手动构造 `#token=test&tenant_code=demo` 到 `/`），cookie 被写、跳回 `/dashboard`
