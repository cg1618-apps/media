import { describe, expect, it } from "vitest";
import { UNSCOPED, groupOptionsByScope } from "./optionScopeGroups";

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

  it("lists a value with several scopes under each of them", () => {
    const groups = groupOptionsByScope([
      { value: "神作", scopes: ["anime", "game"] },
    ]);
    expect(values(groups)).toEqual([
      ["anime", ["神作"]],
      ["game", ["神作"]],
    ]);
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
