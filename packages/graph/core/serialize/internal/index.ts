/**
 * `serialize/internal/` barrel：序列化模块内部工具。
 *
 * @remarks
 * - 路径本身已宣告 internal scope，外部用户不应 import；
 * - 加 barrel 让 `serialize/diff.ts` 等可写短路径 `from './internal'`。
 *
 * @internal
 */

export {
  dumpEdge,
  dumpNode,
  loadEdge,
  loadNode,
  sameWeight,
} from './encode';
