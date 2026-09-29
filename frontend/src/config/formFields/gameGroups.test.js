// Frontend: how a game's fields bucket into groups.
//
// The Add/Modify form draws a Rating section of its own under Classification,
// so the registry has to agree — /defaults reads these groups, and a my_rating
// left in the shared "Status" group would split the three verdict fields
// across two pages that are meant to match.
import { describe, expect, it } from "vitest";
import { GAME_IS_MAIN, IS_MAIN } from "../fieldOptions";
import { getFieldGroups, getFieldMap } from "./index";

describe("game field groups", () => {
  it("puts my rating and both Metacritic scores in Ratings", () => {
    const map = getFieldMap("game");
    expect(map.my_rating.group).toBe("Ratings");
    expect(map.metacritic_score.group).toBe("Ratings");
    expect(map.metacritic_user_score.group).toBe("Ratings");
  });

  it("orders Ratings after Classification, as the form does", () => {
    const groups = getFieldGroups("game").map((g) => g.group);
    expect(groups.indexOf("Ratings")).toBeGreaterThan(
      groups.indexOf("Classification"),
    );
  });
});

describe("is_main on the game types", () => {
  it("offers the game-only vocabulary on game and h-game", () => {
    expect(GAME_IS_MAIN).toEqual(["Main", "Remake", "Remaster"]);
    for (const type of ["game", "h-game"]) {
      const meta = getFieldMap(type).is_main;
      expect(meta, type).toBeDefined();
      expect(meta.control).toBe("select");
      expect(meta.options).toBe(GAME_IS_MAIN);
    }
  });

  it("keeps the shared vocabulary everywhere else", () => {
    expect(getFieldMap("anime").is_main.options).toBe(IS_MAIN);
  });
});
