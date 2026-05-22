# Nx 配置指南

本仓库使用 [Nx 22](https://nx.dev) 作为 monorepo 任务编排与缓存层,叠加在
pnpm workspaces 之上。本文档说明:

1. 我们为什么用 Nx,以及只用 Nx 做什么
2. 仓库的项目布局如何映射到 Nx
3. 日常命令速查
4. `nx.json` 关键配置解读
5. 远程缓存与 CI 接入
6. 常见排错

---

## 一、为什么用 Nx?

本仓库是典型的 **package-based monorepo**(基于 pnpm workspace),所有
包都以 `index.ts` 作为入口直接导出源码,不存在统一的产物构建步骤。
我们用 Nx 仅做三件事:

| 用途 | 收益 |
|---|---|
| **任务编排** | `nx run-many -t typecheck` 一次跑齐所有包;`dependsOn: ^typecheck` 自动按依赖图顺序触发上游包的 typecheck |
| **本地缓存** | `tsc --noEmit` / `vitest run` 等任务首次执行后写缓存,源码未变时直接复用;Windows / Mac / Linux 通用 |
| **affected 模式** | 在 CI 上只跑受影响的项目,而不是全量 |

我们**没用** Nx 的:
- `@nx/js`、`@nx/vite` 等 plugin 推断目标 —— 所有 target 由各包 `package.json` 的
  `scripts` 字段显式声明,行为透明可控
- 代码生成器(generators)—— 新包用 pnpm + 手写 `package.json` 即可
- Nx Console / Nx Cloud 强制依赖

---

## 二、项目布局

```
openconsole/
├── apps/                       # 应用层(目前为空,预留)
├── configs/
│   └── tsconfig/               # @openconsole/tsconfig: 共享 TS 配置
├── packages/
│   ├── atoms/                  # @openconsole/atoms: 高阶 UI 组件
│   ├── shadcn/                 # @openconsole/shadcn: shadcn 原语
│   ├── graph/                  # @openconsole/graph: 图算法
│   ├── heap/                   # @openconsole/heap: 堆数据结构
│   ├── signal/                 # @openconsole/signal: 响应式信号
│   ├── tunnel/                 # @openconsole/tunnel: 跨进程 RPC
│   └── nacos/                  # @openconsole/nacos: Nacos 客户端
├── nx.json                     # Nx 工作空间配置
├── package.json                # 根脚本(全部代理到 nx 命令)
├── pnpm-workspace.yaml         # pnpm workspace 范围声明
└── NX.md                       # 本文档
```

Nx 通过扫描 `pnpm-workspace.yaml` 中声明的 glob(`apps/**`、`configs/**`、
`packages/**`)自动识别所有项目,**无需** `project.json` 文件。每个项目的
任务(targets)直接对应其 `package.json` 的 `scripts`。

跑 `pnpm nx show projects` 可查看 Nx 识别到的全部项目:

```
@openconsole/atoms
@openconsole/graph
@openconsole/heap
@openconsole/nacos
@openconsole/shadcn
@openconsole/signal
@openconsole/tsconfig
@openconsole/tunnel
```

---

## 三、命令速查

所有根命令都封装在根 `package.json` 的 `scripts` 里。在仓库根目录运行:

### 跨所有项目

```bash
pnpm test           # 跑所有项目的 test
pnpm typecheck      # 跑所有项目的 typecheck
pnpm check          # 跑所有项目的 check (typecheck + test)
pnpm lint           # 跑所有项目的 lint(若配置)
pnpm graph          # 在浏览器里打开项目依赖图
```

底层都是 `nx run-many -t <target>`。

### 只跑受影响的项目(CI 友好)

`affected` 通过 git diff 计算变更项目,只跑这些项目及其下游:

```bash
pnpm affected:test
pnpm affected:typecheck
pnpm affected:check
```

默认基准分支是 `main`(在 [`nx.json`](./nx.json) 的 `defaultBase` 里定义)。
显式指定基准:

```bash
pnpm nx affected -t test --base=origin/main --head=HEAD
```

### 单项目命令

```bash
# 命名方式: pnpm nx run <project>:<target>
pnpm nx run @openconsole/heap:typecheck
pnpm nx run @openconsole/graph:test
pnpm nx run @openconsole/graph:check
```

或者用项目名简写(无作用域时):

```bash
pnpm nx test @openconsole/heap
pnpm nx typecheck @openconsole/graph
```

### 缓存管理

```bash
pnpm nx reset       # 清空本地缓存 + workspace 数据
pnpm reset          # 同上(根脚本封装)
```

### 发布(仅 atoms / shadcn / nacos)

```bash
pnpm release:dry-run        # 预演,看会发什么
pnpm release                # 走完整 release 流程
pnpm release:version        # 仅升版本
pnpm release:changelog      # 仅生成 CHANGELOG
pnpm release:publish        # 仅 npm publish
```

详见 [六、发布流程](#六发布流程)。

---

## 四、`nx.json` 关键配置解读

### `namedInputs` —— 缓存键的输入定义

```jsonc
{
  "namedInputs": {
    "sharedGlobals": [
      { "runtime": "node --version" },             // Node 版本变化 → 缓存失效
      "{workspaceRoot}/pnpm-lock.yaml",            // 依赖变化 → 缓存失效
      "{workspaceRoot}/pnpm-workspace.yaml",
      "{workspaceRoot}/configs/tsconfig/**/*"      // 共享 tsconfig 变化 → 缓存失效
    ],
    "default": ["{projectRoot}/**/*", "sharedGlobals"],
    "production": [
      "default",
      "!{projectRoot}/**/*.{spec,test}.{ts,tsx}",  // 排除测试文件
      "!{projectRoot}/tests/**/*",
      "!{projectRoot}/vitest.config.{ts,js,mjs}",
      "!{projectRoot}/tsconfig.tsbuildinfo"        // tsbuildinfo 自己就是产物
    ]
  }
}
```

| 输入集 | 用途 |
|---|---|
| `sharedGlobals` | 跨项目共享的"全局变量"。Node 版本、lockfile、共享 tsconfig 变了都要让所有项目缓存失效 |
| `default` | 项目内全部文件 + `sharedGlobals` |
| `production` | `default` 减去测试/配置文件 —— **下游项目**的测试文件改动不应让**上游项目**的缓存失效 |

### `targetDefaults` —— 任务管道与缓存

```jsonc
{
  "targetDefaults": {
    "typecheck": {
      "cache": true,
      "inputs": ["default", "^production"],
      "outputs": ["{projectRoot}/tsconfig.tsbuildinfo"],
      "dependsOn": ["^typecheck"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"],
      "outputs": ["{workspaceRoot}/coverage/{projectName}"],
      "dependsOn": ["^typecheck"]
    },
    "check": {
      "cache": true,
      "inputs": ["default", "^production"],
      "dependsOn": ["^typecheck"]
    }
  }
}
```

关键概念:

- **`cache: true`**: 该 target 的产物可缓存。Nx 会基于 `inputs` 计算 hash;
  hash 不变则直接复用上次输出,跳过实际执行
- **`inputs`**: 计算 hash 的输入集合
  - `default` = 当前项目所有文件
  - `^production` = **所有依赖项目**的 production 输入(`^` 表示 "依赖图上游")
  - 加在一起 = "当前项目源码变了 OR 依赖项目源码变了 → 重跑"
- **`outputs`**: 哪些路径是该 target 的产物。Nx 在缓存命中时会把这些路径
  从缓存恢复出来(比如 `tsconfig.tsbuildinfo`)
- **`dependsOn: ["^typecheck"]`**: 跑当前项目的 `typecheck` 之前,先把
  **所有依赖项目**的 `typecheck` 跑通。`^` 表示 "依赖图上游"

### `release` —— 仅发布公开包

```jsonc
{
  "release": {
    "projects": [
      "@openconsole/atoms",
      "@openconsole/shadcn",
      "@openconsole/nacos"
    ],
    "projectsRelationship": "independent",
    "releaseTagPattern": "{projectName}@{version}",
    "version": { "conventionalCommits": true },
    "changelog": {
      "workspaceChangelog": false,
      "projectChangelogs": true
    }
  }
}
```

- 只有 `@openconsole/{atoms,shadcn,nacos}` 三个包被纳入 release 流程,
  其它内部包(graph/heap/signal/tunnel,均为 `private: true`)不发
- **独立版本号(`independent`)**: 每个包独立递增,而不是统一版本
- **Conventional Commits**: 根据 `feat:` / `fix:` / `BREAKING CHANGE:`
  自动决定 major / minor / patch
- **每包独立 CHANGELOG**: 不生成根目录 workspace CHANGELOG,而是在每个
  包目录下生成 `CHANGELOG.md`
- **Tag 格式**: `@openconsole/atoms@1.2.0`

### `parallel` 与 `cacheDirectory`

```jsonc
{
  "parallel": 4,                       // 同时跑 4 个任务
  // cacheDirectory 未设 = 默认 ".nx/cache"
  "defaultBase": "main",
  "tui": { "enabled": true }           // 终端 UI(任务执行的滚动面板)
}
```

`parallel` 在低配机或 CI 容器上可以降到 2,在多核工作站可以拉到 8+。
也可在命令行覆盖: `pnpm nx run-many -t test --parallel=8`。

---

## 五、约定:每个新包需要什么

新建 `packages/foo/`:

1. `package.json` 必备:
    ```jsonc
    {
      "name": "@openconsole/foo",
      "version": "0.0.1",
      "private": true,                 // 默认私有,要发布再改 false
      "type": "module",
      "main": "index.ts",
      "scripts": {
        "test": "vitest run",
        "test:watch": "vitest",
        "test:coverage": "vitest run --coverage",
        "typecheck": "tsc --noEmit",
        "check": "tsc --noEmit && vitest run"
      }
    }
    ```
2. `tsconfig.json` 继承共享配置:
    ```jsonc
    {
      "extends": ["@openconsole/tsconfig/lib", "@openconsole/tsconfig/esm"],
      "include": ["index.ts", "tests/**/*.ts"]
    }
    ```
3. `vitest.config.ts`(如有测试)。
4. 写代码 + 测试。无需写 `project.json` —— Nx 自动从 `package.json` 推断。

只要 `scripts` 名字跟 `nx.json` 的 `targetDefaults` 里某个 target 一致,
就会**自动套用**那个 target 的缓存/依赖配置。

---

## 六、发布流程

只对公开包(atoms / shadcn / nacos)生效。

### 完整流程(推荐)

```bash
# 1. 确保所有变更已提交且测试通过
pnpm check

# 2. 预演,看会发什么版本、改什么文件
pnpm release:dry-run

# 3. 真正发布(交互式问确认)
pnpm release
```

`pnpm release` 一条命令完成:
1. 解析 conventional commits,决定每个包的版本号
2. 改 `package.json` 的 `version`
3. 生成各包的 `CHANGELOG.md`
4. 创建 git commit + tag(`@openconsole/atoms@1.2.0` 格式)
5. 推 tag
6. `npm publish` 每个改动的包

### 分步执行

如果想拆开来做(例如先合并 PR 再 publish):

```bash
pnpm release:version       # 只升版本号 + 生成 CHANGELOG
git push --follow-tags
pnpm release:publish       # 只 npm publish(用现有 tag 推断要发哪些包)
```

### 不发某个包

直接在命令行加 `--projects` 过滤:

```bash
pnpm nx release --projects=@openconsole/atoms
```

---

## 七、远程缓存(可选)

本地缓存对单人开发已经很香,但团队/CI 共享缓存收益更大。两条路:

### 方案 A: Nx Cloud(官方,SaaS)

```bash
pnpm nx connect
```

跟着提示在 [nx.app](https://nx.app) 创建工作空间,会在 `nx.json` 自动
注入 `nxCloudAccessToken` 字段。CI 上把 token 设成密钥变量即可。

免费档对小团队足够,看分布式任务执行(distributed task execution)。

### 方案 B: 自托管 S3 兼容缓存

如果不想用 SaaS,可以走 [nx-remotecache-s3](https://www.npmjs.com/package/nx-remotecache-s3)
之类的社区方案,把缓存写到 S3 / R2 / MinIO。配置示例:

```jsonc
// nx.json
{
  "tasksRunnerOptions": {
    "default": {
      "runner": "nx-remotecache-s3",
      "options": {
        "bucket": "openconsole-nx-cache",
        "region": "us-east-1"
      }
    }
  }
}
```

需要装相应 npm 包并配 AWS 凭据。

> 目前本仓库**未启用**远程缓存,仅本地 `.nx/cache`。

---

## 八、CI 接入(示例)

GitHub Actions 跑 affected 测试 + typecheck:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  affected:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # affected 需要完整历史
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm nx affected -t typecheck test --parallel=4
```

关键点:
- `fetch-depth: 0` —— affected 算法需要 base 与 head 之间的提交历史
- 用 `pnpm nx affected -t typecheck test` 同时跑多个 target
- 缓存目录 `.nx/cache` 可以用 `actions/cache` 跨 run 复用

---

## 九、常见排错

### `pnpm nx ...` 提示找不到 `nx`

在仓库根目录运行 `pnpm install`,确认根 `package.json` 的 `devDependencies` 包含 `nx`。

### 缓存命中但代码改了?

```bash
pnpm reset           # 清本地缓存
pnpm nx graph        # 看依赖图是否正确
```

确认 `nx.json` 的 `namedInputs` 没把关键文件排除。

### `dependsOn: ["^typecheck"]` 没触发

确认依赖项目的 `package.json` 里有 `typecheck` script。Nx 不会凭空生成
target —— 必须在某处声明。

### `affected` 在本地总返回空

确认 git base 正确:`git fetch origin main` 后再跑。或者显式指定基准:
`pnpm nx affected -t test --base=HEAD~1`。

### Windows 路径问题

`nx.json` 里所有路径用 POSIX 风格(`/`),不要写 `\\`。`{projectRoot}` /
`{workspaceRoot}` 这种 token 由 Nx 内部处理跨平台。

### 想看某个 task 实际跑了什么命令

```bash
pnpm nx run @openconsole/heap:typecheck --verbose
```

会打印完整 hash、缓存命中状态、实际命令。

---

## 十、参考资料

- [Nx 官方文档](https://nx.dev)
- [`nx.json` 参考](https://nx.dev/reference/nx-json)
- [任务管道配置](https://nx.dev/concepts/task-pipeline-configuration)
- [Inputs 与缓存键](https://nx.dev/reference/inputs)
- [`nx release` 完整指南](https://nx.dev/features/manage-releases)
- 本仓库的 atoms / shadcn skill 文档: [packages/atoms/skill/SKILL.md](./packages/atoms/skill/SKILL.md),
  [packages/shadcn/skill/SKILL.md](./packages/shadcn/skill/SKILL.md)
