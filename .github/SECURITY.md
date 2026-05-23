# Security Policy / 安全策略

## 报告漏洞 / Reporting a Vulnerability

**请不要在公开 Issue 里报安全漏洞。** 用 GitHub 的 private vulnerability
reporting 渠道：

<https://github.com/cosmic-gao/openconsole/security/advisories/new>

收到报告后我们会：

1. 24 小时内确认
2. 评估影响范围并给出修复时间表
3. 在修复发布后，公开 advisory 并在 release notes 中致谢

## 支持的版本 / Supported Versions

仅最新发布的 minor 版本会收到安全补丁。请保持依赖更新。

| Package               | Supported  |
| --------------------- | ---------- |
| `@openconsole/atoms`  | 最新 minor |
| `@openconsole/shadcn` | 最新 minor |
| `@openconsole/nacos`  | 最新 minor |

## 披露策略 / Disclosure

我们采用 **协调披露**(coordinated disclosure):

- 在补丁发布前不公开技术细节
- 报告者会被列入 advisory acknowledgements(除非要求匿名)
- 关键漏洞会通过 GitHub Security Advisory + npm advisory 同步通知
