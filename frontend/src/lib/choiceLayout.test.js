// Frontend: the choice graph's layered layout and its item sizes.
//
// The shapes the owner's graphs take: blocks with branches under them, a
// branch with no next part yet, branches that rejoin an existing block, a
// branch that loops back to its own block, a plain link, and a block nothing
// connects to yet. Then sizing, and that nothing ever overlaps.
import { describe, expect, it } from "vitest";

import {
  BLOCK,
  BRANCH,
  CHOICE_RANK_GAP,
  choiceLayout,
  sizeOf,
  textWidth,
} from "./choiceLayout";

const node = (id, kind = "part", sort_index = 0, content = null) => ({
  id,
  kind,
  title: id,
  content,
  sort_index,
});
const branch = (id, from, to, sort_index = 0, kind = "choice") => ({
  id,
  kind,
  from_node_id: from,
  to_node_id: to,
  title: id,
  content: null,
  sort_index,
});
const link = (id, from, to, sort_index = 0) => ({
  id,
  kind: "link",
  from_node_id: from,
  to_node_id: to,
  title: null,
  content: null,
  sort_index,
});

const ranksOf = (layout) => ({
  ...Object.fromEntries(Object.entries(layout.blocks).map(([id, p]) => [id, p.rank])),
  ...Object.fromEntries(Object.entries(layout.branches).map(([id, p]) => [`~${id}`, p.rank])),
});
const returns = (layout) => layout.arrows.filter((a) => a.isReturn).map((a) => a.id);
const centre = (p) => p.x + p.width / 2;

/** Every placed rectangle, blocks and branches together. */
const rects = (layout) => [...Object.values(layout.blocks), ...Object.values(layout.branches)];
const overlaps = (a, b) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function expectNoOverlap(layout) {
  const all = rects(layout);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) expect(overlaps(all[i], all[j])).toBe(false);
  }
}

