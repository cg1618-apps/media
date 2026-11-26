import { describe, it, expect, afterEach } from "vitest";
import {
  AIRING_STATUSES,
  ANIME_MOVIE_RELEASE_TYPES,
  CONSTANTS_FALLBACK,
  FILM_RELEASE_STATUSES,
  GAME_RELEASE_STATUSES,
  WATCHING_STATUSES,
  watchingStatusesFor,
  FRANCHISE_TYPES,
  CHARACTER_ROLES,
  GENDERS,
  PERSON_GENDERS,
  CONTENT_RATINGS,
  contentRatingLabel,
  contentRatingsVisibleIn,
  castRoleRank,
  MEDIA_TYPES,
  COMMON_OPTION_CATEGORIES,
  OPTION_CATEGORIES,
  PERSON_ROLES,
  PROGRESS_DISPLAY_OPTIONS,
  applyConstants,
  withLegacyProgressDisplay,
} from "./fieldOptions";
import {
  COMMON_FIELD_META,
  PERSON_SOURCES,
  TYPE_FIELD_META,
} from "./formFields/fieldMeta";

// applyConstants mutates AIRING_STATUSES (and the other bundled arrays) IN
// PLACE, so capture the true original contents once, before any test runs,
// and restore them after each test — otherwise later tests (and any other
// test file that happens to import fieldOptions.js in the same worker)
// would see whatever the last test here left behind.
const ORIGINAL_AIRING_STATUSES = [...AIRING_STATUSES];
const ORIGINAL_WATCHING_STATUSES = [...WATCHING_STATUSES];
const ORIGINAL_PERSON_ROLES = [...PERSON_ROLES];
const ORIGINAL_OPTION_CATEGORIES = [...OPTION_CATEGORIES];
afterEach(() => {
  applyConstants({
    airing_status: ORIGINAL_AIRING_STATUSES,
    watching_status: ORIGINAL_WATCHING_STATUSES,
    person_role: ORIGINAL_PERSON_ROLES,
    option_categories: ORIGINAL_OPTION_CATEGORIES,
  });
});

// applyConstants is how /api/constants becomes the source of truth for
// every Add/Modify tab: it must overwrite the bundled arrays IN PLACE
// (never reassign the binding), since every tab imported a reference to
// the same array object. See config/useConstants.js.
describe("applyConstants", () => {
  it("mutates a bundled array's contents in place, not its binding", () => {
    const before = AIRING_STATUSES;
    applyConstants({ airing_status: ["Only From API"] });
    expect(AIRING_STATUSES).toBe(before); // same array reference
    expect(AIRING_STATUSES).toEqual(["Only From API"]);
  });

  it("leaves an array untouched when its key is absent from the payload", () => {
    const before = [...AIRING_STATUSES];
    applyConstants({ some_other_key: ["x"] });
    expect(AIRING_STATUSES).toEqual(before);
  });

  it("ignores a null/undefined payload", () => {
    const before = [...AIRING_STATUSES];
    applyConstants(null);
    applyConstants(undefined);
    expect(AIRING_STATUSES).toEqual(before);
  });
});

describe("release vocabularies", () => {
  it("has no Rumored on the airing types, nor on games", () => {
    expect(AIRING_STATUSES).toEqual(["Not Yet Aired", "Airing", "Finished Airing", "Canceled"]);
    expect(GAME_RELEASE_STATUSES).not.toContain("Rumored");
  });

  it("serves the films' release status and the anime movie release type", () => {
    expect(CONSTANTS_FALLBACK.film_release_status).toBe(FILM_RELEASE_STATUSES);
    expect(FILM_RELEASE_STATUSES).toEqual(["Not Released", "Released", "Canceled"]);
    expect(CONSTANTS_FALLBACK.anime_movie_release_type).toBe(ANIME_MOVIE_RELEASE_TYPES);
    expect(ANIME_MOVIE_RELEASE_TYPES).toEqual(["Cinema", "ONA"]);
  });
});

describe("watchingStatusesFor", () => {
  it.each(["movie", "anime-movie"])("offers %s Watch When Released, not Watch When Airs", (type) => {
    const list = watchingStatusesFor(type);
    expect(list).toContain("Watch When Released");
    expect(list).not.toContain("Watch When Airs");
    expect(list.indexOf("Watch When Released")).toBe(list.indexOf("Plan to Watch") + 1);
  });

  it.each(["anime", "tv-show", "cartoon", "hentai"])(
    "offers %s Watch When Airs, never Watch When Released",
    (type) => {
      const list = watchingStatusesFor(type);
      expect(list).toContain("Watch When Airs");
      expect(list).not.toContain("Watch When Released");
    },
  );

  it("follows /api/constants, keeping its array identity", () => {
    const before = watchingStatusesFor("movie");
    applyConstants({ watching_status: ["Might Watch", "Watch When Airs", "Watch When Released", "New"] });
    expect(watchingStatusesFor("movie")).toBe(before);
    expect(before).toEqual(["Might Watch", "Watch When Released", "New"]);
    expect(watchingStatusesFor("anime")).toEqual(["Might Watch", "Watch When Airs", "New"]);
  });
});

