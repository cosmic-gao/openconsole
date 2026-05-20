/**
 * @opendesign/flow —— 基于 `@opendesign/graph` 的 Node-RED 风格轻量数据流运行时。
 *
 * 概念:
 * - **NodeType**  —— 声明输入/输出端口形态 + `run(inputs, ctx)` 函数。
 * - **Flow**      —— 包装 {@link Graph};按已注册类型实例化节点并连接端口。
 * - **执行模型**   —— 推送式单遍数据流(按拓扑序遍历 DAG)。
 *
 * 单文件实现,仅供快速测试。运行:
 *
 *   pnpm --filter @opendesign/flow demo
 */

import {
  Graph,
  Socket,
  Vertex,
  toposort,
  type GraphId,
  type NodeId,
  type Sockets,
} from '@opendesign/graph';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

/** 沿线流动的任意值(对应 Node-RED 的 `msg`)。 */
export type Msg = unknown;

/** 端口名 → 值的映射,既用作输入也用作输出。 */
export type PortBag = Record<string, Msg>;

/** 端口名 → Socket;声明一个节点类型的输入或输出形态。 */
export type PortShape = Record<string, Socket>;

/** 传给节点 `run` 函数的运行时上下文。 */
export interface FlowContext {
  /** 当前正在执行的节点 ID。 */
  readonly nodeId: NodeId;
  /** 该节点实例化时配置的只读属性包。 */
  readonly config: Readonly<Record<string, unknown>>;
  /** 带 `[节点 ID]` 前缀的便捷日志函数。 */
  log(...args: unknown[]): void;
}

/**
 * 节点类型定义。`run` 接收本轮收到的输入,返回每个输出端口要发出的值(省略
 * 即表示不发出任何东西)。
 */
export interface NodeType<
  I extends PortShape = PortShape,
  O extends PortShape = PortShape,
> {
  readonly type: string;
  readonly inputs: I;
  readonly outputs: O;
  run(
    inputs: PortBag,
    ctx: FlowContext,
  ): PortBag | void | Promise<PortBag | void>;
}

// ---------------------------------------------------------------------------
// Flow 运行时
// ---------------------------------------------------------------------------

interface NodeData {
  readonly type: string;
  readonly config: Readonly<Record<string, unknown>>;
}

/**
 * 类 Node-RED 的轻量级运行时。
 *
 * 1. `register(type)` —— 注册一个节点类型
 * 2. `add(id, type, config?)` —— 实例化一个节点
 * 3. `wire([from, port], [to, port])` —— 连接端口
 * 4. `run()` —— 执行一遍,返回各节点产出的输出包
 */
export class Flow {
  public readonly graph: Graph<NodeData, Msg>;
  private readonly types = new Map<string, NodeType>();

  public constructor(id: string = 'flow') {
    this.graph = new Graph<NodeData, Msg>(id as GraphId);
  }

  public register<I extends PortShape, O extends PortShape>(
    def: NodeType<I, O>,
  ): this {
    if (this.types.has(def.type)) {
      throw new Error(`Flow: node type "${def.type}" already registered.`);
    }
    this.types.set(def.type, def as unknown as NodeType);
    return this;
  }

  public add(id: string, type: string, config: Record<string, unknown> = {}): NodeId {
    const def = this.types.get(type);
    if (!def) throw new Error(`Flow: unknown node type "${type}".`);

    const nodeId = id as NodeId;
    const vertex = new Vertex<Sockets, Sockets, NodeData>(nodeId, { type, config });
    for (const name of Object.keys(def.inputs)) {
      vertex.addInput(name, def.inputs[name]!);
    }
    for (const name of Object.keys(def.outputs)) {
      vertex.addOutput(name, def.outputs[name]!);
    }
    this.graph.addNode(vertex);
    return nodeId;
  }

  public wire(from: readonly [string, string], to: readonly [string, string]): this {
    this.graph.connect(
      [from[0] as NodeId, from[1]],
      [to[0] as NodeId, to[1]],
    );
    return this;
  }

  /**
   * 按拓扑序让每个节点执行一次。每个节点从上游输出缓存里拉取输入,执行后把
   * 输出写回缓存,下游通过连线读到。
   *
   * 多对一(多条连线汇入同一个输入端口)采用"后写覆盖"语义 —— 这是测试用
   * 运行时,不是调度器。
   */
  public async run(): Promise<Map<NodeId, PortBag>> {
    const order = toposort(this.graph);
    const buffer = new Map<NodeId, PortBag>();

    for (const id of order) {
      const node = this.graph.getNode(id);
      if (!node) continue;

      const data = node.weight as NodeData;
      const def = this.types.get(data.type);
      if (!def) throw new Error(`Flow: node "${String(id)}" has unknown type "${data.type}".`);

      const inputs: PortBag = {};
      for (const edge of this.graph.incoming(id)) {
        const upstream = buffer.get(edge.sourceId);
        const fromName = portNameOf(edge.source.node, edge.source.port, 'output');
        const toName = portNameOf(edge.target.node, edge.target.port, 'input');
        if (fromName && toName) inputs[toName] = upstream?.[fromName];
      }

      const ctx: FlowContext = {
        nodeId: id,
        config: data.config,
        log: (...args) => console.log(`[${String(id)}]`, ...args),
      };

      const out = (await def.run(inputs, ctx)) ?? {};
      buffer.set(id, out);
    }
    return buffer;
  }
}

/** 反向查找:在端口所在节点上找出它声明时的名字。 */
function portNameOf(
  node: { inputs: Record<string, unknown>; outputs: Record<string, unknown> },
  port: unknown,
  direction: 'input' | 'output',
): string | undefined {
  const ports = direction === 'input' ? node.inputs : node.outputs;
  for (const key in ports) {
    if (ports[key] === port) return key;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// 示例 —— 直接执行本文件时运行
// ---------------------------------------------------------------------------

async function demo(): Promise<void> {
  const flow = new Flow('demo');

  // 内置节点类型
  flow
    .register({
      type: 'inject',
      inputs: {},
      outputs: { out: Socket.any },
      run: (_in, ctx) => ({ out: ctx.config['payload'] }),
    })
    .register({
      type: 'function',
      inputs: { in: Socket.any },
      outputs: { out: Socket.any },
      run: (inputs, ctx) => {
        const fn = ctx.config['fn'] as (x: unknown) => unknown;
        return { out: fn(inputs['in']) };
      },
    })
    .register({
      type: 'debug',
      inputs: { in: Socket.any },
      outputs: {},
      run: (inputs, ctx) => {
        ctx.log('debug:', inputs['in']);
      },
    })
    .register({
      type: 'merge',
      inputs: { a: Socket.any, b: Socket.any },
      outputs: { out: Socket.any },
      run: (inputs) => ({ out: [inputs['a'], inputs['b']] }),
    });

  // 构建流程:   inject(21) → function(x*2)  ┐
  //             inject('hi')────────────────┤→ merge → debug
  flow.add('src1', 'inject', { payload: 21 });
  flow.add('src2', 'inject', { payload: 'hi' });
  flow.add('double', 'function', { fn: (x: number) => x * 2 });
  flow.add('m', 'merge');
  flow.add('out', 'debug');

  flow
    .wire(['src1', 'out'], ['double', 'in'])
    .wire(['double', 'out'], ['m', 'a'])
    .wire(['src2', 'out'], ['m', 'b'])
    .wire(['m', 'out'], ['out', 'in']);

  await flow.run();
}

await demo();
