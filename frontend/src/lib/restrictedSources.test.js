// Frontend: the restricted sources each media type is prefilled with and
// offers, and how h-comic's Add form keeps its untouched rows in step with
// the region.
import { describe, expect, it } from "vitest";

import {
  defaultRestrictedSources,
  followRegion,
  mergeHComicAutofill,
  prefillVariants,
  restrictedSourcesFor,
  startingSources,
  withRestrictedSources,
} from "./restrictedSources";

const KR_ONLY = ["污汙漫畫", "漫小肆ikanhm", "ToonGod", "Anime Planet", "MANGA18", "MANGADNA"];
const NOVEL = [
  "bili嗶哩輕小說",
  "無限輕小說",
  "無限小說",
  "輕小說文庫",
  "真白萌",
  "和圖書",
  "小說狂人",
  "全本小說",
];

const restricted = (name, url = "") => ({
  kind: "access",
  bucket: "restricted",
  name,
  url,
  available: null,
});
const names = (rows) => rows.map((r) => r.name);

describe("restrictedSourcesFor", () => {
  it.each([
    ["anime", ["Gimy", "Anime1"], []],
    ["anime-movie", ["Gimy", "Anime1"], []],
    ["tv-show", ["Gimy"], []],
    ["movie", ["Gimy"], []],
    ["cartoon", ["Gimy"], []],
    ["manga", ["漫畫櫃 (電腦版)", "漫畫櫃 (手機版)", "漫畫人"], ["包子漫畫"]],
    ["novel", [], NOVEL],
    ["comic", ["BatCave"], ["GlobalComix", "Read Comics Online"]],
    ["hentai", ["Hanime1"], []],
  ])("%s prefills its every-entry names and offers the rest after them", (type, prefill, optional) => {
    expect(restrictedSourcesFor(type)).toEqual({
      prefill,
      suggestions: [...prefill, ...optional],
    });
  });

  it.each(["game", "h-game"])("has neither built in for %s, but prefills its pick", (type) => {
    expect(restrictedSourcesFor(type)).toEqual({ prefill: [], suggestions: [] });
    expect(restrictedSourcesFor(type, "", { all: ["Somewhere"] })).toEqual({
      prefill: ["Somewhere"],
      suggestions: ["Somewhere"],
    });
  });

  it("has neither for a type with no Sources block", () => {
    expect(restrictedSourcesFor("studio")).toEqual({ prefill: [], suggestions: [] });
  });

  it("gives h-comic 禁漫天堂 on every region and the six KR sources on KR", () => {
    expect(restrictedSourcesFor("h-comic", "").prefill).toEqual(["禁漫天堂"]);
    expect(restrictedSourcesFor("h-comic", "JP").prefill).toEqual(["禁漫天堂"]);
    expect(restrictedSourcesFor("h-comic", "KR").prefill).toEqual(["禁漫天堂", ...KR_ONLY]);
  });

  it("ignores the region on every other type", () => {
    expect(restrictedSourcesFor("manga", "KR")).toEqual(restrictedSourcesFor("manga"));
  });
});

describe("restrictedSourcesFor with picks", () => {
  it("prefills the picked names and still suggests every name, picked first", () => {
    expect(restrictedSourcesFor("manga", "", { all: ["包子漫畫"] })).toEqual({
      prefill: ["包子漫畫"],
      suggestions: ["包子漫畫", "漫畫櫃 (電腦版)", "漫畫櫃 (手機版)", "漫畫人"],
    });
  });

  it("drops blank and repeated picks", () => {
    expect(restrictedSourcesFor("anime", "", { all: ["", " Gimy ", "Gimy"] }).prefill).toEqual([
      "Gimy",
    ]);
  });

  it("keeps the built-in prefill for a variant the picks do not name", () => {
    const picks = { JP: [] };
    expect(restrictedSourcesFor("h-comic", "JP", picks).prefill).toEqual([]);
    expect(restrictedSourcesFor("h-comic", "KR", picks).prefill).toEqual(["禁漫天堂", ...KR_ONLY]);
  });

  it("gives an unset h-comic region what both regions prefill", () => {
    const picks = { JP: ["禁漫天堂", "ToonGod"], KR: ["ToonGod", "MANGA18"] };
    expect(restrictedSourcesFor("h-comic", "", picks).prefill).toEqual(["ToonGod"]);
  });
});

