# @openconsole/tsconfig

OpenDesign TypeScript 配置预设包，提供分层配置的 TypeScript 编译选项。

## 安装

```bash
npm install @openconsole/tsconfig -D
# 或
pnpm add @openconsole/tsconfig -D
# 或
yarn add @openconsole/tsconfig -D
```

## 使用方式

### 基础环境

```json
{
  "extends": "@openconsole/tsconfig/base"
}
```

### 浏览器环境

```json
{
  "extends": "@openconsole/tsconfig/browser"
}
```

### Node.js 环境

```json
{
  "extends": "@openconsole/tsconfig/node"
}
```

### React + Vite

```json
{
  "extends": "@openconsole/tsconfig/react"
}
```

### Vue + Vite

```json
{
  "extends": "@openconsole/tsconfig/vue"
}
```

### Next.js

```json
{
  "extends": "@openconsole/tsconfig/next"
}
```

### Nuxt.js

```json
{
  "extends": "@openconsole/tsconfig/nuxt"
}
```

### Electron

```json
{
  "extends": "@openconsole/tsconfig/electron"
}
```

## 组合使用

### React 组件库

```json
{
  "extends": [
    "@openconsole/tsconfig/react",
    "@openconsole/tsconfig/lib"
  ]
}
```

### Vite + React 应用

```json
{
  "extends": [
    "@openconsole/tsconfig/react",
    "@openconsole/tsconfig/app"
  ]
}
```

### Node.js API 服务

```json
{
  "extends": [
    "@openconsole/tsconfig/node",
    "@openconsole/tsconfig/lib"
  ]
}
```

## 配置继承链

```
base.json
    ↑
browser.json    ←→    node.json
    ↑                         ↑
vite.json                   electron.json
    ↑                         ↑
react.json ← vue.json ← nuxt.json    node16.json
    ↑
next.json
```

## 可用配置

| 配置 | 说明 |
|------|------|
| `base` | 通用基础配置 |
| `strict` | 严格模式配置 |
| `browser` | 浏览器基础环境 |
| `vite` | Vite 构建工具 |
| `node` | Node.js 环境 (18.x+) |
| `node16` | Node.js 16 |
| `react` | React + Vite |
| `next` | Next.js |
| `vue` | Vue + Vite |
| `nuxt` | Nuxt.js |
| `electron` | Electron |
| `lib` | 类库开发 |
| `app` | 应用开发 |
| `test` | 测试配置 |
| `monorepo` | Monorepo 根项目 |
| `modules/commonjs` | CommonJS 输出 |
| `modules/esm` | ESM 输出 |
| `modules/umd` | UMD 输出 |

## License

MIT
