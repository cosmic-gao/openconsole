/**
 * `internal/` 模块集中导出 —— 包内共享工具。
 *
 * @remarks
 * **不属于公开 API**：本目录刻意没有挂在 `core/index.ts` 的 `export *` 链上，
 * 包外调用方不应 `import from '@opendesign/graph/.../internal'`。如果某个 helper
 * 需要对外暴露，先把它搬到 `algorithms/` 或新建公共模块再外抛。
 *
 * @internal
 */

export { inDegrees } from './degree';
export { lookupPort, compactPorts, portsJson } from './port';
