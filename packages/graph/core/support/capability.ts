import type { IntoDegree, IntoEdges, NodeIndexable } from "../types";

/**
 * 能力探测：trait 是可选实现的，算法与视图在运行时嗅探内层图具备哪些能力，命中则走
 * 直通快路径。全包统一走这里的类型守卫，避免各处自行 `in` / `typeof` 判断而口径不一。
 */

/** 是否具备 {@link IntoEdges}。 */
export function hasEdges<E = unknown>(graph: object): graph is IntoEdges<E> {
  const probe = graph as Partial<IntoEdges<E>>;
  return (
    typeof probe.edgeViews === "function" &&
    typeof probe.inEdges === "function" &&
    typeof probe.outEdges === "function"
  );
}

/** 是否具备 {@link IntoDegree}。 */
export function hasDegree(graph: object): graph is IntoDegree {
  const probe = graph as Partial<IntoDegree>;
  return (
    typeof probe.inDegree === "function" &&
    typeof probe.outDegree === "function"
  );
}

/** 是否具备 {@link NodeIndexable}。 */
export function hasIndex(graph: object): graph is NodeIndexable {
  const probe = graph as Partial<NodeIndexable>;
  return (
    typeof probe.bound === "function" &&
    typeof probe.at === "function" &&
    typeof probe.indexOf === "function"
  );
}