describe("choiceLayout", () => {
  it("hangs a block's branches under it, in sort order, and their next parts under them", () => {
    const nodes = [node("s", "start"), node("a", "ending"), node("b", "ending")];
    const edges = [branch("toB", "s", "b", 1), branch("toA", "s", "a", 0)];
    const layout = choiceLayout(nodes, edges);

    expect(ranksOf(layout)).toEqual({ s: 0, "~toA": 1, "~toB": 1, a: 2, b: 2 });
    // Branch 0 sits left of branch 1 whatever the input order, and its next
    // part follows it.
    expect(layout.branches.toA.x).toBeLessThan(layout.branches.toB.x);
    expect(layout.blocks.a.x).toBeLessThan(layout.blocks.b.x);
    // A rank starts below the tallest item of the one above it.
    const s = layout.blocks.s;
    expect(layout.branches.toA.y).toBeGreaterThanOrEqual(s.y + s.height + CHOICE_RANK_GAP);
    // A lone block in its rank is centred.
    expect(centre(s)).toBe(0);
    expect(layout.arrows.map((a) => [a.id, a.kind])).toEqual([
      ["toA:in", "branch-in"],
      ["toA:out", "branch-out"],
      ["toB:in", "branch-in"],
      ["toB:out", "branch-out"],
    ]);
    expect(returns(layout)).toEqual([]);
  });

  it("places a branch with no next part, with nothing leaving it", () => {
    const layout = choiceLayout([node("s", "start")], [branch("open", "s", null)]);
    expect(ranksOf(layout)).toEqual({ s: 0, "~open": 1 });
    expect(layout.arrows.map((a) => a.id)).toEqual(["open:in"]);
  });

  it("puts a block that several branches rejoin below the longest of them", () => {
    // s -> [x] -> m -> [y] -> j, and s -> [short] -> j.
    const nodes = [node("s", "start"), node("m"), node("j", "ending")];
    const edges = [
      branch("x", "s", "m", 0),
      branch("short", "s", "j", 1),
      branch("y", "m", "j", 0),
    ];
    const layout = choiceLayout(nodes, edges);

    expect(ranksOf(layout)).toEqual({ s: 0, "~x": 1, "~short": 1, m: 2, "~y": 3, j: 4 });
    expect(returns(layout)).toEqual([]);
  });

  it("draws a branch that leads back to its own block as a return", () => {
    const nodes = [node("s", "start"), node("hub")];
    const edges = [link("in", "s", "hub"), branch("again", "hub", "hub"), branch("on", "hub", null, 1)];
    const layout = choiceLayout(nodes, edges);

    expect(returns(layout)).toEqual(["again:out"]);
    expect(ranksOf(layout)).toEqual({ s: 0, hub: 1, "~again": 2, "~on": 2 });
  });

  it("finds the root of a story that is all loop: the first block by sort_index", () => {
    const nodes = [node("a", "part", 1), node("b", "part", 0)];
    const edges = [branch("ab", "a", "b"), branch("ba", "b", "a")];
    const layout = choiceLayout(nodes, edges);

    expect(ranksOf(layout)).toEqual({ b: 0, "~ba": 1, a: 2, "~ab": 3 });
    expect(returns(layout)).toEqual(["ab:out"]);
  });

  it("does not count a loop to its own block as an entrance when picking roots", () => {
    // No start: `a` is the only block nothing else leads to, despite its loop.
    const nodes = [node("b", "part", 0), node("a", "part", 1)];
    const edges = [branch("loop", "a", "a"), link("ab", "a", "b")];
    const layout = choiceLayout(nodes, edges);
    expect(layout.blocks.a.rank).toBe(0);
    expect(layout.blocks.b.rank).toBe(1);
  });

  it("links a block straight to another with a plain arrow", () => {
    const nodes = [node("s", "start"), node("next")];
    const layout = choiceLayout(nodes, [link("l", "s", "next")]);
    expect(layout.arrows).toEqual([
      {
        id: "l",
        kind: "link",
        edgeId: "l",
        from: { type: "block", id: "s" },
        to: { type: "block", id: "next" },
        isReturn: false,
      },
    ]);
    expect(ranksOf(layout)).toEqual({ s: 0, next: 1 });
  });

  it("marks a link back up the story as a return", () => {
    const nodes = [node("s", "start"), node("m")];
    const layout = choiceLayout(nodes, [link("down", "s", "m"), link("up", "m", "s")]);
    expect(returns(layout)).toEqual(["up"]);
  });

  it("still places a block nothing connects to, beside the start", () => {
    const nodes = [node("s", "start"), node("c"), node("lonely", "ending")];
    const layout = choiceLayout(nodes, [link("l", "s", "c")]);
    expect(Object.keys(layout.blocks).sort()).toEqual(["c", "lonely", "s"]);
    expect(layout.blocks.lonely.rank).toBe(0);
    expectNoOverlap(layout);
  });

  it("ignores an edge out of, or a link into, a block the graph does not hold", () => {
    const layout = choiceLayout(
      [node("s", "start")],
      [branch("orphan", "gone", "s"), link("l", "s", "gone"), branch("b", "s", "gone")],
    );
    expect(Object.keys(layout.branches)).toEqual(["b"]);
    // A branch whose next part is missing is drawn as one with none.
    expect(layout.arrows.map((a) => a.id)).toEqual(["b:in"]);
  });

  it("returns an empty layout for an empty graph", () => {
    expect(choiceLayout([], [])).toEqual({ blocks: {}, branches: {}, arrows: [] });
  });

  it("never overlaps, with items of mixed sizes across many ranks", () => {
    const long = "A long description of what happens in this part of the story. ".repeat(3);
    const nodes = [
      node("s", "start", 0, long),
      node("p1", "part", 1),
      node("p2", "part", 2, long),
      node("p3", "part", 3),
      node("e1", "ending", 4, long),
      node("e2", "ending", 5),
    ];
    const edges = [
      branch("c1", "s", "p1", 0),
      { ...branch("c2", "s", "p2", 1), content: long },
      branch("c3", "s", null, 2, "condition"),
      branch("c4", "p1", "e1", 0),
      branch("c5", "p1", "p3", 1),
      branch("c6", "p2", "p3", 0),
      branch("c7", "p3", "e2", 0),
      link("l1", "p2", "e1"),
    ];
    const layout = choiceLayout(nodes, edges);
    expectNoOverlap(layout);
    // Ranks never interleave: every item of a later rank is below every item of
    // an earlier one.
    const all = rects(layout);
    for (const a of all) {
      for (const b of all) {
        if (a.rank < b.rank) expect(a.y + a.height).toBeLessThan(b.y);
      }
    }
  });

  it("gives a block with the viewer's note an extra line", () => {
    const nodes = [node("s", "start")];
    const plain = choiceLayout(nodes, []).blocks.s;
    const marks = { nodes: new Map([["s", { note: "remember" }]]), edges: new Map() };
    const noted = choiceLayout(nodes, [], marks).blocks.s;
    expect(noted.height).toBe(plain.height + BLOCK.GAP + BLOCK.EXCERPT_LINE);
  });
});

