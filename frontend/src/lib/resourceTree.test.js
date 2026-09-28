// The arithmetic behind every Resources move. The reorder endpoint rejects a
// partial list, so each body here is asserted whole: the complete new child
// list of the parent the node lands in, and that parent's id.
import { describe, expect, it } from "vitest";

import {
  applyReorder,
  canDropInto,
  countByKind,
  countDescendants,
  flattenGroups,
  moveAmongSiblings,
  moveInto,
  parentIdOf,
} from "./resourceTree";

const item = (id) => ({ system_id: id, kind: "item", title: id, content: id, children: [] });
const group = (id, children = []) => ({
  system_id: id,
  kind: "group",
  title: id,
  content: null,
  children,
});

// a ─┬ a1
//    ├ b ─┬ b1
//    │    └ c ─ c1
//    └ a2
// d ── d1
// top
const TREE = [
  group("a", [item("a1"), group("b", [item("b1"), group("c", [item("c1")])]), item("a2")]),
  group("d", [item("d1")]),
  item("top"),
];

describe("canDropInto", () => {
  // The fixture is deep on purpose: a group with no descendants would let a
  // broken ancestry check pass, because there would be nothing to refuse.
  it("refuses a group into itself", () => {
    expect(canDropInto(TREE, "b", "b")).toBe(false);
  });

  it("refuses a group into any of its descendants, at every depth", () => {
    expect(canDropInto(TREE, "a", "b")).toBe(false);
    expect(canDropInto(TREE, "a", "c")).toBe(false);
    expect(canDropInto(TREE, "b", "c")).toBe(false);
  });

  it("allows the same group into a sibling or an ancestor", () => {
    expect(canDropInto(TREE, "b", "d")).toBe(true);
    expect(canDropInto(TREE, "c", "a")).toBe(true);
    expect(canDropInto(TREE, "c", "d")).toBe(true);
  });

  it("allows anything at the top level", () => {
    expect(canDropInto(TREE, "c", null)).toBe(true);
    expect(canDropInto(TREE, "c1", null)).toBe(true);
  });

  it("refuses an item as a parent", () => {
    expect(canDropInto(TREE, "d1", "a1")).toBe(false);
  });
});

describe("moveAmongSiblings", () => {
  it("sends the whole sibling list with the node swapped down", () => {
    expect(moveAmongSiblings(TREE, "a1", 1)).toEqual({
      parent_id: "a",
      ordered_ids: ["b", "a1", "a2"],
    });
  });

  it("sends the whole sibling list with the node swapped up", () => {
    expect(moveAmongSiblings(TREE, "a2", -1)).toEqual({
      parent_id: "a",
      ordered_ids: ["a1", "a2", "b"],
    });
  });

  it("uses a null parent at the top level", () => {
    expect(moveAmongSiblings(TREE, "d", -1)).toEqual({
      parent_id: null,
      ordered_ids: ["d", "a", "top"],
    });
  });

  it("has nowhere to go past either end", () => {
    expect(moveAmongSiblings(TREE, "a1", -1)).toBeNull();
    expect(moveAmongSiblings(TREE, "a2", 1)).toBeNull();
  });
});

describe("moveInto", () => {
  it("appends to another group, sending that group's full new list", () => {
    expect(moveInto(TREE, "a1", "d")).toEqual({
      parent_id: "d",
      ordered_ids: ["d1", "a1"],
    });
  });

  it("inserts at an index in another group", () => {
    expect(moveInto(TREE, "c1", "a", 1)).toEqual({
      parent_id: "a",
      ordered_ids: ["a1", "c1", "b", "a2"],
    });
  });

  it("takes the target's slot when moved down within its own list", () => {
    expect(moveInto(TREE, "a1", "a", 2)).toEqual({
      parent_id: "a",
      ordered_ids: ["b", "a2", "a1"],
    });
  });

  it("moves a group out to the top level", () => {
    expect(moveInto(TREE, "c", null)).toEqual({
      parent_id: null,
      ordered_ids: ["a", "d", "top", "c"],
    });
  });

  it("returns null for a forbidden drop", () => {
    expect(moveInto(TREE, "a", "c")).toBeNull();
    expect(moveInto(TREE, "b", "b")).toBeNull();
  });

  it("returns null when nothing changes", () => {
    expect(moveInto(TREE, "a2", "a")).toBeNull();
    expect(moveInto(TREE, "a1", "a", 0)).toBeNull();
  });
});

describe("applyReorder", () => {
  it("moves a node between parents and keeps the old parent's order", () => {
    const next = applyReorder(TREE, { parent_id: "d", ordered_ids: ["a1", "d1"] });
    expect(next[0].children.map((n) => n.system_id)).toEqual(["b", "a2"]);
    expect(next[1].children.map((n) => n.system_id)).toEqual(["a1", "d1"]);
    expect(next[1].children[0].parent_id).toBe("d");
  });

  it("keeps a moved group's subtree", () => {
    const next = applyReorder(TREE, { parent_id: null, ordered_ids: ["a", "c", "d", "top"] });
    expect(next.map((n) => n.system_id)).toEqual(["a", "c", "d", "top"]);
    expect(next[1].children.map((n) => n.system_id)).toEqual(["c1"]);
  });
});

describe("tree reading helpers", () => {
  it("counts every descendant, and by kind", () => {
    expect(countDescendants(TREE[0])).toBe(6);
    expect(countByKind(TREE[0])).toEqual({ group: 2, item: 4 });
    expect(countByKind(TREE[1])).toEqual({ group: 0, item: 1 });
  });

  it("finds a node's parent", () => {
    expect(parentIdOf(TREE, "c1")).toBe("c");
    expect(parentIdOf(TREE, "a")).toBeNull();
    expect(parentIdOf(TREE, "nope")).toBeUndefined();
  });

  it("flattens the groups in reading order with their depth", () => {
    expect(flattenGroups(TREE).map(({ node, depth }) => [node.system_id, depth])).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 2],
      ["d", 0],
    ]);
  });
});
