# Self-Hosting Next.js(与本骨架对齐)

把统一骨架部署到 Vercel 之外的环境(裸机 / k8s / Docker / OpenNext)。本文与骨架的实际配置对齐 —— 不是通用 Next.js 自托管文档。

> 关键事实:
> - 骨架已开 `output: "standalone"`(`next.config.ts`)
> - 骨架已挂 `cacheHandler: "./cache-handler.mjs"`(用 `@neshca/cache-handler` + Redis,**不要**自己写一个 CommonJS class)
> - 包管理器是 `pnpm`(`package.json` engines 强制),Node ≥ `22.11`
> - **没有** `docker/docker-compose.yaml` —— Postgres / Redis / Nacos 都是外部依赖

---

## 标准 Dockerfile(对齐骨架)

```dockerfile
# syntax=docker/dockerfile:1.7

# ============================================================
# Stage 1: deps —— 缓存依赖层
# ============================================================
FROM node:22.11-alpine AS deps
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ============================================================
# Stage 2: builder —— 构建 standalone
# ============================================================
FROM node:22.11-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Drizzle 迁移(可选,通常在容器外跑;放这里防止漏)
# RUN pnpm db:migrate

RUN pnpm build

# ============================================================
# Stage 3: runner —— 最小生产镜像
# ============================================================
FROM node:22.11-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 非 root 用户
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# standalone 已经把所有 production deps 打进 .next/standalone/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# cache-handler.mjs 是单独文件,standalone 不一定打进去 —— 手动拷
COPY --from=builder --chown=nextjs:nodejs /app/cache-handler.mjs ./cache-handler.mjs

USER nextjs

EXPOSE 3000

# 健康检查接到骨架的 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

**镜像大小**:本骨架 + standalone 大约 200-300 MB(alpine + Node 22 + Next runtime + production deps)。

---

## 部署前 env 注入

容器启动时必须有以下 env(参考骨架 `.env.local`):

```bash
# 必填
DATABASE_URL=postgres://...
REDIS_URL=redis://...
NEXT_PUBLIC_AUTH_URL=https://login.example.com
NEXT_PUBLIC_APP_URL=https://app.example.com

# 可选 —— Nacos
NACOS_PROVIDER_ENABLED=true
NACOS_SERVER=nacos.internal:8848
NACOS_NAMESPACE=public
NACOS_USERNAME=...
NACOS_PASSWORD=...
NACOS_PROVIDER_SERVICE=<your-service-name>
```

> **不要**把 `NEXT_PUBLIC_*` 当作运行时变量传 —— Next 会在 `pnpm build` 时把它们烤进 client bundle。`NEXT_PUBLIC_*` 必须在 **build 之前**就定好(通过 build-args 或 build-time env)。

如果确实需要运行时可变的公开值,放个 `/api/config` route:

```ts
// app/api/config/route.ts
export async function GET() {
  return Response.json({
    features: process.env.FEATURES?.split(",") ?? [],
  });
}
```

---

## k8s manifest 速查

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <PROJECT_NAME>
spec:
  replicas: 3
  selector:
    matchLabels:
      app: <PROJECT_NAME>
  template:
    metadata:
      labels:
        app: <PROJECT_NAME>
    spec:
      containers:
        - name: app
          image: <your-registry>/<PROJECT_NAME>:<tag>
          ports:
            - containerPort: 3000
          envFrom:
            - secretRef:
                name: <PROJECT_NAME>-secrets    # DATABASE_URL / REDIS_URL / NACOS_*
            - configMapRef:
                name: <PROJECT_NAME>-config     # NEXT_PUBLIC_APP_URL / 非敏感 env
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
          resources:
            requests:
              memory: 256Mi
              cpu: 100m
            limits:
              memory: 512Mi
              cpu: 1000m
```

---

## Cache Handler —— 不要自己写

骨架的 `cache-handler.mjs` 已经用 `@neshca/cache-handler` + `redis@4` 实现了跨实例共享的 ISR / `'use cache'` 失效广播。**不要**:

- 自己写一个 CommonJS class 风格的 `cache-handler.js`(过时模式)
- 用 `lru-cache` 替换它(失去跨实例失效)
- 直接连 Redis 跳过 `@neshca/cache-handler`(失去 tag 失效的正确实现)

跨实例验证:

