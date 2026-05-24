---
name: find-skills
description: 当用户问"怎么做 X"、"有没有 X 相关的 skill"、"是否存在能做……的 skill"，或者想扩展 agent 能力时，帮助用户发现和安装 agent skill。用户想找的功能可能已经作为可安装 skill 存在时就用本 skill。
---

# Find Skills

本 skill 帮你从 open agent skills 生态里发现并安装 skill。

## 什么时候用

满足以下任一条件就用：

- 用户问"怎么做 X"，X 可能是某个已有 skill 能解决的常见任务
- 用户说"找一个 X 相关的 skill"或"有没有 X 的 skill"
- 用户问"你能做 X 吗"，X 是某个专业领域能力
- 用户表达想扩展 agent 能力
- 用户想搜工具、模板、工作流
- 用户提到想要某个领域（设计、测试、部署等）的辅助

## Skills CLI 是什么

Skills CLI（`npx skills`）是 open agent skills 生态的包管理器。Skill 是模块化的包，用专业知识、工作流、工具来扩展 agent 能力。

**关键命令：**

- `npx skills find [query]` — 交互式或按关键词搜索 skill
- `npx skills add <package>` — 从 GitHub 等源安装 skill
- `npx skills check` — 检查 skill 更新
- `npx skills update` — 更新所有已装 skill

**浏览 skill 库：** https://skills.sh/

## 怎么帮用户找 skill

### Step 1：理解用户需求

用户求助时识别：

1. 领域（如 React、测试、设计、部署）
2. 具体任务（如写测试、做动画、review PR）
3. 这是不是足够常见到可能有现成 skill

### Step 2：先看 leaderboard

跑 CLI 搜索之前，先看 [skills.sh leaderboard](https://skills.sh/)，看这个领域有没有出名的 skill。leaderboard 按总安装量排序，能浮现出最流行、经过实战检验的选项。

例如 Web 开发的头部 skill：

- `vercel-labs/agent-skills` — React、Next.js、Web 设计（各 10 万+ 安装）
- `anthropics/skills` — 前端设计、文档处理（10 万+ 安装）

### Step 3：搜 skill

leaderboard 没覆盖到用户需求时，跑 find 命令：

```bash
npx skills find [query]
```

例：

- 用户问"我的 React 应用怎么提速？" → `npx skills find react performance`
- 用户问"能帮我做 PR review 吗？" → `npx skills find pr review`
- 用户问"我要做一个 changelog" → `npx skills find changelog`

### Step 4：推荐前先验质量

**不要只凭搜索结果就推荐 skill**，先验：

1. **安装量** —— 优先 1K+ 安装的；100 以下要慎重
2. **来源信誉** —— 官方源（`vercel-labs`、`anthropics`、`microsoft`）比无名作者更可信
3. **GitHub stars** —— 看源仓库；<100 star 的仓库要保持怀疑

### Step 5：把选项给用户

找到合适的 skill 后，告诉用户：

1. skill 名字和用途
2. 安装量和来源
3. 安装命令
4. skills.sh 上的详情链接

回答示例：

```
我找到一个可能合适的 skill！"react-best-practices" 提供 Vercel 工程团队的
React 和 Next.js 性能优化指南。（185K 安装）

安装命令：
npx skills add vercel-labs/agent-skills@react-best-practices

详情：https://skills.sh/vercel-labs/agent-skills/react-best-practices
```

### Step 6：可以帮装

用户同意就帮装：

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` 是全局安装（user 级别），`-y` 是跳过确认提示。

## 常见 skill 分类

搜索时考虑这些常见分类：

| 分类         | 示例查询                                  |
| ------------ | ----------------------------------------- |
| Web 开发     | react、nextjs、typescript、css、tailwind  |
| 测试         | testing、jest、playwright、e2e            |
| DevOps       | deploy、docker、kubernetes、ci-cd         |
| 文档         | docs、readme、changelog、api-docs         |
| 代码质量     | review、lint、refactor、best-practices    |
| 设计         | ui、ux、design-system、accessibility      |
| 生产力       | workflow、automation、git                 |

## 高效搜索技巧

1. **用具体关键词**："react testing" 比单独的 "testing" 好
2. **试同义词**："deploy" 不行就试 "deployment" 或 "ci-cd"
3. **看热门来源**：很多 skill 来自 `vercel-labs/agent-skills` 或 `ComposioHQ/awesome-claude-skills`

## 找不到 skill 时

没有相关 skill 的话：

1. 承认没找到现成的
2. 提议用你的通用能力直接帮忙
3. 建议用户可以用 `npx skills init` 自己创建

例：

```
我搜了 "xyz" 相关的 skill 但没找到匹配的。
我还是可以直接帮你做这件事！要现在就开始吗？

如果这是你常做的事，可以自己建一个 skill：
npx skills init my-xyz-skill
```
