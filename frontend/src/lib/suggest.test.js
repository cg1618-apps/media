import { describe, expect, it } from "vitest";

import { rankByMatch, suggest } from "./suggest";

const options = ["3C", "包包 / 袋子", "藥品 / 衛生", "重要", "小包包"];

describe("suggest", () => {
  it("offers everything before anything is typed", () => {
    expect(suggest(options, "")).toEqual(options);
    expect(suggest(options, null)).toEqual(options);
  });

  it("narrows to what contains the text, prefix matches first", () => {
    expect(suggest(options, "包")).toEqual(["包包 / 袋子", "小包包"]);
    expect(suggest(["3C", "a3c"], "3c")).toEqual(["a3c"]);
  });

  it("leaves out the option already typed in full", () => {
    expect(suggest(options, "重要")).toEqual([]);
  });
});

describe("rankByMatch", () => {
  it("puts the exact match first, then prefixes, then contains", () => {
    const items = ["xaoi", "aoi yuuki", "aoi", "nothing"];
    expect(rankByMatch(items, "aoi")).toEqual(["aoi", "aoi yuuki", "xaoi"]);
  });

  it("keeps the given order inside a tier, never alphabetising", () => {
    const items = ["kana b", "kana a", "kana c"];
    expect(rankByMatch(items, "kana")).toEqual(items);
  });

  it("matches on the key the caller gives", () => {
    const items = [{ name: "Hana" }, { name: "Han" }];
    expect(rankByMatch(items, "han", (i) => i.name.toLowerCase())).toEqual([
      { name: "Han" },
      { name: "Hana" },
    ]);
  });

  it("keeps everything when nothing is typed", () => {
    expect(rankByMatch(["b", "a"], "")).toEqual(["b", "a"]);
  });
});
