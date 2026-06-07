/**
 * Checkpointer 工厂 —— 为 {@link Session} 的多轮 / resume / fork / history 提供持久后端。
 *
 * checkpointer 在编译期烘焙进 agent（`Agent.create(name, { checkpointer })`）。本模块只提供
 * 「怎么造一个 saver」的便捷入口，厂商无关、优先开源：
 *  - {@link checkpoint.memory}：进程内内存（重启即失忆），多轮够用、零依赖；
 *  - {@link checkpoint.sqlite}：SQLite 文件持久（跨重启），对齐 opencode 的 session 持久化。
 *
 * SQLite 走**可选依赖**（`@langchain/langgraph-checkpoint-sqlite`，开源）：不强加到本包
 * 依赖里，用到时动态 import，未安装则抛出清晰的安装指引。需要 Postgres/Redis 等其它后端时，
 * 直接把对应的 `BaseCheckpointSaver` 传给 `Agent.create({ checkpointer })` 即可——本包对
 * checkpointer 类型无任何额外约束。
 */
import { MemorySaver, type BaseCheckpointSaver } from "@langchain/langgraph";

export const checkpoint = {
  /** 进程内内存 checkpointer（重启即失忆）。单进程多轮会话够用。 */
  memory(): BaseCheckpointSaver {
    return new MemorySaver();
  },

  /**
   * SQLite 文件持久 checkpointer：session 的历史 / resume / fork 跨进程重启保留。
   *
   * 需要可选依赖 `@langchain/langgraph-checkpoint-sqlite`（开源）。未安装时抛出安装指引。
   * `path` 为 `:memory:` 时为内存库（不落盘）；为文件路径时其父目录需已存在。
   */
  async sqlite(path = "sessions.db"): Promise<BaseCheckpointSaver> {
    // 用 `as string` 把字面量擦成 string 类型：让 TS 把它当动态 import（返回 any），
    // 从而不在编译期解析这个可选模块（包未安装时 typecheck 也不会失败）。
    const spec = "@langchain/langgraph-checkpoint-sqlite" as string;
    let mod: {
      SqliteSaver: { fromConnString(p: string): BaseCheckpointSaver };
    };
    try {
      mod = (await import(spec)) as typeof mod;
    } catch {
      throw new Error(
        "checkpoint.sqlite requires the optional dependency '@langchain/langgraph-checkpoint-sqlite'. " +
          "Install it (open source): pnpm add @langchain/langgraph-checkpoint-sqlite",
      );
    }
    return mod.SqliteSaver.fromConnString(path);
  },
};
