/**
 * Control：访问者控制流返回值。
 */

/**
 * 访问者回调返回值。
 *
 * @remarks
 * - `'continue'`：继续访问；
 * - `'prune'`：保留当前节点的访问，但不再下钻其后继；
 * - `'break'`：立即中止整次遍历。
 */
export type Control = 'continue' | 'prune' | 'break';
