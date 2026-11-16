// Frontend: a Game Platform console brings its family (lib/gamePlatforms.js).
import { describe, expect, it } from "vitest";
import { platformFamilies, withPlatformFamilies } from "./gamePlatforms";

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

describe("withPlatformFamilies", () => {
  it("adds a console's family just before it", () => {
    expect(withPlatformFamilies("PC, Switch", FAMILIES)).toBe("PC, Nintendo, Switch");
  });

  it("keeps a family that is already there, wherever it is", () => {
    expect(withPlatformFamilies("Switch, Nintendo", FAMILIES)).toBe("Switch, Nintendo");
  });

  it("puts a removed family back while its console stays", () => {
    // MultiSelect hands back the tags without the family just removed.
    expect(withPlatformFamilies("Switch", FAMILIES)).toBe("Nintendo, Switch");
  });

  it("leaves families and other values alone", () => {
    expect(withPlatformFamilies("Nintendo, Browser", FAMILIES)).toBe("Nintendo, Browser");
    expect(withPlatformFamilies("", FAMILIES)).toBe("");
  });
});
