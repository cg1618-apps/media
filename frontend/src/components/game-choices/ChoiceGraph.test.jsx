// Frontend: the rows-to-canvas mapping behind ChoiceGraph.
//
// jsdom measures nothing, so React Flow never draws an edge in a test; what
// an edge will look like is pinned here, on the objects handed to it.
import { describe, expect, it } from "vitest";

import { toFlow } from "./ChoiceGraph";
import { marksByTarget } from "./choiceGraphData";
import { edge, node } from "./testGraph";

const GRAPH = {
  nodes: [node("a", "start", "A"), node("b", "choice", "B"), node("c", "ending", "C")],
  edges: [
    edge("ab", "a", "b"),
    edge("bc", "b", "c", "Go on"),
    edge("ba", "b", "a", "Try again", 1),
  ],
};

describe("toFlow", () => {
  it("draws a done option heavier, and a return dashed through the side handles", () => {
    const marks = marksByTarget([
      { id: "m", node_id: null, edge_id: "bc", done: true, note: "yes" },
    ]);
    const { edges } = toFlow({ graph: GRAPH, marks });
    const byId = Object.fromEntries(edges.map((e) => [e.id, e]));

    expect(byId.bc.style.strokeWidth).toBeGreaterThan(byId.ab.style.strokeWidth);
    expect(byId.bc.data.mark).toEqual(expect.objectContaining({ done: true, note: "yes" }));
    expect(byId.bc.data.option).toBe("Go on");

    expect(byId.ba.data.isReturn).toBe(true);
    expect(byId.ba.style.strokeDasharray).toBeTruthy();
    expect(byId.ba.sourceHandle).toBe("return-out");
    expect(byId.ab.data.isReturn).toBe(false);
    expect(byId.ab.style.strokeDasharray).toBeUndefined();
  });

  it("hands each node its mark, its saves and its laid-out position", () => {
    const marks = marksByTarget([{ id: "m", node_id: "c", edge_id: null, done: true, note: null }]);
    const saves = new Map([["b", [{ system_id: "s", locator: "2" }]]]);
    const { nodes } = toFlow({ graph: GRAPH, marks, saves, selected: { type: "node", id: "b" } });
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));

    expect(byId.c.data.mark.done).toBe(true);
    expect(byId.b.data.saves).toHaveLength(1);
    expect(byId.b.data.selected).toBe(true);
    expect(byId.a.position.y).toBeLessThan(byId.b.position.y);
  });
});
