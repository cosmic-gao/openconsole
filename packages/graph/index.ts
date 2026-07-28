/**
 * `@openconsole/graph` — 类型化端口的有向图内核。
 *
 * 四层职责：
 * - {@link Graph} 负责编辑——整数索引存储，邻接是纯数组读取，变更走事件；
 * - {@link Snapshot} 负责计算的输入——不可变 CSR，过滤 / 折叠 / 无向化 / 合并都在
 *   编译期完成，全部数据是 typed-array，可整份搬到 Worker；
 * - {@link Structure} 是算法的契约——五个只读字段，凡是凑得出的实现都能跑全套算法；
 * - {@link Task} 负责调度——算法分步推进，可中断、可续跑、可分帧。
 *
 * @packageDocumentation
 */

export * from "./core";
