// Frontend: the rows-to-canvas mapping behind ChoiceGraph, and what each item
// is drawn as.
//
// jsdom measures nothing, so React Flow never draws an edge in a test; what
// an arrow will look like is pinned here, on the objects handed to it. Blocks
// and branch pills are rendered on their own to pin that they are drawn as
// different things.
import { render, screen, within } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import ChoiceBranch from "./ChoiceBranch";
import { connectionIntent, toFlow } from "./ChoiceGraph";
import ChoiceNode from "./ChoiceNode";
import { marksByTarget } from "./choiceGraphData";
import { GRAPH, branch, link, node } from "./testGraph";

const byId = (list) => Object.fromEntries(list.map((x) => [x.id, x]));

describe("toFlow", () => {
  it("draws blocks and branch pills as two different node types", () => {
    const { nodes } = toFlow({ graph: GRAPH });
    const types = Object.fromEntries(nodes.map((n) => [n.id, n.type]));
    expect(types).toEqual({
      "n-start": "block",
      "n-bridge": "block",
      "n-good": "block",
      "n-bad": "block",
      "branch:b-cross": "branch",
      "branch:b-back": "branch",
      "branch:b-luck": "branch",
    });
    // A link is not an item of its own.
    expect(types["branch:l-start"]).toBeUndefined();
  });

  it("joins block to pill and pill to next block, a link block to block, and a dangling branch to nothing", () => {
    const { edges } = toFlow({ graph: GRAPH });
    const arrows = edges.map((e) => [e.id, e.source, e.target]);
    expect(arrows).toEqual(
      expect.arrayContaining([
        ["b-cross:in", "n-bridge", "branch:b-cross"],
        ["b-cross:out", "branch:b-cross", "n-good"],
        ["b-luck:in", "n-bridge", "branch:b-luck"],
        ["l-start", "n-start", "n-bridge"],
      ]),
    );
    expect(arrows.find(([id]) => id === "b-luck:out")).toBeUndefined();
    expect(edges).toHaveLength(6);
  });

  it("draws the arrows of a done branch heavier, and a return dashed through the side handles", () => {
    const graph = {
      nodes: [node("a", "start", "A"), node("b", "part", "B")],
      edges: [link("ab", "a", "b"), branch("again", "choice", "b", "a", "Again")],
    };
    const marks = marksByTarget([{ id: "m", node_id: null, edge_id: "again", done: true, note: null }]);
    const edges = byId(toFlow({ graph, marks }).edges);

    expect(edges["again:in"].style.strokeWidth).toBeGreaterThan(edges.ab.style.strokeWidth);
    expect(edges["again:out"].data.isReturn).toBe(true);
    expect(edges["again:out"].style.strokeDasharray).toBeTruthy();
    expect(edges["again:out"].sourceHandle).toBe("return-out");
    expect(edges["again:out"].targetHandle).toBe("return-in");
    expect(edges.ab.data.isReturn).toBe(false);
    expect(edges.ab.style.strokeDasharray).toBeUndefined();
  });

  it("hands each item its mark, its size and its laid-out position, and saves only to blocks", () => {
    const marks = marksByTarget([
      { id: "m", node_id: "n-good", edge_id: null, done: true, note: null },
      { id: "m2", node_id: null, edge_id: "b-cross", done: false, note: "risky" },
    ]);
    const saves = new Map([["n-bridge", [{ system_id: "s", locator: "2" }]]]);
    const nodes = byId(
      toFlow({ graph: GRAPH, marks, saves, selected: { type: "edge", id: "b-cross" } }).nodes,
    );

    expect(nodes["n-good"].data.mark.done).toBe(true);
    expect(nodes["n-bridge"].data.saves).toHaveLength(1);
    expect(nodes["branch:b-cross"].data.saves).toBeUndefined();
    expect(nodes["branch:b-cross"].data.mark.note).toBe("risky");
    expect(nodes["branch:b-cross"].data.selected).toBe(true);
    expect(nodes["n-bridge"].data.selected).toBe(false);
    // Under the bridge: its pill, then the ending the pill leads to.
    expect(nodes["n-bridge"].position.y).toBeLessThan(nodes["branch:b-cross"].position.y);
    expect(nodes["branch:b-cross"].position.y).toBeLessThan(nodes["n-good"].position.y);
    // The block with a description is drawn larger than a title-only one.
    expect(nodes["n-bridge"].data.size.height).toBeGreaterThan(nodes["n-start"].data.size.height);
  });
});