describe("film fields on the /defaults page", () => {
  const meta = (type, key) => ({ ...COMMON_FIELD_META[key], ...TYPE_FIELD_META[type][key] });

  it("offers each type its own watching list", () => {
    expect(meta("movie", "watching_status").options).toContain("Watch When Released");
    expect(meta("anime-movie", "watching_status").options).not.toContain("Watch When Airs");
    expect(meta("anime", "watching_status").options).not.toContain("Watch When Released");
  });

  it("gives both films a Release Status and the anime movie a Release Type", () => {
    for (const type of ["movie", "anime-movie"]) {
      expect(meta(type, "release_status").label).toBe("Release Status");
      expect(meta(type, "release_status").options).toBe(FILM_RELEASE_STATUSES);
    }
    expect(meta("anime-movie", "release_type").options).toBe(ANIME_MOVIE_RELEASE_TYPES);
    // A game's release_status is its own vocabulary.
    expect(meta("game", "release_status").options).toBe(GAME_RELEASE_STATUSES);
  });

  it("labels movie's original_source Exclusive Source, and no other type's", () => {
    expect(meta("movie", "original_source").label).toBe("Exclusive Source");
    for (const type of ["tv-show", "cartoon"]) {
      expect(meta(type, "original_source").label).toBe("Original Source");
    }
  });
});

// PERSON_ROLES used to be a hand-written literal inside OptionsAddTab.jsx,
// with nothing enforcing the match against app/utils/credit_roles.py. It is
// served by GET /api/constants now, so it must be wired into applyConstants
// like every other Tier 1 enum — otherwise the bundle is silently the only
// source again and the whole change is cosmetic.
describe("admin-form vocabularies served from /api/constants", () => {
  it("exposes person_role and media_type to applyConstants", () => {
    expect(CONSTANTS_FALLBACK.person_role).toBe(PERSON_ROLES);
    expect(CONSTANTS_FALLBACK.media_type).toBe(MEDIA_TYPES);
  });

  it("updates PERSON_ROLES in place from the API payload", () => {
    const before = PERSON_ROLES;
    applyConstants({ person_role: ["director", "sound_director"] });
    expect(PERSON_ROLES).toBe(before);
    expect(PERSON_ROLES).toEqual(["director", "sound_director"]);
  });

  it("carries the h-game type, its franchise type and its vocabularies", () => {
    expect(MEDIA_TYPES).toContain("h-game");
    expect(FRANCHISE_TYPES).toContain("H-Game");
    for (const key of [
      "h_game_playstyle",
      "h_game_language_availability",
      "h_game_audio_availability",
      "h_game_h_presentation",
      "h_game_art_style",
      "h_game_h_art_style",
      "h_game_platform",
    ]) {
      expect(CONSTANTS_FALLBACK[key], key).toBeDefined();
    }
    expect(CONSTANTS_FALLBACK.h_game_platform).toEqual(["Steam", "DLsite", "Nintendo", "Other"]);
  });

  it("carries the book vocabularies under the book_* keys", () => {
    expect(CONSTANTS_FALLBACK.book_type).toEqual([
      "小說", "輕小說", "網路小說", "短篇集", "指南/設定集", "其他",
    ]);
    expect(CONSTANTS_FALLBACK.book_region).toEqual(["歐美", "日本", "中國", "韓國", "台灣"]);
    expect(CONSTANTS_FALLBACK.book_serialization_status).toBeDefined();
    expect(FRANCHISE_TYPES).toContain("Book");
    expect(MEDIA_TYPES).toContain("book");
  });

  it("carries the game copy and completion vocabularies", () => {
    expect(CONSTANTS_FALLBACK.game_storefront).toContain("Physical Store");
    expect(CONSTANTS_FALLBACK.game_storefront).not.toContain("Physical");
    expect(CONSTANTS_FALLBACK.game_ownership).not.toContain("Free");
    expect(CONSTANTS_FALLBACK.game_acquisition).toContain("Free");
    expect(CONSTANTS_FALLBACK.game_copy_format).toEqual(["Digital", "Physical", "Key Card"]);
    expect(CONSTANTS_FALLBACK.game_completion_flag).toEqual(["Yes", "No", "Inapplicable"]);
    expect(CONSTANTS_FALLBACK.game_achievement_flag).toEqual([
      "Fully",
      "Yes",
      "No",
      "Inapplicable",
    ]);
  });

  it("carries the game-only is_main vocabulary beside the shared one", () => {
    expect(CONSTANTS_FALLBACK.game_is_main).toEqual(["Main", "Remake", "Remaster"]);
    expect(CONSTANTS_FALLBACK.is_main).toEqual(["本傳", "外傳", "前傳", "後傳", "總集篇"]);
  });

  it("uses the hyphenated media type keys, not person-role scopes", () => {
    expect(MEDIA_TYPES).toContain("anime-movie");
    expect(MEDIA_TYPES).toContain("tv-show");
    expect(MEDIA_TYPES).not.toContain("non_anime");
  });
});

