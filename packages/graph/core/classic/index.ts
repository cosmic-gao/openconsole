/**
 * `classic` 子目录：运行时基础数据元模型集中导出。
 *
 * @remarks
 * 每个类拆到独立文件，外部仍通过 `from './classic'` 统一访问：
 * - {@link Socket}：端口数据类型；
 * - {@link Port}（抽象）/ {@link Input} / {@link Output}：端口与方向；
 * - {@link Vertex}：携带类型化端口与权重的节点；
 * - {@link Endpoint}：节点 + 端口的组合，描述边端；
 * - {@link Edge}：有向边；
 * - {@link Graph}：主容器，并实现 {@link Catalog} / {@link Neighbors} 等访问者 trait。
 */

export { Socket } from './socket';
export { Port } from './port';
export { Input } from './input';
export { Output } from './output';
export { Vertex } from './vertex';
export { Endpoint } from './endpoint';
export { Edge } from './edge';
export { Graph } from './graph';