describe("sizeOf", () => {
  const block = (title, content = null, kind = "part") => ({
    type: "block",
    node: { title, content, kind },
  });
  const pill = (title, content = null) => ({
    type: "branch",
    edge: { kind: "choice", title, content },
  });

  it("counts a CJK character as two Latin ones", () => {
    expect(textWidth("ab", 10)).toBe(20);
    expect(textWidth("分歧", 10)).toBe(40);
    expect(textWidth("", 10)).toBe(0);
  });

  it("keeps a title-only block compact: one line, as wide as its title within the clamp", () => {
    const short = sizeOf(block("Go"));
    expect(short.width).toBe(BLOCK.MIN_WIDTH);
    expect(short.height).toBe(2 * BLOCK.PAD_Y + BLOCK.BORDER + BLOCK.TITLE_LINE);

    const medium = sizeOf(block("The bridge over the river"));
    expect(medium.width).toBeGreaterThan(BLOCK.MIN_WIDTH);
    expect(medium.width).toBeLessThan(BLOCK.MAX_WIDTH);
    expect(medium.height).toBe(short.height);

    // A long title stops at the widest block and wraps to two lines, no more.
    const long = sizeOf(block("x".repeat(200)));
    expect(long.width).toBe(BLOCK.MAX_WIDTH);
    expect(long.height).toBe(short.height + BLOCK.TITLE_LINE);
  });

  it("makes a CJK title wider than a Latin one of the same length", () => {
    expect(sizeOf(block("分歧點分歧點分歧點")).width).toBeGreaterThan(sizeOf(block("abcdefghi")).width);
  });

  it("leaves room for the start or ending icon", () => {
    expect(sizeOf(block("The bridge at midnight", null, "ending")).width).toBe(
      sizeOf(block("The bridge at midnight", null, "part")).width + BLOCK.ICON,
    );
  });

  it("makes a block with a description larger than a title-only one", () => {
    const plain = sizeOf(block("The bridge"));
    const described = sizeOf(block("The bridge", "The troll asks for a toll."));
    expect(described.width).toBe(BLOCK.MAX_WIDTH);
    expect(described.height).toBe(plain.height + BLOCK.GAP + BLOCK.EXCERPT_LINE);
    // The excerpt is clamped to two lines however long the description is.
    const essay = sizeOf(block("The bridge", "word ".repeat(500)));
    expect(essay.height).toBe(plain.height + BLOCK.GAP + 2 * BLOCK.EXCERPT_LINE);
  });

  it("sizes a branch pill the same way, smaller than a block", () => {
    const plain = sizeOf(pill("Cross it"));
    expect(plain.height).toBe(2 * BRANCH.PAD_Y + BRANCH.BORDER + BRANCH.TITLE_LINE);
    expect(plain.height).toBeLessThan(sizeOf(block("Cross it")).height);
    const described = sizeOf(pill("Cross it", "Pay the troll"));
    expect(described.width).toBe(BRANCH.MAX_WIDTH);
    expect(described.height).toBeGreaterThan(plain.height);
  });
});
