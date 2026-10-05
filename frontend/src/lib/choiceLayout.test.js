// Frontend: the choice graph's layered layout.
//
// The four shapes the owner's graphs take: a plain branching tree, branches
// that rejoin, a loop back to a hub, and a point nothing connects to yet.
import { describe, expect, it } from "vitest";

import { CHOICE_RANK, choiceLayout } from "./choiceLayout";

const node = (id, kind = "scene", sort_index = 0) => ({ id, kind, title: id, sort_index });
const edge = (id, from, to, sort_index = 0) => ({
  id,
  from_node_id: from,
  to_node_id: to,
  option: null,
  sort_index,
});

describe("choiceLayout", () => {
  it("lays a tree out top to bottom, children under their parent in option order", () => {
    const nodes = [node("s", "start"), node("c", "choice"), node("a", "ending"), node("b", "ending")];
    const edges = [edge("e1", "s", "c"), edge("e2", "c", "b", 1), edge("e3", "c", "a", 0)];
    const { ranks, positions, backEdges } = choiceLayout(nodes, edges);

    expect(ranks).toEqual({ s: 0, c: 1, a: 2, b: 2 });
    expect(positions.s.y).toBe(0);
    expect(positions.a.y).toBe(2 * CHOICE_RANK);
    // Option 0 leads to `a`, so `a` sits left of `b` whatever the input order.
    expect(positions.a.x).toBeLessThan(positions.b.x);
    // A lone point in its rank is centred.
    expect(positions.c.x).toBe(0);
    expect(backEdges.size).toBe(0);
  });

  it("puts a rejoin below the longest branch that reaches it", () => {
    // s -> x -> y -> j and s -> j: j is two ranks below s on the short path
    // but must sit under y, the end of the long one.
    const nodes = [node("s", "start"), node("x"), node("y"), node("j", "ending")];
    const edges = [edge("e1", "s", "x"), edge("e2", "x", "y"), edge("e3", "y", "j"), edge("e4", "s", "j")];
    const { ranks, backEdges } = choiceLayout(nodes, edges);

    expect(ranks).toEqual({ s: 0, x: 1, y: 2, j: 3 });
    expect(backEdges.size).toBe(0);
  });

  it("marks the edge back to a hub as a return and ranks the rest", () => {
    // hub -> a -> b -> hub: the last edge closes the loop.
    const nodes = [node("s", "start"), node("hub", "choice"), node("a"), node("b")];
    const edges = [
      edge("e1", "s", "hub"),
      edge("e2", "hub", "a"),
      edge("e3", "a", "b"),
      edge("back", "b", "hub"),
    ];
    const { ranks, backEdges } = choiceLayout(nodes, edges);

    expect([...backEdges]).toEqual(["back"]);
    expect(ranks).toEqual({ s: 0, hub: 1, a: 2, b: 3 });
  });

  it("finds a root in a graph that is all loop and no start", () => {
    const nodes = [node("a", "scene", 1), node("b", "scene", 0)];
    const edges = [edge("e1", "a", "b"), edge("e2", "b", "a")];
    const { ranks, backEdges } = choiceLayout(nodes, edges);

    // The first by sort_index is the root, so b -> a is forward.
    expect(ranks).toEqual({ b: 0, a: 1 });
    expect([...backEdges]).toEqual(["e1"]);
  });

  it("still places a point nothing connects to", () => {
    const nodes = [node("s", "start"), node("c"), node("lonely", "ending")];
    const edges = [edge("e1", "s", "c")];
    const { positions, ranks } = choiceLayout(nodes, edges);

    expect(Object.keys(positions).sort()).toEqual(["c", "lonely", "s"]);
    expect(ranks.lonely).toBe(0);
    // It shares rank 0 with the start, side by side rather than on top of it.
    expect(positions.lonely.x).not.toBe(positions.s.x);
  });

  it("ignores an edge naming a point the graph does not hold", () => {
    const { positions, backEdges } = choiceLayout([node("s", "start")], [edge("e1", "s", "gone")]);
    expect(positions.s).toEqual({ x: 0, y: 0 });
    expect(backEdges.size).toBe(0);
  });

  it("returns an empty layout for an empty graph", () => {
    expect(choiceLayout([], [])).toEqual({ positions: {}, ranks: {}, backEdges: new Set() });
  });
});
