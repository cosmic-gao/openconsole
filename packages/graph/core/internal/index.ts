/**
 * `internal/` 模块集中导出。
 *
 * @remarks
 * 本目录是 graph 包内部共享工具的家：
 * - {@link Heap}：二叉最小堆，Dijkstra 等算法用；
 * - {@link inDegrees}：拓扑算法 / Topo 遍历器共享的入度初始化；
 * - 端口字典通用助手：{@link lookupPort} / {@link compactPorts} / {@link portsJson}。
 *
 * **不属于公开 API**：本目录刻意没有挂在 `core/index.ts` 的 `export *` 链上，
 * 包外调用方不应 `import from '@opendesign/graph/.../internal'`；如果某个 helper
 * 需要对外暴露，先把它搬到 `algorithms/` 或新建公共模块再外抛。
 *
 * @internal
 */

export { Heap } from './heap';
export { inDegrees } from './degree';
export { lookupPort, compactPorts, portsJson } from './port';