describe("prefillVariants", () => {
  it("offers one variant per region on h-comic, with every name it has", () => {
    expect(prefillVariants("h-comic")).toEqual([
      { key: "JP", label: "JP", names: ["禁漫天堂"], builtIn: ["禁漫天堂"] },
      { key: "KR", label: "KR", names: ["禁漫天堂", ...KR_ONLY], builtIn: ["禁漫天堂", ...KR_ONLY] },
    ]);
  });

  it("offers one variant on every other type, optional names included", () => {
    expect(prefillVariants("novel")).toEqual([
      { key: "all", label: "Every entry", names: NOVEL, builtIn: [] },
    ]);
  });

  it.each(["game", "h-game"])("offers an empty variant on %s, so its prefill can be picked", (type) => {
    expect(prefillVariants(type)).toEqual([
      { key: "all", label: "Every entry", names: [], builtIn: [] },
    ]);
  });

  it("offers none on a type with no Sources block", () => {
    expect(prefillVariants("studio")).toEqual([]);
  });
});

describe("startingSources", () => {
  it("replaces the rows' restricted sources with the region's prefill", () => {
    const other = { ...restricted("Somewhere"), bucket: "other" };
    const out = startingSources("h-comic", [other, restricted("Old")], "KR");
    expect(out[0]).toBe(other);
    expect(names(out.slice(1))).toEqual(["禁漫天堂", ...KR_ONLY]);
  });
});

describe("defaultRestrictedSources", () => {
  it("starts a new entry with one untouched row per prefilled name only", () => {
    // Manga has an optional name too; it must not be prefilled.
    expect(defaultRestrictedSources("manga")).toEqual([
      restricted("漫畫櫃 (電腦版)"),
      restricted("漫畫櫃 (手機版)"),
      restricted("漫畫人"),
    ]);
  });

  it("starts a novel empty, since every one of its names is optional", () => {
    expect(defaultRestrictedSources("novel")).toEqual([]);
  });
});

describe("withRestrictedSources", () => {
  it("adds only the names the rows do not already carry", () => {
    const rows = [restricted("禁漫天堂", "https://x.test"), restricted("ToonGod")];
    const out = withRestrictedSources(rows, restrictedSourcesFor("h-comic", "KR").prefill);
    expect(out.slice(0, 2)).toEqual(rows);
    expect(names(out)).toEqual(["禁漫天堂", "ToonGod", ...KR_ONLY.filter((n) => n !== "ToonGod")]);
  });

  it("does not count a same-named row in another bucket", () => {
    const other = { ...restricted("Gimy"), bucket: "other" };
    expect(names(withRestrictedSources([other], ["Gimy"]))).toEqual(["Gimy", "Gimy"]);
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

describe("followRegion with picks", () => {
  it("adds and drops the picked names, not the built-in ones", () => {
    const picks = { JP: ["禁漫天堂"], KR: ["ToonGod"] };
    const kr = followRegion([restricted("禁漫天堂")], "JP", "KR", picks);
    expect(names(kr)).toEqual(["ToonGod"]);
    expect(names(followRegion(kr, "KR", "JP", picks))).toEqual(["禁漫天堂"]);
  });
});

describe("mergeHComicAutofill", () => {
  const form = { region: "", h_comic_name_cn: "", sources: [restricted("禁漫天堂")] };

  it("carries the untouched sources over to a copied region", () => {
    const out = mergeHComicAutofill(form, { region: "KR", h_comic_name_cn: "名" });

    expect(out.region).toBe("KR");
    expect(out.h_comic_name_cn).toBe("名");
    expect(names(out.sources)).toEqual(["禁漫天堂", ...KR_ONLY]);
  });

  it("keeps copied sources as they are", () => {
    const copied = [restricted("禁漫天堂", "https://x.test/1")];
    const out = mergeHComicAutofill(form, { region: "KR", sources: copied });

    expect(out.sources).toBe(copied);
  });

  it("leaves the sources alone when no region was copied", () => {
    const out = mergeHComicAutofill(form, { h_comic_name_cn: "名" });

    expect(out.sources).toBe(form.sources);
  });
});
