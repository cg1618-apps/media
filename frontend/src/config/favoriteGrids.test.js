// Frontend: which favourite grids a session is shown.
//
// The two h-game grids hold only rows of a gated type, so a session that
// cannot see h-game must be shown neither - on the statistics page, in its
// sidebar or in the admin editor, which all read visibleFavoriteGrids.
import { describe, expect, it } from "vitest";

import { FAVORITE_GRIDS, visibleFavoriteGrids } from "./favoriteGrids";

const ids = (grids) => grids.map((g) => g.id);

describe("visibleFavoriteGrids", () => {
  it("drops the h-game grids for a session that sees only h-comic", () => {
    // A non-empty gated list, so the grids are refused for lacking h-game
    // and not merely because the session sees nothing gated.
    const shown = ids(visibleFavoriteGrids({ visibleGatedTypes: ["h-comic"] }));
    expect(shown).not.toContain("h-game-franchises");
    expect(shown).not.toContain("h-game-entries");
    expect(shown).toContain("game-entries");
    expect(shown).toHaveLength(FAVORITE_GRIDS.length - 2);
  });

  it("shows them to a session that sees h-game", () => {
    const shown = ids(visibleFavoriteGrids({ visibleGatedTypes: ["h-comic", "h-game"] }));
    expect(shown).toEqual(ids(FAVORITE_GRIDS));
  });

  it("stores the h-game slots under their own key, apart from game's", () => {
    const franchise = FAVORITE_GRIDS.find((g) => g.id === "h-game-franchises");
    const entries = FAVORITE_GRIDS.find((g) => g.id === "h-game-entries");
    expect(franchise).toMatchObject({ key: "H-Game", tier: "franchise", gatedType: "h-game" });
    expect(entries).toMatchObject({
      key: "H-Game",
      tier: "entry",
      entryType: "h-game",
      gatedType: "h-game",
    });
  });
});
