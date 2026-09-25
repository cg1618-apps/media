import { describe, expect, it } from "vitest";

import {
  canSeeGatedType,
  isGatedType,
  requiredLabelsForFranchiseType,
  requiredLabelsForType,
  visibleByType,
  visibleFranchiseTypes,
  visibleMediaTypes,
} from "./gatedTypes";

// The two sessions every test compares. `unrestricted` is the only mode that
// carries the h-comic label, so it is the only one /api/auth/me names it for.
const unrestricted = { visibleGatedTypes: ["h-comic"] };
const narrow = { visibleGatedTypes: [] };

describe("canSeeGatedType", () => {
  it("shows h-comic to a session the server named it for", () => {
    expect(canSeeGatedType(unrestricted, "h-comic")).toBe(true);
  });

  it("hides h-comic from a session the server did not name it for", () => {
    expect(canSeeGatedType(narrow, "h-comic")).toBe(false);
  });

  it("hides it while /api/auth/me has not answered", () => {
    expect(canSeeGatedType({}, "h-comic")).toBe(false);
    expect(canSeeGatedType(null, "h-comic")).toBe(false);
  });

  it("never hides an ungated type", () => {
    expect(canSeeGatedType(narrow, "manga")).toBe(true);
    expect(canSeeGatedType(null, "game")).toBe(true);
  });

  it("knows which types are gated", () => {
    expect(isGatedType("h-comic")).toBe(true);
    expect(isGatedType("manga")).toBe(false);
  });
});

describe("the list filters", () => {
  const types = ["manga", "game", "h-comic"];

  it("drop the gated type for a narrow session and keep it otherwise", () => {
    expect(visibleMediaTypes(narrow, types)).toEqual(["manga", "game"]);
    expect(visibleMediaTypes(unrestricted, types)).toEqual(types);
  });

  it("filter objects by the type they name", () => {
    const tabs = [
      { key: "manga", label: "Manga" },
      { key: "h-comic", label: "H-Comic" },
    ];
    expect(visibleByType(narrow, tabs).map((t) => t.key)).toEqual(["manga"]);
    expect(visibleByType(unrestricted, tabs, (t) => t.key).map((t) => t.key)).toEqual([
      "manga",
      "h-comic",
    ]);
  });

  it("drop the H-Comic franchise type with its media type", () => {
    const fts = ["ACG", "Game", "H-Comic"];
    expect(visibleFranchiseTypes(narrow, fts)).toEqual(["ACG", "Game"]);
    expect(visibleFranchiseTypes(unrestricted, fts)).toEqual(fts);
  });
});

describe("h-game", () => {
  // Both gated types visible, and only h-comic: the second is the non-empty
  // list a refusal has to be tested against, so a green "hidden" proves the
  // h-game entry was looked for and missed.
  const both = { visibleGatedTypes: ["h-comic", "h-game"] };
  const hComicOnly = { visibleGatedTypes: ["h-comic"] };

  it("is a gated type of its own", () => {
    expect(isGatedType("h-game")).toBe(true);
    expect(canSeeGatedType(both, "h-game")).toBe(true);
    expect(canSeeGatedType(hComicOnly, "h-game")).toBe(false);
    expect(canSeeGatedType(hComicOnly, "h-comic")).toBe(true);
  });

  it("drops the H-Game franchise type with its media type", () => {
    const fts = ["Game", "H-Comic", "H-Game"];
    expect(visibleFranchiseTypes(hComicOnly, fts)).toEqual(["Game", "H-Comic"]);
    expect(visibleFranchiseTypes(both, fts)).toEqual(fts);
  });

  it("requires the h-game label on its entries and its franchises", () => {
    expect(requiredLabelsForType("h-game")).toEqual(["h-game"]);
    expect(requiredLabelsForType("game")).toEqual([]);
    expect(requiredLabelsForFranchiseType("H-Game")).toEqual(["h-game"]);
    expect(requiredLabelsForFranchiseType("Game")).toEqual([]);
  });
});

describe("required labels", () => {
  it("names the h-comic label for the h-comic type only", () => {
    expect(requiredLabelsForType("h-comic")).toEqual(["h-comic"]);
    expect(requiredLabelsForType("manga")).toEqual([]);
  });

  it("names it for a franchise whose types include H-Comic", () => {
    expect(requiredLabelsForFranchiseType("H-Comic")).toEqual(["h-comic"]);
    expect(requiredLabelsForFranchiseType("ACG, H-Comic")).toEqual(["h-comic"]);
    expect(requiredLabelsForFranchiseType("ACG, Game")).toEqual([]);
    expect(requiredLabelsForFranchiseType(null)).toEqual([]);
  });
});
