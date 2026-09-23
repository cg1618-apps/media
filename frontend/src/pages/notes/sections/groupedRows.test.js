import { describe, expect, it } from "vitest";

import { groupNotes, movedGroupOrder, namesOf } from "./groupedRows";

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

describe("namesOf", () => {
  it("keeps non-empty strings only", () => {
    expect(namesOf([" a ", "", null, 3, "b"])).toEqual(["a", "b"]);
    expect(namesOf("a")).toEqual([]);
  });
});
