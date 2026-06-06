import { registry, type ToolRegistry } from "../registry";
import { askTool } from "./ask";
import { downloadTool } from "./download";
import { fetchTool } from "./fetch";
import { httpRequestTool } from "./http";
import { imageSearchTool } from "./image-search";
import { toMarkdownTool } from "./markdown";
import { runPythonTool } from "./python";
import { runJsTool } from "./run-js";
import { searchTool } from "./search";
import { thinkTool } from "./think";
import { currentTimeTool } from "./time";

/** 本包随附的全部内置工具。 */
export const builtinTools = [
  thinkTool,
  askTool,
  searchTool,
  fetchTool,
  runJsTool,
  currentTimeTool,
  httpRequestTool,
  toMarkdownTool,
  imageSearchTool,
  downloadTool,
  runPythonTool,
];

/** 把内置工具注册进某个注册表（默认是共享的那个）。 */
export function registerBuiltins(target: ToolRegistry = registry): void {
  target.registerAll(builtinTools);
}

// 在被 import 时即注册进共享注册表，这样 `Agent.build` 无需任何显式配置
// 即可解析内置工具名。
registerBuiltins();

export { thinkTool } from "./think";
export { askTool } from "./ask";
export {
  searchTool,
  setSearchProvider,
  duckDuckGoProvider,
  type SearchProvider,
  type SearchHit,
} from "./search";
export { fetchTool } from "./fetch";
export { runJsTool } from "./run-js";
export { currentTimeTool } from "./time";
export { httpRequestTool } from "./http";
export { toMarkdownTool } from "./markdown";
export { imageSearchTool } from "./image-search";
export { downloadTool } from "./download";
export { runPythonTool } from "./python";
