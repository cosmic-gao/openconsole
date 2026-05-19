/**
 * 序列化压缩模块
 *
 * @remarks
 * 使用数组元组压缩格式，显著减少序列化后的字节大小。
 *
 * 压缩格式：
 * - 节点元组：`[id, weight, inputs, outputs]`，`inputs`/`outputs` 为 `[name, portId, socketName][]` 或 `null`。
 * - 边元组：`[id, sourceNodeId, sourcePortId, targetNodeId, targetPortId, weight]`。
 *
 * 额外能力：
 * - {@link packRemap} / {@link unpackRemap}：拓扑稳定 ID 重映射，把长 UUID 替换为短整数。
 * - {@link diff} / {@link apply} / {@link invert}：图的结构化差异，可应用与撤销。
 */

export * from './compact';
export * from './pack';
export * from './unpack';
export * from './ratio';
export * from './remap';
export * from './diff';
export * from './sockets';
