// Frontend: a Game Platform console brings its family (lib/gamePlatforms.js).
import { describe, expect, it } from "vitest";
import {
  MAIN_PLATFORMS,
  mainPlatformsFirst,
  platformFamilies,
  withPlatformFamilies,
} from "./gamePlatforms";

const OPTIONS = [
  { category: "Game Platform", value: "Nintendo", family: null },
  { category: "Game Platform", value: "Switch", family: "Nintendo" },
  { category: "Game Platform", value: "PS5", family: "PlayStation" },
  { category: "Game Platform", value: "PlayStation", family: null },
  // Spelled like a console, in another vocabulary: never a console.
  { category: "Game Genre", value: "Switch", family: "Nintendo" },
];
const FAMILIES = platformFamilies(OPTIONS);

describe("platformFamilies", () => {
  it("maps each console to its family, from Game Platform options only", () => {
    expect(FAMILIES).toEqual({ Switch: "Nintendo", PS5: "PlayStation" });
  });

  it("is empty without options", () => {
    expect(platformFamilies(undefined)).toEqual({});
  });
});

describe("MAIN_PLATFORMS", () => {
  it("lists the six families in main-platform order", () => {
    expect(MAIN_PLATFORMS).toEqual(["PC", "PlayStation", "Xbox", "Nintendo", "Mobile", "Browser"]);
  });
});

describe("mainPlatformsFirst", () => {
  it("moves every main platform ahead, each group keeping its order", () => {
    expect(mainPlatformsFirst(["PS5", "Nintendo", "Windows", "PC", "Steam Deck"])).toEqual([
      "Nintendo",
      "PC",
      "PS5",
      "Windows",
      "Steam Deck",
    ]);
  });

  it("leaves a list already in order alone", () => {
    expect(mainPlatformsFirst(["PC", "Browser", "PS5"])).toEqual(["PC", "Browser", "PS5"]);
    expect(mainPlatformsFirst([])).toEqual([]);
  });
});

describe("withPlatformFamilies", () => {
  it("adds a console's family, ahead of every specific platform", () => {
    expect(withPlatformFamilies("PC, Switch", FAMILIES)).toBe("PC, Nintendo, Switch");
    expect(withPlatformFamilies("Switch, PS5, PC", FAMILIES)).toBe(
      "Nintendo, PlayStation, PC, Switch, PS5",
    );
  });

  it("moves a family that is already there ahead of the consoles", () => {
    expect(withPlatformFamilies("Switch, Nintendo", FAMILIES)).toBe("Nintendo, Switch");
  });

  it("puts a removed family back while its console stays", () => {
    // MultiSelect hands back the tags without the family just removed.
    expect(withPlatformFamilies("Switch", FAMILIES)).toBe("Nintendo, Switch");
  });

  it("counts Browser as main though it has no console", () => {
    expect(withPlatformFamilies("PS5, Browser", FAMILIES)).toBe("PlayStation, Browser, PS5");
  });

  it("leaves a list already in order alone", () => {
    expect(withPlatformFamilies("Nintendo, Browser", FAMILIES)).toBe("Nintendo, Browser");
    expect(withPlatformFamilies("Nintendo, Switch", FAMILIES)).toBe("Nintendo, Switch");
    expect(withPlatformFamilies("", FAMILIES)).toBe("");
  });
});
