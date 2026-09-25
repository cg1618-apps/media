// Frontend: the hentai library config's filters, sorts and columns.
//
// One entry is one episode, so the page has no progress column; what makes it
// useful is the watch axis and hentai's own vocabularies.
import { describe, expect, it } from "vitest";
import HENTAI_LIBRARY_CONFIG from "./hentai";

const ENTRIES = [
  {
    system_id: "1",
    hentai_name_cn: "甲",
    hentai_name_en: "Beta",
    watching_status: "Completed",
    airing_status: "Finished Airing",
    source_material: "Manga",
    release_date: "2019-05",
  },
  {
    system_id: "2",
    hentai_name_en: "Alpha",
    watching_status: "Might Watch",
    airing_status: "Not Yet Aired",
    source_material: "Original",
    release_date: "2024",
  },
];

const filter = (key) => HENTAI_LIBRARY_CONFIG.filterDefs.find((f) => f.key === key);
const sort = (key) => HENTAI_LIBRARY_CONFIG.sortDefs.find((s) => s.key === key);

describe("hentai library config", () => {
  it("filters by watch-status display group", () => {
    expect(filter("watchingStatus").match(ENTRIES[0], new Set(["Completed"]))).toBe(true);
    expect(filter("watchingStatus").match(ENTRIES[1], new Set(["Completed"]))).toBe(false);
  });

  it("filters by source material, offering only the values present", () => {
    expect(filter("sourceMaterial").deriveOptions(ENTRIES)).toEqual(["Manga", "Original"]);
    expect(filter("sourceMaterial").match(ENTRIES[1], new Set(["Original"]))).toBe(true);
    expect(filter("sourceMaterial").match(ENTRIES[0], new Set(["Original"]))).toBe(false);
  });

  it("sorts by the English name and newest release first", () => {
    const byTitle = [...ENTRIES].sort(sort("title").compare).map((e) => e.system_id);
    expect(byTitle).toEqual(["2", "1"]);
    const byRelease = [...ENTRIES].sort(sort("release_date").compare).map((e) => e.system_id);
    expect(byRelease).toEqual(["2", "1"]);
  });

  it("has a watch button and the watch plan flags, and no progress column", () => {
    const keys = HENTAI_LIBRARY_CONFIG.tableColumns.map((c) => c.key);
    expect(keys).toContain("watch");
    expect(keys).toContain("watch_next");
    expect(keys).toContain("to_rewatch");
    expect(keys).not.toContain("progress");
  });
});
