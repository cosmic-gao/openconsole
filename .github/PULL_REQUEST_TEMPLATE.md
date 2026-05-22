<!--
PR Title must follow Conventional Commits:
  <type>(<scope>): <subject>

Types: feat, fix, perf, refactor, docs, test, build, ci, chore, style, revert
Scope: package short name (atoms, shadcn, graph, heap, ...)

Examples:
  feat(atoms): add Header and Breadcrumbs components
  fix(graph): correct BFS termination on disconnected nodes
  chore(deps): bump nx to 22.7.2
-->

## 变更概述 / Summary

<!-- 一两句话说明动机与改动 / One or two sentences on motivation and what changed. -->

## 类型 / Type

- [ ] `feat` — 新功能(触发 minor 版本)
- [ ] `fix` — 修 bug(触发 patch 版本)
- [ ] `perf` — 性能优化
- [ ] `refactor` — 重构,无行为变化
- [ ] `docs` — 仅文档
- [ ] `test` — 仅测试
- [ ] `build` / `ci` / `chore` — 工程化,不触发发布
- [ ] 包含 BREAKING CHANGE(触发 major 版本)

## 影响范围 / Scope

<!-- 改了哪些包?会影响哪些上层项目? -->

- 包: <!-- @openconsole/atoms, @openconsole/shadcn, ... -->
- Breaking change: <!-- yes/no;若 yes,在 commit message 里写 BREAKING CHANGE: 描述 -->

## 测试 / Testing

<!-- 怎么验证的?新增/修改的测试?手工验证步骤? -->

- [ ] `pnpm affected:check` 本地通过
- [ ] 新增了对应的测试(if applicable)
- [ ] 手工验证: <!-- 描述 -->

## 检查清单 / Checklist

- [ ] PR 标题遵循 Conventional Commits
- [ ] 涉及的包文档(SKILL.md / README.md)已同步更新
- [ ] 公开 API 改动有 JSDoc
- [ ] CI 全绿

## 截图 / 录屏 (UI 改动)

<!-- 拖图片到这里 -->

## 关联 issue / Linked issues

<!-- closes #123, related to #456 -->
