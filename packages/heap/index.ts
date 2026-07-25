/**
 * `@openconsole/heap` — 两种互补的堆实现。
 *
 * - {@link BinaryHeap}：数组二叉堆，常数小，适合纯优先队列（push / poll）；
 * - {@link PairingHeap}：配对堆，`push` 返回稳定句柄，支持 O(log n) 摊销的
 *   任意删除与 decrease-key，适合 Dijkstra / A\* 这类需要调整优先级的场景。
 *
 * 两者都实现 {@link Heap} 契约，比较器语义一致（栈顶为最小元素）。
 *
 * @packageDocumentation
 */

export * from "./core";
