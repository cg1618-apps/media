import { describe, expect, it } from "vitest";
import {
  UNRECORDED,
  completedEntries,
  completionDetails,
  completionGroups,
  recentCompletions,
} from "./completionGroups";

const watched = (system_id, franchise_id, completed_at = "2026-10-01") => ({
  system_id,
  franchise_id,
  watching_status: "Completed",
  completed_at,
});

// Each studio group has a member, so Individual leading is the order's doing
// and not the only group present.
const FRANCHISES = {
  ind: { system_id: "ind", franchise_name_en: "Individual Movie", franchise_name_cn: "獨立電影" },
  indTv: { system_id: "indTv", franchise_name_en: "Individual TV Show", franchise_name_cn: "獨立影集" },
  dis: { system_id: "dis", franchise_name_en: "Disney Classics" },
  mar: { system_id: "mar", franchise_name_en: "Marvel Cinematic Universe" },
  other: { system_id: "other", franchise_name_en: "Something Else" },
};

const keys = (groups) => groups.map((g) => g.key);

describe("completionGroups - movie and TV show", () => {
  it("leads the movie tab with the Individual Movie franchise", () => {
    const groups = completionGroups(
      "movie",
      [watched("o", "other"), watched("m", "mar"), watched("d", "dis"), watched("i", "ind")],
      FRANCHISES,
    );
    expect(keys(groups)).toEqual(["individual", "disney", "marvel", "others"]);
    expect(groups[0].label).toBe("獨立電影");
    expect(groups[0].items.map((e) => e.system_id)).toEqual(["i"]);
  });

  it("leads the TV show tab with the Individual TV Show franchise, not Individual Movie", () => {
    const groups = completionGroups(
      "tv-show",
      [watched("d", "dis"), watched("t", "indTv"), watched("m", "ind")],
      FRANCHISES,
    );
    expect(keys(groups)).toEqual(["individual", "disney", "others"]);
    expect(groups[0].label).toBe("獨立影集");
    expect(groups[0].items.map((e) => e.system_id)).toEqual(["t"]);
  });
});

describe("completionGroups - book", () => {
  it("groups every book by type in the vocabulary's order, an untyped one last", () => {
    const read = (system_id, type) => ({
      system_id,
      type,
      reading_status: "Completed",
      completed_at: "2026-10-01",
    });
    const groups = completionGroups("book", [
      read("x", "其他"),
      read("u", null),
      read("ln", "輕小說"),
      read("n", "小說"),
      read("g", "指南/設定集"),
    ]);
    expect(keys(groups)).toEqual(["小說", "輕小說", "指南/設定集", "其他", UNRECORDED]);
  });
});

describe("completedEntries", () => {
  it("keeps the completed ones with a date, newest first", () => {
    const list = completedEntries("game", [
      { system_id: "old", playing_status: "Completed", completed_at: "2026-01-01" },
      { system_id: "new", playing_status: "Completed", completed_at: "2026-09-01" },
      { system_id: "undated", playing_status: "Completed", completed_at: null },
      { system_id: "playing", playing_status: "Playing", completed_at: "2026-10-01" },
    ]);
    expect(list.map((g) => g.system_id)).toEqual(["new", "old"]);
  });
});

describe("completionDetails", () => {
  it.each([
    ["anime", { airing_type: "ONA" }, ["ONA"]],
    ["tv-show", { airing_type: "Special" }, ["Special"]],
    ["cartoon", { airing_type: "Movie" }, ["Movie"]],
    ["manga", { region: "韓漫" }, ["韓漫"]],
    ["book", { type: "輕小說", region: "日本" }, ["輕小說"]],
    ["game", { hours_played: 42.5 }, ["42.5 h"]],
    ["game", { hours_played: 0 }, ["0 h"]],
    ["h-comic", { region: "KR", usefulness: "實用" }, ["KR", "實用"]],
    ["h-game", { usefulness: "實用" }, ["實用"]],
    ["hentai", { usefulness: "實用" }, ["實用"]],
    ["movie", { airing_type: "TV" }, []],
    ["anime", { airing_type: null }, []],
  ])("%s %j shows %j", (type, entry, expected) => {
    expect(completionDetails(type, entry)).toEqual(expected);
  });
});

describe("recentCompletions", () => {
  it("mixes the types newest first, each row carrying its type", () => {
    const rows = recentCompletions([
      { type: "anime", entries: [watched("a", null, "2026-10-02")] },
      {
        type: "book",
        entries: [
          { system_id: "b", reading_status: "Completed", completed_at: "2026-10-03" },
          { system_id: "c", reading_status: "Active Reading", completed_at: "2026-10-04" },
        ],
      },
    ]);
    expect(rows.map(({ type, entry }) => `${type}:${entry.system_id}`)).toEqual([
      "book:b",
      "anime:a",
    ]);
  });
});
