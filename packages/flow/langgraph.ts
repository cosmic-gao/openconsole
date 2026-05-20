/**
 * @opendesign/flow —— 基于 `@opendesign/graph` 的 LangGraph 风格有状态智能体运行时。
 *
 * 与 Node-RED 风格数据流 (见 `./index.ts`) 的区别:
 * - 状态全局共享,不通过连线传递;每个节点读取当前状态,返回部分更新 (浅合并)。
 * - 边可以是有条件的: "router" 函数读取状态后挑选要走的出边。
 * - 允许环 —— 典型形态是 `chatbot → tools → chatbot` 循环,直到 chatbot 决定停止。
 *
 * 运行:
 *
 *   pnpm --filter @opendesign/flow demo:langgraph
 */

import {
  Graph,
  Socket,
  Vertex,
  type GraphId,
  type NodeId,
  type Sockets,
} from '@opendesign/graph';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

/** 图的入口 / 出口哨兵节点 ID。 */
export const START = '__start__' as NodeId;
export const END = '__end__' as NodeId;

/** 节点函数: 读取状态,返回部分更新 (通过浅展开合并)。 */
export type NodeFn<S> = (state: S) => Partial<S> | Promise<Partial<S>>;

/** 路由器: 读取状态,返回用于在条件边 mapping 中查找下一站的键。 */
export type Router<S> = (state: S) => string;

type NodeData<S> =
  | { kind: 'task'; fn: NodeFn<S>; router?: Router<S> }
  | { kind: 'start' }
  | { kind: 'end' };

type EdgeData = { kind: 'static' } | { kind: 'cond'; key: string };

// ---------------------------------------------------------------------------
// StateGraph
// ---------------------------------------------------------------------------

/**
 * LangGraph 轻量版。用 `addNode` / `addEdge` / `addConditionalEdges` 搭好结构,
 * 再用 `invoke(initialState)` 触发执行。
 */
export class StateGraph<S extends object> {
  public readonly graph: Graph<NodeData<S>, EdgeData>;

  public constructor(id: string = 'state-graph') {
    this.graph = new Graph<NodeData<S>, EdgeData>(id as GraphId);
    this.graph.addNode(this.boundary(START, { kind: 'start' }));
    this.graph.addNode(this.boundary(END, { kind: 'end' }));
  }

  private boundary(id: NodeId, data: NodeData<S>): Vertex<Sockets, Sockets, NodeData<S>> {
    const v = new Vertex<Sockets, Sockets, NodeData<S>>(id, data);
    v.addInput('in', Socket.exec);
    v.addOutput('out', Socket.exec);
    return v;
  }

  public addNode(name: string, fn: NodeFn<S>): this {
    const v = new Vertex<Sockets, Sockets, NodeData<S>>(
      name as NodeId,
      { kind: 'task', fn },
    );
    v.addInput('in', Socket.exec);
    v.addOutput('out', Socket.exec);
    this.graph.addNode(v);
    return this;
  }

  public addEdge(from: NodeId | string, to: NodeId | string): this {
    this.graph.connect(
      [from as NodeId, 'out'],
      [to as NodeId, 'in'],
      { weight: { kind: 'static' } },
    );
    return this;
  }

  /**
   * 在 `from` 节点上挂一个 router。运行时, `from` 执行完后,运行时用当前状态
   * 调用 router,把返回值在 `mapping` 中查找,沿对应的出边继续。
   */
  public addConditionalEdges(
    from: NodeId | string,
    router: Router<S>,
    mapping: Record<string, NodeId | string>,
  ): this {
    const node = this.graph.getNode(from as NodeId);
    if (!node) throw new Error(`StateGraph: unknown source node "${String(from)}"`);
    const data = node.weight as NodeData<S> | undefined;
    if (!data || data.kind !== 'task') {
      throw new Error(`StateGraph: cannot attach router to "${String(from)}" (not a task node)`);
    }
    data.router = router;
    for (const [key, target] of Object.entries(mapping)) {
      this.graph.connect(
        [from as NodeId, 'out'],
        [target as NodeId, 'in'],
        { weight: { kind: 'cond', key } },
      );
    }
    return this;
  }

