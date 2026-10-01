import { describe, expect, it } from "vitest";
import {
  ALL_TAB_KEY,
  characterRoleTabs,
  inAnyScope,
  inCharacterRole,
  personScopes,
  scopeChoices,
  toggleIn,
} from "./entityScopes";

describe("entityScopes", () => {
  it("reads a publisher's stored scopes ahead of the media types it is credited on", () => {
    const publisher = { scopes: ["manga"], media_types: ["anime"] };
    expect(inAnyScope(publisher, ["manga"])).toBe(true);
    expect(inAnyScope(publisher, ["anime"])).toBe(false);
  });

  it("reads a studio's or character's credited media types", () => {
    expect(inAnyScope({ media_types: ["game"] }, ["anime", "game"])).toBe(true);
    expect(inAnyScope({ media_types: ["game"] }, ["anime"])).toBe(false);
  });

  it("treats no ticked scope as any scope, even for a record holding none", () => {
    expect(inAnyScope({ media_types: [] }, [])).toBe(true);
    expect(inAnyScope({ media_types: [] }, ["anime"])).toBe(false);
  });

  it("reads a person's scopes for the tab's role, or every role on All", () => {
    const person = {
      roles: [
        { role: "director", scope: "anime" },
        { role: "author", scope: "novel" },
      ],
    };
    expect(personScopes("director")(person)).toEqual(["anime"]);
    expect(personScopes(ALL_TAB_KEY)(person)).toEqual(["anime", "novel"]);
    expect(inAnyScope(person, ["novel"], personScopes("director"))).toBe(false);
  });

  it("offers only the scopes some record holds, in MEDIA_TYPES order", () => {
    const records = [{ media_types: ["game", "anime"] }, { media_types: ["manga"] }];
    expect(scopeChoices(records)).toEqual(["anime", "manga", "game"]);
  });

  it("lists every character on All and only the role's on a role tab", () => {
    expect(characterRoleTabs(["Main", "Core"]).map((t) => t.key)).toEqual([
      ALL_TAB_KEY,
      "Main",
      "Core",
    ]);
    expect(inCharacterRole({ role: null }, ALL_TAB_KEY)).toBe(true);
    expect(inCharacterRole({ role: null }, "Main")).toBe(false);
    expect(inCharacterRole({ role: "Main" }, "Main")).toBe(true);
  });

  it("toggles a value in or out of a list", () => {
    expect(toggleIn(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleIn(["a", "b"], "a")).toEqual(["b"]);
  });
});
