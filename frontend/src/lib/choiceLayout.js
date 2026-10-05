// Frontend: positions for a game's choice graph.
//
// Pure, no DOM, and no stored positions: the layout is a function of the rows,
// so the same graph always draws the same way and the function is tested on
// its own. Layered top to bottom - a start at the top, the endings below the
// choices that lead to them.
//
// Branches may rejoin and the graph may loop (a hub you come back to), so it
// is not a tree and not necessarily acyclic. The steps:
//
//   1. ROOTS. The `start` points; failing those, the points nothing leads to;
//      failing those (a graph that is one big loop), the first by sort_index.
//   2. BACK EDGES. A depth-first walk from the roots marks every edge that
//      leads back to a point still on the walk's stack. Those are the returns
//      - drawn as return arrows, and left out of ranking, which is what makes
//      the rest acyclic. Points no root reaches are walked afterwards, in
//      sort_index order, so they are still placed and their own loops are
//      still found.
//   3. RANKS. Over what is left, a point's rank is its longest path from a
//      point nothing leads to. Longest rather than shortest, so a rejoin sits
//      below every branch that rejoins there rather than beside the shortest.
//   4. ORDER WITHIN A RANK. By sort_index first - the admin's own say - and
//      then under the parents, by the leftmost parent's place and the order of
//      the option out of it, which keeps a branch's children under it and cuts
//      most crossings. Each rank is centred on x = 0.

export const CHOICE_NODE_WIDTH = 180;
export const CHOICE_NODE_HEIGHT = 64;
// Pitch between columns and between ranks: the node plus its gutter. The rank
// gutter is tall enough for an option label to sit on its arrow.
export const CHOICE_COLUMN = CHOICE_NODE_WIDTH + 48;
export const CHOICE_RANK = CHOICE_NODE_HEIGHT + 76;

const bySortIndex = (order) => (a, b) =>
  (a.sort_index ?? 0) - (b.sort_index ?? 0) || order.get(a.id) - order.get(b.id);

/**
 * @returns {{ positions: Object<string, {x, y}>, ranks: Object<string, number>,
 *   backEdges: Set<string> }}
 */
export function choiceLayout(nodes = [], edges = []) {
  // Input order breaks every tie, so equal sort_index values stay stable.
  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const sorted = [...nodes].sort(bySortIndex(order));
  const known = new Set(order.keys());
  // An edge naming a point that is not in the graph has nothing to draw to.
  const usable = edges.filter((e) => known.has(e.from_node_id) && known.has(e.to_node_id));

  const outgoing = new Map(sorted.map((n) => [n.id, []]));
  const hasIncoming = new Set();
  for (const e of usable) {
    outgoing.get(e.from_node_id).push(e);
    if (e.from_node_id !== e.to_node_id) hasIncoming.add(e.to_node_id);
  }
  const rankOfNode = (id) => order.get(id);
  for (const list of outgoing.values()) {
    list.sort(
      (a, b) =>
        (a.sort_index ?? 0) - (b.sort_index ?? 0) ||
        rankOfNode(a.to_node_id) - rankOfNode(b.to_node_id),
    );
  }

  // 1. Roots.
  let roots = sorted.filter((n) => n.kind === "start");
  if (!roots.length) roots = sorted.filter((n) => !hasIncoming.has(n.id));
  if (!roots.length && sorted.length) roots = [sorted[0]];

  // 2. Back edges, by an iterative DFS (a long story is a deep walk).
  const ON_STACK = 1;
  const DONE = 2;
  const state = new Map();
  const backEdges = new Set();
  const walk = (start) => {
    if (state.has(start)) return;
    state.set(start, ON_STACK);
    const stack = [{ id: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const out = outgoing.get(frame.id);
      if (frame.next >= out.length) {
        state.set(frame.id, DONE);
        stack.pop();
        continue;
      }
      const edge = out[frame.next++];
      const to = edge.to_node_id;
      const seen = state.get(to);
      if (seen === ON_STACK) backEdges.add(edge.id);
      else if (!seen) {
        state.set(to, ON_STACK);
        stack.push({ id: to, next: 0 });
      }
    }
  };
  roots.forEach((n) => walk(n.id));
  sorted.forEach((n) => walk(n.id));

  // 3. Ranks: longest path over the forward edges, in topological order.
  const forward = usable.filter((e) => !backEdges.has(e.id));
  const parents = new Map(sorted.map((n) => [n.id, []]));
  const indegree = new Map(sorted.map((n) => [n.id, 0]));
  for (const e of forward) {
    parents.get(e.to_node_id).push(e);
    indegree.set(e.to_node_id, indegree.get(e.to_node_id) + 1);
  }
  const ranks = Object.fromEntries(sorted.map((n) => [n.id, 0]));
  const queue = sorted.filter((n) => indegree.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const e of outgoing.get(id)) {
      if (backEdges.has(e.id)) continue;
      const to = e.to_node_id;
      ranks[to] = Math.max(ranks[to], ranks[id] + 1);
      indegree.set(to, indegree.get(to) - 1);
      if (indegree.get(to) === 0) queue.push(to);
    }
  }

  // 4. Order within each rank, rank by rank, so every parent is placed first.
  const layers = [];
  for (const n of sorted) (layers[ranks[n.id]] ||= []).push(n);
  const positions = {};
  const column = new Map();
  layers.forEach((layer = [], rank) => {
    const parentKey = (n) => {
      let best = null;
      for (const e of parents.get(n.id)) {
        const key = [column.get(e.from_node_id) ?? Infinity, e.sort_index ?? 0];
        if (!best || key[0] < best[0] || (key[0] === best[0] && key[1] < best[1])) best = key;
      }
      return best || [Infinity, 0];
    };
    const keyed = layer.map((n) => ({ n, parent: parentKey(n) }));
    keyed.sort(
      (a, b) =>
        (a.n.sort_index ?? 0) - (b.n.sort_index ?? 0) ||
        a.parent[0] - b.parent[0] ||
        a.parent[1] - b.parent[1] ||
        order.get(a.n.id) - order.get(b.n.id),
    );
    const offset = (keyed.length - 1) / 2;
    keyed.forEach(({ n }, i) => {
      const x = (i - offset) * CHOICE_COLUMN;
      column.set(n.id, x);
      positions[n.id] = { x, y: rank * CHOICE_RANK };
    });
  });

  return { positions, ranks, backEdges };
}