  /**
   * 从 START 走到 END。每个 task 节点在被访问时执行一次,返回值浅合并进状态。
   * 允许成环 —— `maxSteps` (默认 100) 用于兜底,防止失控循环。
   */
  public async invoke(initial: S, options: { maxSteps?: number } = {}): Promise<S> {
    const maxSteps = options.maxSteps ?? 100;
    let state: S = { ...initial };
    let current: NodeId = START;
    let steps = 0;

    while (current !== END) {
      if (++steps > maxSteps) {
        throw new Error(`StateGraph: exceeded maxSteps=${String(maxSteps)} (possible runaway loop)`);
      }
      const node = this.graph.getNode(current);
      if (!node) throw new Error(`StateGraph: missing node "${String(current)}"`);
      const data = node.weight as NodeData<S> | undefined;
      if (!data) throw new Error(`StateGraph: node "${String(current)}" has no data`);

      if (data.kind === 'task') {
        const update = await data.fn(state);
        state = { ...state, ...update };
      }
      current = this.next(current, data, state);
    }
    return state;
  }

  private next(currentId: NodeId, data: NodeData<S>, state: S): NodeId {
    const outgoing = this.graph.outgoing(currentId);
    if (outgoing.length === 0) {
      throw new Error(`StateGraph: node "${String(currentId)}" has no outgoing edge`);
    }

    if (data.kind === 'task' && data.router) {
      const key = data.router(state);
      const edge = outgoing.find((e) => {
        const w = e.weight;
        return w !== undefined && w.kind === 'cond' && w.key === key;
      });
      if (!edge) {
        throw new Error(
          `StateGraph: router on "${String(currentId)}" returned "${key}" but no matching edge`,
        );
      }
      return edge.targetId;
    }

    const staticEdge = outgoing.find((e) => e.weight?.kind === 'static');
    if (!staticEdge) {
      throw new Error(`StateGraph: node "${String(currentId)}" has no static outgoing edge`);
    }
    return staticEdge.targetId;
  }
}

// ---------------------------------------------------------------------------
// 示例: 玩具版"计算器智能体" —— chatbot 决定是否调用工具,tools 算出答案,
//   再由 chatbot 收尾。展示 chatbot → tools → chatbot 这个环,以及通向 END 的
//   条件路由。
// ---------------------------------------------------------------------------

interface ChatState {
  question: string;
  toolResult?: number;
  answer?: string;
  trace: string[];
}

async function demo(): Promise<void> {
  const builder = new StateGraph<ChatState>('calc-agent');

  builder.addNode('chatbot', (state) => {
    if (state.toolResult !== undefined && state.answer === undefined) {
      return {
        answer: `${state.question.trim()} = ${state.toolResult}`,
        trace: [...state.trace, `chatbot: I now have the result (${state.toolResult}); answering.`],
      };
    }
    return {
      trace: [...state.trace, 'chatbot: I need a calculator; routing to tools.'],
    };
  });

  builder.addNode('tools', (state) => {
    const m = state.question.match(/(-?\d+)\s*([+\-*/])\s*(-?\d+)/);
    if (!m) return { toolResult: NaN, trace: [...state.trace, 'tools: could not parse.'] };
    const [, aStr, op, bStr] = m;
    const a = Number(aStr);
    const b = Number(bStr);
    const r =
      op === '+' ? a + b :
      op === '-' ? a - b :
      op === '*' ? a * b :
      a / b;
    return {
      toolResult: r,
      trace: [...state.trace, `tools: computed ${a} ${op} ${b} = ${r}.`],
    };
  });

  builder.addEdge(START, 'chatbot');
  builder.addConditionalEdges(
    'chatbot',
    (state) => (state.answer !== undefined ? 'done' : 'use_tool'),
    { use_tool: 'tools', done: END },
  );
  builder.addEdge('tools', 'chatbot');

  const final = await builder.invoke({ question: 'what is 5 + 3?', trace: [] });

  console.log('Trace:');
  for (const line of final.trace) console.log(' •', line);
  console.log('Answer:', final.answer);
}

await demo();