// A category with no values yet exists only in TAG_FIELDS, so the Options
// form cannot learn it from the stored options; the declared list is what
// makes it pickable before its first value exists.
describe("declared option categories", () => {
  it("is wired into applyConstants like every other Tier 1 list", () => {
    expect(CONSTANTS_FALLBACK.option_categories).toBe(OPTION_CATEGORIES);
  });

  it("offers a category that has no options stored against it", () => {
    expect(OPTION_CATEGORIES).toContain("Combat Mode");
  });

  it("declares the common option categories, empty ones included", () => {
    // Geography Group, Weapon & Gear Type and Enemy Tier are seeded with no
    // values, so only this list offers them on Add before a first value
    // exists.
    expect(CONSTANTS_FALLBACK.common_option_categories).toBe(COMMON_OPTION_CATEGORIES);
    expect(CONSTANTS_FALLBACK).not.toHaveProperty("note_suggestion_categories");
    for (const c of COMMON_OPTION_CATEGORIES) expect(OPTION_CATEGORIES).toContain(c);
    for (const c of [
      "Geography Group",
      "Weapon & Gear Type",
      "Enemy Tier",
      "Song Type",
      "Song Source",
      "Needs Work Note",
      "Country",
    ]) {
      expect(COMMON_OPTION_CATEGORIES).toContain(c);
    }
  });

  it("updates in place from the API payload", () => {
    const before = OPTION_CATEGORIES;
    applyConstants({ option_categories: ["Genre Main", "Label"] });
    expect(OPTION_CATEGORIES).toBe(before);
    expect(OPTION_CATEGORIES).toEqual(["Genre Main", "Label"]);
  });
});

// Every person-sourced dropdown queries /api/person?role=&scope=. person_role
// rows are all scoped now, so a descriptor missing either half matches nobody
// and the field silently offers an empty list - the failure this block exists
// to catch, since nothing else in the app reads these strings until a user
// opens the form.
// Mirrors CREDIT_ROLES in app/utils/credit_roles.py.
const LEGAL = {
  director: ["anime", "anime-movie", "movie", "game", "hentai"],
  producer: ["anime"],
  composer: ["anime", "game"],
  author: ["manga", "book", "comic", "h-comic", "hentai"],
  illustrator: ["manga", "book", "comic", "h-comic"],
  club: ["h-comic"],
};

function everyMeta() {
  return [COMMON_FIELD_META, ...Object.values(TYPE_FIELD_META)].flatMap((g) =>
    Object.values(g),
  );
}

describe("person field sources", () => {
  it("every person source names a role and a scope", () => {
    for (const meta of everyMeta()) {
      if (meta.source?.kind !== "person") continue;
      expect(meta.source.role, JSON.stringify(meta.source)).toBeTruthy();
      expect(meta.source.scope, JSON.stringify(meta.source)).toBeTruthy();
    }
  });

  it("every scope is legal for its role", () => {
    for (const meta of everyMeta()) {
      if (meta.source?.kind !== "person") continue;
      expect(LEGAL[meta.source.role]).toContain(meta.source.scope);
    }
  });

  it("no retired role key survives", () => {
    const retired = [
      "manga_author",
      "novel_author",
      "novel_illustrator",
      "comic_writer",
      "comic_artist",
      "non_anime",
    ];
    const json = JSON.stringify([COMMON_FIELD_META, TYPE_FIELD_META]);
    for (const key of retired) expect(json).not.toContain(`"${key}"`);
  });

  it("asks for eighteen distinct role/scope pairs", () => {
    // Eleven before games; director|game and composer|game are the two the
    // ninth media type adds, illustrator, author and club the three the
    // gated h-comic type adds, and director|hentai and author|hentai the two
    // hentai adds.
    // H-game adds none: its one credit, the developer, is a studio row, not
    // a person.
    const keys = PERSON_SOURCES.map((s) => `${s.role}|${s.scope}`);
    expect(new Set(keys).size).toBe(18);
    expect(keys).toHaveLength(18);
    expect(keys).toContain("director|hentai");
    expect(keys).toContain("author|hentai");
    expect(keys).toContain("director|game");
    expect(keys).toContain("composer|game");
    expect(keys).toContain("illustrator|h-comic");
    expect(keys).toContain("author|h-comic");
    expect(keys).toContain("club|h-comic");
  });
});

