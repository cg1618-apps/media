// Frontend: the restricted sources an h-comic is prefilled with, and how the
// Add form's untouched rows follow the region.
import { describe, expect, it } from "vitest";

import {
  followRegion,
  suggestedRestrictedSources,
  withSuggestedRestrictedSources,
} from "./hComicRestrictedSources";

const KR_ONLY = ["污汙漫畫", "漫小肆ikanhm", "ToonGod", "Anime Planet", "MANGA18", "MANGADNA"];

const restricted = (name, url = "") => ({
  kind: "access",
  bucket: "restricted",
  name,
  url,
  available: null,
});
const names = (rows) => rows.map((r) => r.name);

describe("suggestedRestrictedSources", () => {
  it("offers 禁漫天堂 on every region", () => {
    expect(suggestedRestrictedSources("")).toEqual(["禁漫天堂"]);
    expect(suggestedRestrictedSources("JP")).toEqual(["禁漫天堂"]);
  });

  it("adds the six KR sources on KR", () => {
    expect(suggestedRestrictedSources("KR")).toEqual(["禁漫天堂", ...KR_ONLY]);
  });
});

describe("withSuggestedRestrictedSources", () => {
  it("adds only the names the rows do not already carry", () => {
    const rows = [restricted("禁漫天堂", "https://x.test"), restricted("ToonGod")];
    const out = withSuggestedRestrictedSources(rows, "KR");
    expect(out.slice(0, 2)).toEqual(rows);
    expect(names(out)).toEqual(["禁漫天堂", "ToonGod", ...KR_ONLY.filter((n) => n !== "ToonGod")]);
  });

  it("does not count a same-named row in another bucket", () => {
    const other = { ...restricted("禁漫天堂"), bucket: "other" };
    expect(names(withSuggestedRestrictedSources([other], "JP"))).toEqual([
      "禁漫天堂",
      "禁漫天堂",
    ]);
  });
});

describe("followRegion", () => {
  it("adds the KR sources when the region becomes KR", () => {
    const out = followRegion([restricted("禁漫天堂")], "", "KR");
    expect(names(out)).toEqual(["禁漫天堂", ...KR_ONLY]);
  });

  it("drops the untouched KR sources when the region leaves KR", () => {
    const rows = followRegion([restricted("禁漫天堂")], "", "KR");
    expect(names(followRegion(rows, "KR", "JP"))).toEqual(["禁漫天堂"]);
  });

  it("keeps a KR source that has a url, and a name the suggestions do not hold", () => {
    // Made non-empty on purpose: the untouched KR rows ARE dropped by the
    // same call, so what survives survived the guard, not an empty run.
    const rows = [
      ...followRegion([restricted("禁漫天堂")], "", "KR").filter((r) => r.name !== "ToonGod"),
      restricted("ToonGod", "https://toongod.test/x"),
      restricted("Hand typed"),
    ];
    const out = followRegion(rows, "KR", "JP");
    expect(names(out)).toEqual(["禁漫天堂", "ToonGod", "Hand typed"]);
  });

  it("never drops 禁漫天堂, which every region has", () => {
    expect(names(followRegion([restricted("禁漫天堂")], "KR", "JP"))).toEqual(["禁漫天堂"]);
  });
});
