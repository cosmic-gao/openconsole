/**
 * 基于图的插件顺序:把"先后关系"建模成 {@link https://www.npmjs.com/package/@openconsole/graph | @openconsole/graph}
 * 的有向图,用 `IncrementalTopo` 增量维护拓扑序,产出顺序码。
 *
 * 建模:
 *  - 节点 = 每个插件 + 两个相 barrier(`::phase:pre::` / `::phase:post::`);权重载荷 = {@link OrderNode};
 *  - 边(`Socket.exec` 纯执行流,只表先后):`pre` / `post` 依赖 + enforce 相序
 *    (pre 相 → preBarrier → 默认相 → postBarrier → post 相);
 *  - 一次拓扑同时满足"相序 + 依赖序";enforce 与依赖矛盾时自然成环,由 `scc` 抓出报错。
 */

import {
  Graph,
  IncrementalTopo,
  scc,
  Socket,
  Vertex,
  type GraphId,
  type NodeId,
} from "@openconsole/graph";

export type Enforce = "pre" | "post";

/** 排序输入:插件的先后声明。 */
export interface OrderNode {
  name: string;
  pre?: string[] | undefined;
  post?: string[] | undefined;
  enforce?: Enforce | undefined;
}

/** 一个插件算出的顺序码。 */
export interface OrderCode {
  /** 相:pre=0 / 默认=1 / post=2。 */
  bucket: 0 | 1 | 2;
  /** 相内依赖子图最长路径深度;同 `(bucket, layer)` 互不依赖 → 可并行 setup。 */
  layer: number;
  /** 全局线性序号(过滤 barrier 后的拓扑 rank)。 */
  sequence: number;
  /** 可读可比较的顺序码,如 `"1.002"`。 */
  code: string;
}

/** pre/post 依赖成环。 */
export class CycleError extends Error {
  public constructor(public readonly components: string[][]) {
    super(
      "插件 pre/post 依赖成环(强连通分量):\n" +
        components.map((component) => "  { " + component.join(", ") + " }").join("\n"),
    );
    this.name = "CycleError";
  }
}

const PRE_BARRIER = "::phase:pre::";
const POST_BARRIER = "::phase:post::";
const pad = (value: number): string => String(value).padStart(3, "0");

type ExecIn = { in: Socket<"exec"> };
type ExecOut = { out: Socket<"exec"> };

/**
 * 插件依赖图:封装 `@openconsole/graph`,增量维护顺序;顺序码 = 过滤 barrier 后的 rank。
 */
export class PluginGraph {
  public readonly graph: Graph<OrderNode, void>;
  public readonly topo: IncrementalTopo<OrderNode, void>;

  public constructor(id: GraphId = "plugins" as GraphId) {
    this.graph = new Graph<OrderNode, void>(id);
    this.vertex({ name: PRE_BARRIER });
    this.vertex({ name: POST_BARRIER });
    this.link(PRE_BARRIER as NodeId, POST_BARRIER as NodeId);
    this.topo = new IncrementalTopo(this.graph);
  }

  /** 事务:批量图变更只触发一次 `IncrementalTopo` 重算。 */
  public batch<T>(work: () => T): T {
    return this.graph.batch(work);
  }

  /** 注册节点 + 接相序骨架。pre/post 依赖边在 {@link linkDeps}(待所有节点就位)。 */
  public add(node: OrderNode): void {
    const id = this.vertex(node);
    if (node.enforce === "pre") this.link(id, PRE_BARRIER as NodeId);
    else if (node.enforce === "post") this.link(POST_BARRIER as NodeId, id);
    else {
      this.link(PRE_BARRIER as NodeId, id);
      this.link(id, POST_BARRIER as NodeId);
    }
  }

  /** 连 pre/post 依赖边(引用名不存在则忽略)。 */
  public linkDeps(node: OrderNode): void {
    const id = node.name as NodeId;
    for (const pre of node.pre ?? []) if (this.graph.hasNode(pre as NodeId)) this.link(pre as NodeId, id);
    for (const post of node.post ?? []) if (this.graph.hasNode(post as NodeId)) this.link(id, post as NodeId);
  }

  /** 摘除节点(级联移除关联边 → `IncrementalTopo` 增量更新)。 */
  public remove(name: string): void {
    this.graph.removeNode(name as NodeId);
  }

  /** 给 hook 用的 live 权重:直接读增量 rank。 */
  public weightOf(name: string): number {
    return this.topo.rank(name as NodeId) ?? Number.MAX_SAFE_INTEGER;
  }

  public get hasCycle(): boolean {
    return this.topo.hasCycle;
  }

  public cycleError(): CycleError {
    return new CycleError(
      scc(this.graph)
        .filter((component) => component.length > 1)
        .map((component) => component.map(String)),
    );
  }

  /** 全量顺序码(自省 / 打印用):过滤 barrier、压成 0..N-1。含环抛 {@link CycleError}。 */
  public codes(): Map<string, OrderCode> {
    if (this.topo.hasCycle) throw this.cycleError();
    const real = this.topo.sorted().filter((id) => !this.isBarrier(id));
    const layer = this.layers(real);
    const out = new Map<string, OrderCode>();
    real.forEach((id, sequence) => {
      const node = this.graph.getNode(id)?.weight;
      const bucket = node?.enforce === "pre" ? 0 : node?.enforce === "post" ? 2 : 1;
      out.set(String(id), { bucket, layer: layer.get(id) ?? 0, sequence, code: `${bucket}.${pad(sequence)}` });
    });
    return out;
  }

  public dispose(): void {
    this.topo.dispose();
  }

  private isBarrier(id: NodeId): boolean {
    return id === (PRE_BARRIER as NodeId) || id === (POST_BARRIER as NodeId);
  }

  private vertex(node: OrderNode): NodeId {
    const id = node.name as NodeId;
    const vertex = new Vertex<ExecIn, ExecOut, OrderNode>(id, node);
    vertex.addInput("in", Socket.exec);
    vertex.addOutput("out", Socket.exec);
    this.graph.addNode(vertex);
    return id;
  }

  private link(from: NodeId, to: NodeId): void {
    this.graph.connect([from, "out"], [to, "in"]);
  }

  /** 依赖子图(排除相序边)最长路径分层。 */
  private layers(ordered: NodeId[]): Map<NodeId, number> {
    const layer = new Map<NodeId, number>();
    for (const id of ordered) {
      let max = -1;
      for (const predecessor of this.graph.predecessors(id)) {
        if (this.isBarrier(predecessor)) continue;
        max = Math.max(max, layer.get(predecessor) ?? 0);
      }
      layer.set(id, max + 1);
    }
    return layer;
  }
}
