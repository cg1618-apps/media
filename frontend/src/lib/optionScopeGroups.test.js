import { describe, expect, it } from "vitest";
import { SHARED, UNSCOPED, groupOptionsByScope } from "./optionScopeGroups";

const values = (groups) =>
  groups.map((g) => [g.scope, g.options.map((o) => o.value)]);

describe("groupOptionsByScope", () => {
  it("groups by media type in the standard type order", () => {
    const groups = groupOptionsByScope([
      { value: "存檔點少", scopes: ["game"] },
      { value: "會跳OP", scopes: ["anime"] },
      { value: "很多福利", scopes: ["anime"] },
    ]);
    expect(values(groups)).toEqual([
      ["anime", ["會跳OP", "很多福利"]],
      ["game", ["存檔點少"]],
    ]);
  });

  it("lists a value with several scopes once, in the shared group", () => {
    const groups = groupOptionsByScope([
      { value: "會跳OP", scopes: ["anime"] },
      { value: "神作", scopes: ["game", "anime"] },
    ]);
    expect(groups.map((g) => g.scope)).toEqual(["anime", SHARED]);
    expect(groups[0].options.map((o) => o.value)).toEqual(["會跳OP"]);
    expect(
      groups[1].sets.map((s) => [s.scopes, s.options.map((o) => o.value)]),
    ).toEqual([[["anime", "game"], ["神作"]]]);
  });

  it("sub-groups shared values by their exact set of types", () => {
    const [shared] = groupOptionsByScope([
      { value: "科幻", scopes: ["movie", "anime", "tv-show"] },
      { value: "戀愛", scopes: ["manga", "anime"] },
      { value: "奇幻", scopes: ["anime", "manga"] },
    ]);
    expect(shared.scope).toBe(SHARED);
    expect(
      shared.sets.map((s) => [s.scopes, s.options.map((o) => o.value)]),
    ).toEqual([
      [["anime", "movie", "tv-show"], ["科幻"]],
      [["anime", "manga"], ["戀愛", "奇幻"]],
    ]);
  });

  it("puts the shared group after the types and before the unscoped", () => {
    const groups = groupOptionsByScope([
      { value: "通用", scopes: [] },
      { value: "神作", scopes: ["anime", "game"] },
      { value: "存檔點少", scopes: ["game"] },
    ]);
    expect(groups.map((g) => g.scope)).toEqual(["game", SHARED, UNSCOPED]);
  });

  it("puts values with no scope in one group, last", () => {
    const groups = groupOptionsByScope([
      { value: "通用", scopes: [] },
      { value: "會跳OP", scopes: ["anime"] },
      { value: "舊值" },
    ]);
    expect(values(groups)).toEqual([
      ["anime", ["會跳OP"]],
      [UNSCOPED, ["通用", "舊值"]],
    ]);
  });

  it("keeps an unknown scope, after the known ones", () => {
    const groups = groupOptionsByScope([
      { value: "x", scopes: ["retired-type"] },
      { value: "y", scopes: ["hentai"] },
    ]);
    expect(groups.map((g) => g.scope)).toEqual(["hentai", "retired-type"]);
  });

  it("returns no groups for no options", () => {
    expect(groupOptionsByScope([])).toEqual([]);
  });
});
