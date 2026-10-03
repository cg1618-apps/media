// Frontend: tests for the reorder arithmetic behind the watch-order editor.
import { describe, expect, it } from "vitest";

import { buildBlocks } from "./WatchOrderGuide";
import {
  buildTokens,
  changesNothing,
  moveBlock,
  moveStepByIndex,
  moveStepIntoGap,
  moveStepIntoPart,
  orderPayload,
} from "./watchOrderLayout";

// Part X holds a and b, c is loose, empty part E is drawn after c, part Y
// holds d:  [X: a b] c [E] [Y: d]
const SECTIONS = [
  { system_id: "X", section_name: "X", position: 1 },
  { system_id: "E", section_name: "E", position: 3.5 },
  { system_id: "Y", section_name: "Y", position: 4 },
];
const ITEMS = [
  { system_id: "a", section_id: "X", position: 1 },
  { system_id: "b", section_id: "X", position: 2 },
  { system_id: "c", section_id: null, position: 3 },
  { system_id: "d", section_id: "Y", position: 4 },
];

const blocks = () => buildBlocks(ITEMS, SECTIONS, { includeEmpty: true });
const tokens = () => buildTokens(blocks());

// What the page will draw once the server has applied the payload.
function drawn(payload) {
  const items = payload.items.map((item, i) => ({ ...item, position: i + 1 }));
  return buildBlocks(items, payload.sections, { includeEmpty: true }).map((b) =>
    b.kind === "part"
      ? `${b.section.system_id}[${b.rows.map((r) => r.item.system_id).join("")}]`
      : b.rows.map((r) => r.item.system_id).join("")
  );
}

const commit = (next) => orderPayload(next, SECTIONS);

describe("the starting layout", () => {
  it("draws as the fixture says", () => {
    expect(drawn(commit(tokens()))).toEqual(["X[ab]", "c", "E[]", "Y[d]"]);
  });
});

describe("moving a step by index (typed box, arrow keys, drop on a row)", () => {
  it("takes the row's part when dropped onto a row", () => {
    const payload = commit(moveStepByIndex(tokens(), SECTIONS, 2, 0, "X"));
    expect(drawn(payload)).toEqual(["X[cab]", "E[]", "Y[d]"]);
  });

  it("leaves a part when nudged down past its last step", () => {
    const payload = commit(moveStepByIndex(tokens(), SECTIONS, 1, 2));
    expect(drawn(payload)).toEqual(["X[a]", "cb", "E[]", "Y[d]"]);
  });

  it("joins a part when nudged up into it", () => {
    const payload = commit(moveStepByIndex(tokens(), SECTIONS, 3, 2));
    // d's neighbours are b (X) above and c (loose) below: it adopts X.
    expect(drawn(payload)).toEqual(["X[abd]", "c", "E[]", "Y[]"]);
  });

  it("leaves an emptied part drawn where its last step was", () => {
    const payload = commit(moveStepByIndex(tokens(), SECTIONS, 3, 0, "X"));
    expect(drawn(payload)).toEqual(["X[dab]", "c", "E[]", "Y[]"]);
  });

  it("refuses a move past either end", () => {
    expect(moveStepByIndex(tokens(), SECTIONS, 0, -1)).toBeNull();
    expect(moveStepByIndex(tokens(), SECTIONS, 3, 4)).toBeNull();
  });
});

describe("dropping a step on a part's chrome", () => {
  it("appends it to the part, from below as well as above", () => {
    const payload = commit(moveStepIntoPart(tokens(), SECTIONS, "c", "X"));
    expect(drawn(payload)).toEqual(["X[abc]", "E[]", "Y[d]"]);
    const fromBelow = commit(moveStepIntoPart(tokens(), SECTIONS, "d", "X"));
    expect(drawn(fromBelow)).toEqual(["X[abd]", "c", "E[]", "Y[]"]);
  });

  it("makes it the first step of an empty part, where that part is drawn", () => {
    const payload = commit(moveStepIntoPart(tokens(), SECTIONS, "a", "E"));
    expect(drawn(payload)).toEqual(["X[b]", "c", "E[a]", "Y[d]"]);
  });

  it("does nothing for the part's own last step", () => {
    expect(moveStepIntoPart(tokens(), SECTIONS, "b", "X")).toBeNull();
  });
});

describe("dropping a step in a gap", () => {
  it("unfiles it between two parts", () => {
    // The gap before Y (block 3) - after the empty part, not before it.
    const payload = commit(moveStepIntoGap(tokens(), SECTIONS, blocks(), "a", 3));
    expect(drawn(payload)).toEqual(["X[b]", "c", "E[]", "a", "Y[d]"]);
  });

  it("lands before an empty part when that is the gap it was dropped in", () => {
    const payload = commit(moveStepIntoGap(tokens(), SECTIONS, blocks(), "d", 2));
    expect(drawn(payload)).toEqual(["X[ab]", "cd", "E[]", "Y[]"]);
  });

  it("lands at the end in the tail gap", () => {
    const payload = commit(moveStepIntoGap(tokens(), SECTIONS, blocks(), "a", 4));
    expect(drawn(payload)).toEqual(["X[b]", "c", "E[]", "Y[d]", "a"]);
  });

  it("changes nothing for an unfiled step dropped in the gap above itself", () => {
    const payload = commit(moveStepIntoGap(tokens(), SECTIONS, blocks(), "c", 1));
    expect(changesNothing(ITEMS, payload)).toBe(true);
  });
});

describe("moving a part", () => {
  it("moves every step in it and keeps an empty part where it is drawn", () => {
    const payload = commit(moveBlock(blocks(), 0, 3));
    expect(drawn(payload)).toEqual(["c", "E[]", "Y[d]", "X[ab]"]);
  });

  it("moves an empty part by its position alone", () => {
    const payload = commit(moveBlock(blocks(), 2, 0));
    expect(payload.body.item_ids).toEqual(["a", "b", "c", "d"]);
    expect(drawn(payload)).toEqual(["E[]", "X[ab]", "c", "Y[d]"]);
  });

  it("refuses a move to its own place or off either end", () => {
    expect(moveBlock(blocks(), 1, 1)).toBeNull();
    expect(moveBlock(blocks(), 0, -1)).toBeNull();
    expect(moveBlock(blocks(), 3, 4)).toBeNull();
  });
});

describe("the payload", () => {
  it("names every part exactly once, with every step in order", () => {
    const { body } = commit(moveBlock(blocks(), 0, 3));
    expect(body.item_ids).toEqual(["c", "d", "a", "b"]);
    expect(body.section_ids).toEqual([null, "Y", "X", "X"]);
    expect(body.section_positions.map((s) => s.section_id).sort()).toEqual([
      "E",
      "X",
      "Y",
    ]);
  });

  it("keeps several empty parts in order between the same two steps", () => {
    const sections = [
      { system_id: "P", position: 1.2 },
      { system_id: "Q", position: 1.4 },
    ];
    const items = [
      { system_id: "a", section_id: null, position: 1 },
      { system_id: "b", section_id: null, position: 2 },
    ];
    const layout = buildBlocks(items, sections, { includeEmpty: true });
    const payload = orderPayload(buildTokens(layout), sections);
    const [p, q] = payload.body.section_positions.map((s) => s.position);
    expect(1 < p && p < q && q < 2).toBe(true);
  });
});
