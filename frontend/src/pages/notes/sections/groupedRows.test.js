import { describe, expect, it } from "vitest";

import {
  groupNotes,
  groupRoots,
  groupedIds,
  movedGroupOrder,
  movedRow,
  movedTreeIds,
  namesOf,
  treeIds,
} from "./groupedRows";

const note = (id, female) => ({
  system_id: id,
  fields: { female_characters: female },
});

const shape = (groups) => groups.map((g) => [g.name, g.notes.map((n) => n.system_id)]);

describe("groupNotes", () => {
  it("draws one group per name, in first-appearance order", () => {
    const groups = groupNotes(
      [note("r1", ["Ahri"]), note("r2", ["Bora"]), note("r3", ["Ahri"])],
      "female_characters"
    );
    expect(shape(groups)).toEqual([
      ["Ahri", ["r1", "r3"]],
      ["Bora", ["r2"]],
    ]);
  });

  it("puts a row naming two characters under both", () => {
    const groups = groupNotes(
      [note("r1", ["Ahri", "Bora"]), note("r2", ["Bora"])],
      "female_characters"
    );
    expect(shape(groups)).toEqual([
      ["Ahri", ["r1"]],
      ["Bora", ["r1", "r2"]],
    ]);
  });

  it("follows the stored order, then appends names it does not mention", () => {
    const groups = groupNotes(
      [note("r1", ["Ahri"]), note("r2", ["Bora"]), note("r3", ["Chae"])],
      "female_characters",
      ["Chae", "Ahri"]
    );
    expect(groups.map((g) => g.name)).toEqual(["Chae", "Ahri", "Bora"]);
  });

  it("skips a stored name no row carries any more", () => {
    const groups = groupNotes([note("r1", ["Ahri"])], "female_characters", ["Gone", "Ahri"]);
    expect(groups.map((g) => g.name)).toEqual(["Ahri"]);
  });

  it("keeps rows in the order they arrived within a group", () => {
    const groups = groupNotes([note("r2", ["Ahri"]), note("r1", ["Ahri"])], "female_characters");
    expect(shape(groups)).toEqual([["Ahri", ["r2", "r1"]]]);
  });

  it("does not lose a row naming nobody", () => {
    const groups = groupNotes(
      [note("r1", ["Ahri"]), { system_id: "r2", fields: null }],
      "female_characters"
    );
    expect(shape(groups)).toEqual([
      ["Ahri", ["r1"]],
      [null, ["r2"]],
    ]);
  });

  it("does not repeat a row whose name is listed twice", () => {
    const groups = groupNotes([note("r1", ["Ahri", " Ahri "])], "female_characters");
    expect(shape(groups)).toEqual([["Ahri", ["r1"]]]);
  });
});

describe("movedGroupOrder", () => {
  const groups = [
    { name: "Ahri", notes: [] },
    { name: "Bora", notes: [] },
    { name: "Chae", notes: [] },
    { name: null, notes: [] },
  ];

  it("moves one group and returns every name, the nameless group aside", () => {
    expect(movedGroupOrder(groups, 2, 0)).toEqual(["Chae", "Ahri", "Bora"]);
    expect(movedGroupOrder(groups, 0, 1)).toEqual(["Bora", "Ahri", "Chae"]);
  });

  it("leaves the order alone for an out-of-range move", () => {
    expect(movedGroupOrder(groups, 0, 5)).toEqual(["Ahri", "Bora", "Chae"]);
  });
});

describe("movedRow", () => {
  const groups = [
    { name: "Magic", notes: [{ system_id: "a" }, { system_id: "b" }, { system_id: "c" }] },
    { name: "Combat", notes: [{ system_id: "d" }] },
  ];

  it("moves a row to a new place in its own group, shifting the rows between", () => {
    expect(shape(movedRow(groups, 0, 2, 0))).toEqual([
      ["Magic", ["c", "a", "b"]],
      ["Combat", ["d"]],
    ]);
    expect(shape(movedRow(groups, 0, 0, 1))).toEqual([
      ["Magic", ["b", "a", "c"]],
      ["Combat", ["d"]],
    ]);
  });

  it("leaves every group alone for an out-of-range move", () => {
    expect(shape(movedRow(groups, 0, 0, 3))).toEqual(shape(groups));
    expect(shape(movedRow(groups, 0, -1, 0))).toEqual(shape(groups));
  });
});

describe("groupedIds", () => {
  it("lists the rows in drawn order, group after group", () => {
    expect(
      groupedIds([
        { name: "B", notes: [{ system_id: "x" }] },
        { name: null, notes: [{ system_id: "y" }, { system_id: "z" }] },
      ]),
    ).toEqual(["x", "y", "z"]);
  });
});

describe("namesOf", () => {
  it("keeps non-empty strings only", () => {
    expect(namesOf([" a ", "", null, 3, "b"])).toEqual(["a", "b"]);
    expect(namesOf("a")).toEqual([]);
  });
});

// A hierarchical section grouped by a column: the ROOTS are grouped, and each
// carries its subtree. Nodes are `{ note, children }`, as the component's
// buildTree makes them.
const node = (id, kind, children = []) => ({
  note: { system_id: id, kind },
  children,
});

describe("groupRoots", () => {
  const roots = () => [
    node("r1", "East", [node("c1", null, [node("g1", null)])]),
    node("r2", null),
    node("r3", "West"),
    node("r4", "East", [node("c2", null)]),
  ];

  it("groups the roots by the column, first appearance first, ungrouped last", () => {
    const groups = groupRoots(roots(), "kind");
    expect(groups.map((g) => [g.name, g.nodes.map((n) => n.note.system_id)])).toEqual([
      ["East", ["r1", "r4"]],
      ["West", ["r3"]],
      [null, ["r2"]],
    ]);
  });

  it("keeps each root's subtree with it", () => {
    const [east] = groupRoots(roots(), "kind");
    expect(east.nodes[0].children[0].note.system_id).toBe("c1");
    expect(treeIds(east.nodes)).toEqual(["r1", "c1", "g1", "r4", "c2"]);
  });
});

describe("movedTreeIds", () => {
  it("moves a root among its group's roots and sends every row depth-first", () => {
    const groups = groupRoots(
      [node("r1", "East", [node("c1", null)]), node("r2", "West"), node("r3", "East")],
      "kind",
    );
    expect(movedTreeIds(groups, groups[0].nodes, 0, 1)).toEqual(["r3", "r1", "c1", "r2"]);
  });

  it("moves a child among its siblings and leaves the groups' order alone", () => {
    const groups = groupRoots(
      [node("r1", "East", [node("c1", null), node("c2", null)]), node("r2", "West")],
      "kind",
    );
    const siblings = groups[0].nodes[0].children;
    expect(movedTreeIds(groups, siblings, 1, 0)).toEqual(["r1", "c2", "c1", "r2"]);
  });

  it("leaves the order alone on an out-of-range move", () => {
    const groups = groupRoots([node("r1", "East"), node("r2", "East")], "kind");
    expect(movedTreeIds(groups, groups[0].nodes, 0, 5)).toEqual(["r1", "r2"]);
  });
});
