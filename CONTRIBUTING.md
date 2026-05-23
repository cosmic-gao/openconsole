# 贡献指南

本文件描述 `openconsole` 仓库的标准开发流程,从克隆代码到通过
`nx release` 发布到 npm 全链路。先读完本文再开始改代码。

> Nx 相关的命令、缓存机制、配置文件解读请看 [NX.md](./NX.md)。
> 本文聚焦"人怎么走流程",NX.md 聚焦"工具怎么配的"。

---

## 目录

1. [流程总览](#1-流程总览)
2. [环境准备](#2-环境准备)
3. [分支策略](#3-分支策略)
4. [提交规范(Conventional Commits)](#4-提交规范conventional-commits)
5. [本地开发流程](#5-本地开发流程)
6. [Git 钩子做了什么](#6-git-钩子做了什么)
7. [创建 PR](#7-创建-pr)
8. [代码评审](#8-代码评审)
9. [合并到 main](#9-合并到-main)
10. [发布到 npm](#10-发布到-npm)
11. [Hotfix 与回滚](#11-hotfix-与回滚)
12. [常见 FAQ](#12-常见-faq)

---

## 1. 流程总览

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│  本地开发                                                            │
│    │                                                               │
│    ▼                                                               │
│  [feat/fix branch] ──→ 提交 (Conventional Commits)                  │
│    │                       │                                       │
│    │                       ▼                                       │
│    │                  ┌──────────────────┐                         │
│    │                  │ commit-msg hook  │ 校验提交信息格式            │
│    │                  │ pre-commit hook  │ format 暂存文件             │
│    │                  └──────────────────┘                         │
│    ▼                                                               │
│  推送 ──┬──→ pre-push hook: affected typecheck                      │
│         │                                                          │
│         ▼                                                          │
│       GitHub                                                       │
│         │                                                          │
│         ▼                                                          │
│  开 Pull Request ──→ CI: affected typecheck + test + format         │
│         │                                                          │
│         ▼                                                          │
│  Code Review (≥1 approve)                                           │
│         │                                                          │
│         ▼                                                          │
│  Squash merge to main(标题保持 Conventional Commits)                │
│         │                                                          │
│         ▼                                                          │
│  CI on main: 跑全量 typecheck + test                                │
│         │                                                          │
│         ▼                                                          │
│  ── 攒一批 commit ──                                                │
│         │                                                          │
│         ▼                                                          │
│  维护者手动触发 Release workflow (workflow_dispatch)                  │
│         │                                                          │
│         ▼                                                          │
│  nx release ─→ 决定版本 / 改 package.json / 生成 CHANGELOG /          │
│                提交 tag / npm publish                               │
│         │                                                          │
│         ▼                                                          │
│  npm + GitHub Releases                                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. 环境准备

### 一次性

| 工具    | 版本    | 说明                                                                  |
| ------- | ------- | --------------------------------------------------------------------- |
| Node.js | ≥ 22.11 | 见 `package.json` 的 `engines.node`;**pnpm 会自动下载到 24.16**(下条) |
| pnpm    | ≥ 11.2  | 由 `package.json` 的 `packageManager` 字段锁定,Corepack 自动切换      |
| Git     | ≥ 2.40  | 任何现代版本                                                          |

> **不需要 `.nvmrc` / nvm / fnm**——`.npmrc` 里 `use-node-version=24.16.0`
> 告诉 pnpm 自动下载并切到该版本,跑 `pnpm <任何命令>` 时自动生效。本机只
> 要有任意 Node ≥ 22.11 能把 pnpm 启起来即可。

### 克隆与安装

```bash
git clone git@github.com:cosmic-gao/openconsole.git
cd openconsole
corepack enable           # 一次即可:启用 Corepack 让 pnpm 版本自动切换
pnpm install              # 装依赖 + 触发 Husky + pnpm 切到 24.16.0
```

`pnpm install` 会自动:

- 装所有 workspace 依赖
- 跑 `prepare` 脚本 → Husky 初始化 `.husky/` 目录,激活 git 钩子
- 通过 `.npmrc` 拉取并切换 Node 24.16.0
- 通过 `packageManager` 字段把本地 pnpm 切到 11.2.2

装完之后 `git commit` 就会自动经过下面 [第 6 节](#6-git-钩子做了什么)
的钩子检查。

### 一键开发环境(可选)

仓库内置 [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json),
GitHub Codespaces / VS Code Dev Containers 可一键拉起完整环境(Node 22
镜像 + pnpm 11 + 推荐扩展)。无需本地安装任何依赖。

---

## 3. 分支策略

**Trunk-based + 短周期 feature branch**:

- `main` 是唯一的长期分支,永远可发布。
- 任何改动都开 **短周期分支**(通常 < 3 天)从 `main` 切出来。
- PR 合并到 `main` 用 **squash merge**,保留干净的线性历史。
- **没有** `develop` / `release/*` 分支。

### 分支命名约定

```
<type>/<short-description>

feat/atoms-table
fix/graph-bfs-termination
docs/nx-guide
chore/bump-nx
```

`<type>` 与 [Conventional Commits](#4-提交规范conventional-commits) 的
type 一致。`<short-description>` 用小写连字符。

---

## 4. 提交规范(Conventional Commits)

每条 commit message 都必须遵循:

```
<type>(<scope>): <subject>

[optional body]

[optional BREAKING CHANGE: <description>]
```

### `<type>`

| type       | 释义              | 是否触发 release |
| ---------- | ----------------- | ---------------- |
| `feat`     | 新功能            | **minor 版本**   |
| `fix`      | 修 bug            | **patch 版本**   |
| `perf`     | 性能优化          | **patch 版本**   |
| `refactor` | 重构,无行为变化   | 不触发           |
| `docs`     | 仅文档            | 不触发           |
| `test`     | 仅测试            | 不触发           |
| `build`    | 构建系统、依赖    | 不触发           |
| `ci`       | CI 配置           | 不触发           |
| `chore`    | 杂项 / 工程化     | 不触发           |
| `style`    | 格式化,无代码变化 | 不触发           |
| `revert`   | 回滚              | 视 revert 内容定 |

> 加 `!` 或在 body 里写 `BREAKING CHANGE:` → **major 版本**。

### `<scope>`

通常是包简称(`atoms` / `shadcn` / `graph` / `heap` / `nacos` /
`signal` / `tunnel` / `deps` / `release` / ...)。一个 commit 改了
多个包就分开提多个 commit。

### 例子

```
feat(atoms): add Header and Breadcrumbs components
fix(graph): correct BFS termination on disconnected nodes
perf(heap): swap to siftDown for bulk insert
refactor(shadcn): extract Field state into a hook
docs: update NX.md with caching section
chore(deps): bump nx to 22.7.2
ci: cancel stale CI runs on push

feat(atoms)!: rename Sidebar.account.menu to Sidebar.account.items

BREAKING CHANGE: `account.menu` was renamed to `account.items` for
consistency with `MenuGroup.items`. Update consumers accordingly.
```

### 自动校验

`.husky/commit-msg` 会调用 commitlint 校验。不符合就拒绝 commit。

本地手动校验(commit 前调试):

```bash
echo "feat(atoms): add cool thing" | pnpm exec commitlint
```

---

## 5. 本地开发流程

### 1) 切出分支

```bash
git checkout main
git pull
git checkout -b feat/atoms-new-component
```

### 2) 写代码

在对应 `packages/<name>/` 下改/写文件。每个包的文档放在
`packages/<name>/skill/SKILL.md`,改 API 时记得同步更新文档。

### 3) 跑测试

跑当前包:

```bash
pnpm nx test @openconsole/atoms
pnpm nx typecheck @openconsole/atoms
```

跑全部受影响项目:

```bash
pnpm affected:check
```

### 4) 提交

```bash
git add packages/atoms/components/foo.tsx
git commit -m "feat(atoms): add Foo component"
```

提交时自动跑:

- **`pre-commit`**: 对暂存文件跑 `nx format:write --uncommitted`(格式化)
- **`commit-msg`**: commitlint 校验消息格式

### 5) 推送

```bash
git push -u origin feat/atoms-new-component
```

推送时自动跑:

- **`pre-push`**: `nx affected -t typecheck --base=origin/main --head=HEAD`
  确保推上去的代码类型检查通过

> 如果钩子误报且确认无害,可以临时跳过: `git push --no-verify`。
> 这是逃生口,**不是日常用法**——一旦养成习惯,钩子就形同虚设。

---

## 6. Git 钩子做了什么

钩子定义在 [`.husky/`](.husky/),由 Husky v9 在 `pnpm install` 后激活。

| 钩子         | 触发时机     | 作用                                                              | 失败后果    |
| ------------ | ------------ | ----------------------------------------------------------------- | ----------- |
| `commit-msg` | `git commit` | commitlint(v21) 校验 message                                      | 拒绝 commit |
| `pre-commit` | `git commit` | `lint-staged` → `nx format:write`(prettier + import 排序 + tw 类) | 拒绝 commit |
| `pre-push`   | `git push`   | `nx affected -t typecheck --exclude-task-dependencies`            | 拒绝推送    |

钩子的设计原则:

- **快**:`pre-commit` 只动暂存文件,prettier + 排序插件并行跑
- **本地保险**:`pre-push` 抓的是 CI 必抓的东西,在本地提前抓出来,
  省一轮 CI;`--exclude-task-dependencies` 避免被 `^typecheck`
  拉起整张依赖图
- **不重复**:测试不跑钩子(太慢),CI 里跑

### Prettier 插件链

`.prettierrc.json` 启用了两个插件,跑 `pnpm format` 自动生效:

| 插件                                  | 作用                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `@ianvs/prettier-plugin-sort-imports` | 按 `<BUILTIN>` → `<THIRD_PARTY>` → `@openconsole/*` → 相对路径 顺序排 import |
| `prettier-plugin-tailwindcss`         | 自动排序 `className` 里的 tailwind class,统一顺序                            |

> 首次启用插件会一次性 reformat 大量历史文件,单独开一个 PR
> (`style: format with new prettier plugins`)合,后续就稳定了。

---

## 7. 创建 PR

```bash
gh pr create --title "feat(atoms): add Foo component" --body "..."
```

或者在 GitHub UI 上点 "Open pull request"。

### PR 必备项

- **标题**: 严格 Conventional Commits 格式(squash merge 后会变成
  main 的 commit message,务必正确)
- **描述**: 用 [`.github/PULL_REQUEST_TEMPLATE.md`](.github/PULL_REQUEST_TEMPLATE.md) 模板,
  填写变更说明、类型、影响范围、测试方式
- **基准分支**: `main`
- **CI 必须全绿** 才能合

### CI 在 PR 上跑什么

| Workflow                                                                   | 触发                       | 作用                                                                      |
| -------------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------- |
| [`ci.yml`](.github/workflows/ci.yml)                                       | PR + push to main          | `format:check` + `nx affected -t typecheck/test/lint`,带 `.nx/cache` 缓存 |
| [`codeql.yml`](.github/workflows/codeql.yml)                               | PR + push to main + 每周一 | GitHub CodeQL `security-extended` 静态扫描,结果进 Security tab            |
| [`release.yml`](.github/workflows/release.yml)                             | 手动 `workflow_dispatch`   | `nx release` 发版 + npm provenance + GitHub SLSA attestation              |
| [`stale.yml`](.github/workflows/stale.yml)                                 | 每日                       | 标记/关闭长期无活动的 issue/PR                                            |
| [`dependabot-auto-merge.yml`](.github/workflows/dependabot-auto-merge.yml) | Dependabot PR              | patch/minor 依赖更新自动 merge                                            |

`nrwl/nx-set-shas@v5` 自动算出当前 PR 的 base/head SHA,传给
`nx affected`,只跑你改动影响到的项目。CI 用 `actions/setup-node@v6`
读 `package.json` 的 `engines.node`,与本地 pnpm `use-node-version`
对齐。

---

## 8. 代码评审

### 评审者关注点

- API 改动是否符合现有 [skill 文档](packages/atoms/skill/SKILL.md) 风格
- 是否有测试覆盖
- 是否引入了不必要的依赖
- 公开 API 是否有 JSDoc
- Breaking change 是否在 commit message 标了 `!` 或 `BREAKING CHANGE:`
- 评审 atoms / shadcn 的 UI 改动时,看截图 / 录屏

### 评审策略

- 至少 1 个 approve(可以在 GitHub 仓库设置里加分支保护规则强制)
- 评审反馈用 GitHub suggestions 直接给出建议代码
- 改了后回评论 + 重新 request review
- 合 PR 之前所有 thread 都要 resolved

---

## 9. 合并到 main

### 用 **Squash and merge**(强制)

- 一个 PR → 一个 commit 到 main
- Squash commit 的 message 取 PR 标题(因此 PR 标题必须是 Conventional Commits)
- main 的历史是线性的,易于 `git log` 看
- `nx affected` 在 main 上工作可靠

### 合完之后

CI 会再跑一次(`push: branches: [main]`),保证 main 始终绿。
不需要手动操作。

---

## 10. 发布到 npm

### 哪些包会被发布

`nx.json` 的 `release.projects` 字段限制:

- `@openconsole/atoms`
- `@openconsole/shadcn`
- `@openconsole/nacos`

其它包(`graph` / `heap` / `signal` / `tunnel` / `tsconfig`)都是
`private: true` 或不在白名单里,**不发**。

### 标准发布流程

#### 方式 A: 通过 GitHub Actions(推荐)

1. 准备好:在 npm 上生成一个 **automation token**,在 GitHub 仓库的
   Settings → Secrets and variables → Actions 加 secret `NPM_TOKEN`。
2. 维护者打开 GitHub Actions → 选 **Release** workflow → 点
   **Run workflow**。
3. 可选参数:
   - `dry-run: true` → 预演,看会发什么,但不真的发(无 `NPM_TOKEN` 也能跑)
   - `first-release: true` → 第一次发某个新包(没有历史 tag 时用一次)
4. workflow 会:
   - checkout 全量历史
   - 跑 `pnpm nx run-many -t typecheck test` 最后兜底一次
   - `pnpm release --yes`,自动版本号 / CHANGELOG / git tag / npm publish

#### 方式 B: 本地手动(应急或调试)

```bash
# 1. 在 main 上拉到最新
git checkout main && git pull

# 2. 预演,看会发什么
pnpm release:dry-run

# 3. 真发(会交互式问确认)
pnpm release

# 4. 推 tag
git push --follow-tags
```

> 本地发的前提:本地 `npm whoami` 已登录有发布权限的账号。

### 单独发某个包

```bash
pnpm nx release --projects=@openconsole/atoms
```

适合"只想发 atoms,不想动 shadcn"的场景。

### 第一次发某个新包

新加进 `release.projects` 的包没有历史 tag,直接 `pnpm release` 会报错
"no previous tag found"。第一次发用:

```bash
pnpm release --first-release
```

或者在 release workflow 里勾 `first-release: true`。

### 发布的产物

`nx release` 一气完成:

1. **决定版本号**: 扫每个包自上次 tag 起的 commits,按 Conventional Commits
   判断 major/minor/patch
2. **改 package.json**: 更新每个公开包的 `version`
3. **生成/追加 CHANGELOG**: 每个包目录下生成 `CHANGELOG.md`,根据 commits 写
4. **commit + tag**: 一个 `chore(release): publish` commit + 每个包一个 tag
   (`@openconsole/atoms@1.2.0` 格式)
5. **npm publish**: 跑 `pnpm publish` 把每个改动的包发出去
6. **GitHub Release**: 自动建对应 GitHub Releases(基于 tag)

---

## 11. Hotfix 与回滚

### 紧急修线上 bug

main 永远是可发布的,所以 hotfix 走正常流程:

1. 从 main 切 `fix/<thing>` 分支
2. 改 + 测试 + 提 `fix:` commit
3. 开 PR → CI → 评审 → squash merge
4. 立即手动触发 Release workflow

不需要 cherry-pick,不需要 `release/*` 分支。

### 撤回一个已发布版本

**不要** `npm unpublish`(72 小时后 npm 不让撤,而且会破坏依赖方的
lockfile)。改用 `deprecate`:

```bash
npm deprecate @openconsole/atoms@1.2.0 "Has bug X — upgrade to 1.2.1"
```

然后发一个 `fix:` 修掉问题,正常走 release 流程出 `1.2.1`。

### 回滚一个 commit

```bash
git revert <commit-sha>
git push
```

会产生一个 `revert:` commit,正常 PR 流程合回 main。如果回滚的是 feat,
不会自动降版本,需要在下一次 release 时手动控制。

---

## 12. 常见 FAQ

### Q: 怎么改 commit message?

未推送前:

```bash
git commit --amend
```

已推送但没合 PR:

```bash
git commit --amend
git push --force-with-lease    # 不要 --force,会冲掉同事改动
```

已合到 main: 不能改了。如果格式错得离谱,可以在下一次 release 前
手动改 CHANGELOG。

### Q: pre-push 太慢怎么办?

`nx affected -t typecheck` 已经只跑受影响项目了。如果还是慢,通常是:

- 改了 `configs/tsconfig/**/*` → 所有项目受影响,正常
- `.nx/cache` 被清空了 → 跑一次后会缓存

实在不想跑可以 `git push --no-verify`,但别养成习惯。

### Q: 跳过 release(某个 commit 不想触发版本号)

用 `chore:` / `docs:` / `test:` 等不触发版本号的 type。或者在 commit
里加 `[skip release]`(commitlint 不强制,但 nx release 会读)。

### Q: pre-commit hook 改了我的文件,我没看见?

`lint-staged` 把暂存的文件喂给 `nx format:write`,可能会改文件。
被改的版本会自动加回暂存。`git diff --staged` 看实际提交内容。

### Q: CI 报 `nx affected` 算出来全跑?

CI 用 `nrwl/nx-set-shas@v4` 算 base SHA,默认查同分支上一次成功的
CI run。**第一次跑** CI 时没历史,会跑全量。第二次起就只跑 affected。

### Q: 怎么本地预览 CHANGELOG?

```bash
pnpm release:dry-run
```

会在 stdout 打印将要写入各个 `CHANGELOG.md` 的内容,但不真的写文件。

### Q: 我能不能直接 `git push origin main`?

强烈建议在 GitHub 仓库 Settings → Branches 给 `main` 加 **branch
protection rule**:

- 要求 PR + ≥1 approve
- 要求 CI 通过
- 禁止 force push

启用后所有改动只能走 PR。

---

### Q: 拼写检查报"openconsole / shadcn / siftDown 这种词不认识"?

cspell 已经预置了项目词典 [`.cspell/project-words.txt`](.cspell/project-words.txt)。
看到红波浪线时,在 VS Code 编辑器右键选 **Add to workspace dictionary**,
词会自动追加到该文件,提交即可与团队共享。配置入口
[`cspell.json`](./cspell.json)。

### Q: 我能不能换 Node 版本?

可以但**不要改 `.npmrc`**——那是团队共享的固定版本。要本地试新 Node:

```bash
PNPM_USE_NODE_VERSION=24.20.0 pnpm install   # 临时
```

要永久升级,改 `.npmrc` 的 `use-node-version` 提 PR 让团队评审。

---

## 相关文档

- [NX.md](./NX.md) — Nx 配置详解、命令速查、远程缓存
- [`packages/atoms/skill/SKILL.md`](./packages/atoms/skill/SKILL.md) — atoms 包使用指南
- [`packages/shadcn/skill/SKILL.md`](./packages/shadcn/skill/SKILL.md) — shadcn 包使用指南
- [Conventional Commits 规范](https://www.conventionalcommits.org/zh-hans/v1.0.0/)
- [Nx Release 官方文档](https://nx.dev/features/manage-releases)
- [pnpm Settings 文档](https://pnpm.io/settings) — `use-node-version` / `engine-strict` 等
- [CodeQL 文档](https://codeql.github.com/) — 安全扫描原理与查询包