describe("connectionIntent", () => {
  const drag = (source, target, sourceHandle = "out", targetHandle = "in") => ({
    source,
    target,
    sourceHandle,
    targetHandle,
  });

  it("reads a drag from a block onto another block as a link", () => {
    expect(connectionIntent(drag("a", "b"))).toEqual({ type: "link", from: "a", to: "b" });
  });

  it("reads a drag from a branch onto a block as its next part, its own block included", () => {
    expect(connectionIntent(drag("branch:x", "b"))).toEqual({ type: "next", edgeId: "x", to: "b" });
  });

  it("refuses a drop on a branch, on the same block, or on the wrong handles", () => {
    expect(connectionIntent(drag("a", "branch:x"))).toBeNull();
    expect(connectionIntent(drag("a", "a"))).toBeNull();
    expect(connectionIntent(drag("a", "b", "return-out"))).toBeNull();
  });
});

describe("drawing", () => {
  const draw = (ui) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
  const size = { width: 150, height: 40 };

  it("draws a branch as a pill with its kind's icon, not as a block", () => {
    draw(
      <>
        <ChoiceBranch data={{ edge: GRAPH.edges[1], size }} />
        <ChoiceBranch data={{ edge: GRAPH.edges[3], size }} />
      </>,
    );
    const choice = screen.getByTestId("choice-branch-b-cross");
    const condition = screen.getByTestId("choice-branch-b-luck");
    expect(screen.queryByTestId(/^choice-node-/)).toBeNull();
    expect(choice.className).toContain("rounded-full");
    expect(choice.className).toContain("bg-brand-soft");

    const choiceIcon = within(choice).getByTestId("branch-icon");
    const conditionIcon = within(condition).getByTestId("branch-icon");
    expect(choiceIcon).toHaveAttribute("aria-label", "Choice");
    expect(choiceIcon.className).toContain("fa-code-branch");
    expect(conditionIcon).toHaveAttribute("aria-label", "Condition");
    expect(conditionIcon.className).toContain("fa-circle-question");
    // A pill with a description is no longer fully round.
    expect(condition.className).not.toContain("rounded-full");
  });

  it("offers + next part on a dangling branch only when the canvas is editable", () => {
    const onAddNext = () => {};
    const { unmount } = draw(<ChoiceBranch data={{ edge: GRAPH.edges[3], size, onAddNext }} />);
    expect(screen.getByRole("button", { name: "+ next part" })).toBeInTheDocument();
    unmount();

    draw(<ChoiceBranch data={{ edge: GRAPH.edges[3], size }} />);
    expect(screen.queryByRole("button", { name: "+ next part" })).toBeNull();
  });

  it("offers no + next part on a branch that already has one", () => {
    draw(<ChoiceBranch data={{ edge: GRAPH.edges[1], size, onAddNext: () => {} }} />);
    expect(screen.queryByRole("button", { name: "+ next part" })).toBeNull();
  });

  it("marks a start with a play icon and an ending with a flag, and a part with neither", () => {
    draw(
      <>
        <ChoiceNode data={{ node: GRAPH.nodes[0], size }} />
        <ChoiceNode data={{ node: GRAPH.nodes[1], size }} />
        <ChoiceNode data={{ node: GRAPH.nodes[2], size }} />
      </>,
    );
    expect(within(screen.getByTestId("choice-node-n-start")).getByLabelText("Start")).toBeInTheDocument();
    expect(within(screen.getByTestId("choice-node-n-good")).getByLabelText("Ending")).toBeInTheDocument();
    const part = screen.getByTestId("choice-node-n-bridge");
    expect(within(part).queryByLabelText("Start")).toBeNull();
    expect(within(part).queryByLabelText("Ending")).toBeNull();
  });

  it("shows a block's description excerpt and the viewer's note excerpt", () => {
    draw(<ChoiceNode data={{ node: GRAPH.nodes[1], size, mark: { done: false, note: "Pay him" } }} />);
    expect(screen.getByTestId("block-excerpt")).toHaveTextContent("A troll guards it.");
    expect(screen.getByTestId("block-note")).toHaveTextContent("Pay him");
  });
});