```bash
# 起 3 个实例(假设各自连同一个 REDIS_URL)
PORT=3001 node .next/standalone/server.js &
PORT=3002 node .next/standalone/server.js &
PORT=3003 node .next/standalone/server.js &

# 在 3001 写一条数据(走 Server Action),触发 updateTag("notes:list")
curl -X POST http://localhost:3001/.../create-note -d ...

# 3002 / 3003 立刻应该看到新数据
curl http://localhost:3002/notes
curl http://localhost:3003/notes
```

不一致就检查 `REDIS_URL` 是否指向同一个端点、`cache-handler.mjs` 的 `keyPrefix` 是否一致。

---

## ISR / Cache Components 多实例注意事项

| 行为 | 单实例 | 多实例 |
| --- | --- | --- |
| SSR | ✓ | ✓ |
| SSG / `generateStaticParams` | ✓ | ✓(构建时定) |
| `'use cache'` + `cacheTag` + `updateTag` | ✓ | ✓ **必须配 `cache-handler.mjs`**(骨架已配) |
| `revalidatePath` / `revalidateTag`(老 API) | ✓ | ✓(走 cache handler) |
| Image Optimization | ✓ | ✓(CPU 较重,大流量考虑外部 CDN loader) |
| `next/font` | ✓ | ✓(build 时打包) |
| Draft Mode | ✓ | ✓(cookie 驱动) |

---

## Image Optimization

骨架默认走 Next 内置图片优化(`<Image>`)。流量大时考虑:

### 限制变体大小

```ts
// next.config.ts
const nextConfig: NextConfig = {
  // ... 已有配置
  images: {
    minimumCacheTTL: 60 * 60 * 24,
    deviceSizes: [640, 750, 1080, 1920],
  },
};
```

### 走外部 loader(Cloudinary / Imgix)

```ts
// next.config.ts
images: {
  loader: "custom",
  loaderFile: "./lib/image-loader.ts",
},
```

```ts
// lib/image-loader.ts
export default function cloudinaryLoader({ src, width, quality }: {
  src: string; width: number; quality?: number;
}) {
  const params = ["f_auto", "c_limit", `w_${width}`, `q_${quality ?? "auto"}`];
  return `https://res.cloudinary.com/<your-cloud>/image/upload/${params.join(",")}${src}`;
}
```

---

## OpenNext —— Serverless 部署

[OpenNext](https://open-next.js.org/) 适配 Next 到 AWS Lambda / Cloudflare Workers / Netlify 等。骨架的 `cacheHandler` + `output: "standalone"` 配置与 OpenNext 兼容。注意:

- Lambda 冷启动会触发 `instrumentation.ts` 的 Nacos `init()`,可能让首次响应变慢。可以加 `NACOS_PROVIDER_ENABLED=false` 关掉 provider 注册保留服务发现。
- Cloudflare Workers 不支持 Node 完整 API,某些 npm 包不可用 —— 跑前先用 OpenNext 的 cloudflare adapter 验证。

---

## 部署前检查清单

| 项 | 验证 |
| --- | --- |
| `pnpm build` 通过且无 warning | `pnpm build` |
| Standalone 可独立运行 | `node .next/standalone/server.js` |
| `.env` 有所有必填变量 | `cat .env \| grep -E "DATABASE_URL\|REDIS_URL\|NEXT_PUBLIC_"` |
| `cache-handler.mjs` 的 `keyPrefix` 是项目名,不是默认 | 检查 `keyPrefix: "<PROJECT_NAME>:cache:"` |
| `images.remotePatterns` 含所有外部图片域 | `grep remotePatterns next.config.ts` |
| `HOSTNAME="0.0.0.0"` 在容器 env 里 | k8s manifest / Dockerfile |
| 健康检查 `/api/health` 接 LB readiness | `curl <pod>/api/health` 返回 `{"status":"ok"}` |
| Nacos 注册(若启用) | 上 nacos 控制台看实例 |
| 跨实例 cache 失效 | 多副本 → 改一条数据 → 所有副本 read-your-writes |

---

## 与其它文档的关系

| 主题 | 看哪 |
| --- | --- |
| `cache-handler.mjs` 实现细节 | [`../../redis-development/SKILL.md`](../../../redis-development/SKILL.md) §2 |
| `next.config.ts` 每个字段 | [`../configs.md`](../configs.md) |
| 启动前 / Code Review 完整 checklist | [`../checklist.md`](../checklist.md) |
| Server Action 多实例语义 | [`../data-layer.md`](../data-layer.md) |