// Superseded: this list used to be narrowed to {"", "vol_tw"} on the grounds
// that type alone determined structure. Per-type option lists replaced that —
// per-entry selects now build their own via progressDisplayOptions(book), and
// what survives here is the full vocabulary for the Form Defaults page, which
// spans every book type at once.
describe("PROGRESS_DISPLAY_OPTIONS (Form Defaults vocabulary)", () => {
  it("carries every progress display a book can store", () => {
    expect(PROGRESS_DISPLAY_OPTIONS.map((o) => o.value)).toEqual([
      "",
      "vol_original",
      "vol_tw",
      "ch",
      "arc",
      "arc_ch",
    ]);
  });

  it("labels every option", () => {
    for (const o of PROGRESS_DISPLAY_OPTIONS) expect(o.label).toBeTruthy();
  });
});

describe("withLegacyProgressDisplay", () => {
  // The options it is handed are now per-entry, so the interesting case is a
  // value the entry's own type does not offer - a light novel still holding
  // "ch", a web novel still holding "vol_tw".
  const options = [
    { value: "", label: "- Default -" },
    { value: "vol_tw", label: "VOL TW" },
  ];

  it("returns the given list unchanged when there is no stored value", () => {
    expect(withLegacyProgressDisplay(options, null)).toBe(options);
    expect(withLegacyProgressDisplay(options, "")).toBe(options);
  });

  it("returns the given list unchanged when the stored value is offered", () => {
    expect(withLegacyProgressDisplay(options, "vol_tw")).toBe(options);
  });

  it("appends a stored value the list does not offer, so it renders as selected", () => {
    const withLegacy = withLegacyProgressDisplay(options, "arc_ch");
    expect(withLegacy).toHaveLength(options.length + 1);
    expect(withLegacy.find((o) => o.value === "arc_ch")).toBeTruthy();
    // The list it was handed is untouched.
    expect(options.map((o) => o.value)).toEqual(["", "vol_tw"]);
  });
});

describe("gender", () => {
  it("is wired into applyConstants under /api/constants' gender key", () => {
    expect(CONSTANTS_FALLBACK.gender).toBe(GENDERS);
    expect(GENDERS).toEqual(["男", "女", "中性/無性", "雙性混和", "其他"]);
  });

  it("is narrower for a person, under person_gender", () => {
    expect(CONSTANTS_FALLBACK.person_gender).toBe(PERSON_GENDERS);
    expect(PERSON_GENDERS).toEqual(["男", "女"]);
  });
});

describe("content rating", () => {
  it("is wired into applyConstants under content_rating, narrowest first", () => {
    expect(CONSTANTS_FALLBACK.content_rating).toBe(CONTENT_RATINGS);
    expect(CONTENT_RATINGS).toEqual(["normal", "borderline", "unrestricted"]);
  });

  it("labels each rating, with an unset one reading as Normal", () => {
    expect(CONTENT_RATINGS.map(contentRatingLabel)).toEqual([
      "Normal", "Borderline (15+)", "Unrestricted (18+)",
    ]);
    expect(contentRatingLabel(null)).toBe("Normal");
  });

  it("reaches every rating up to the active mode's", () => {
    expect(contentRatingsVisibleIn("safe")).toEqual(["normal"]);
    expect(contentRatingsVisibleIn("normal")).toEqual(["normal"]);
    expect(contentRatingsVisibleIn("borderline")).toEqual(["normal", "borderline"]);
    expect(contentRatingsVisibleIn("unrestricted")).toEqual(CONTENT_RATINGS);
    expect(contentRatingsVisibleIn(undefined)).toEqual(["normal"]);
  });
});

describe("character roles", () => {
  it("are wired into applyConstants under character_role, in rank order", () => {
    expect(CONSTANTS_FALLBACK.character_role).toBe(CHARACTER_ROLES);
    expect(CHARACTER_ROLES).toEqual(["Main", "Core", "Important Supporting", "Supporting", "Other"]);
  });

  it("rank a cast row by that order, with no role or an unknown one last", () => {
    expect(["Other", null, "Main", "Supporting", "Important Supporting", "Core", "Extra"]
      .sort((a, b) => castRoleRank(a) - castRoleRank(b))
      .slice(0, 5)).toEqual(["Main", "Core", "Important Supporting", "Supporting", "Other"]);
    expect(castRoleRank(null)).toBe(CHARACTER_ROLES.length);
  });
});

