/**
 * Direction：端口与边的方向标记。
 */

/**
 * 方向：`'input'` 或 `'output'`。
 *
 * @remarks
 * 同时用于：
 * - 端口的方向（输入端口 / 输出端口）；
 * - 边相对某个节点的方向（流入方为 `'input'`，流出方为 `'output'`）。
 */
export type Direction = 'input' | 'output';
