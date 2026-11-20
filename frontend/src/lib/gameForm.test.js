// Frontend: the game form's fields as Add and Modify save them. The
// developer and publisher are checked, never created: they are absent from
// what ensureSourceValues is handed.
import { describe, expect, it } from "vitest";
import { gamePickOnlyFields, gameSourceFields } from "./gameForm";

const split = (raw) =>
  (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const FORM = {
  studio: "FromSoftware",
  publisher: "Bandai Namco",
  director: "Hidetaka Miyazaki",
  game_genre: "角色扮演",
};

describe("gameForm", () => {
  it("never hands the developer or publisher to ensureSourceValues", () => {
    const kinds = gameSourceFields(FORM, split).map((f) => f.source.kind);
    expect(kinds).not.toContain("studio");
    expect(kinds).not.toContain("publisher");
    // The mirror: the fields it does create are still there.
    expect(gameSourceFields(FORM, split)).toContainEqual({
      source: { kind: "person", role: "director", scope: "game" },
      values: ["Hidetaka Miyazaki"],
    });
  });

  it("checks the developer and the game-scoped publisher", () => {
    expect(gamePickOnlyFields(FORM, split)).toEqual([
      {
        source: { kind: "studio" },
        values: ["FromSoftware"],
        label: "Developer",
        tab: "Studio",
      },
      {
        source: { kind: "publisher", scope: "game" },
        values: ["Bandai Namco"],
        label: "Publisher",
        tab: "Publisher",
      },
    ]);
  });
});
