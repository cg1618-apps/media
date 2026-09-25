import { describe, expect, it } from "vitest";

import {
  buildAnimePayload,
  buildCreditsPayload,
  creditsResponseToForm,
  gameFieldsPayload,
  hComicFieldsPayload,
  hGameFieldsPayload,
  hentaiFieldsPayload,
} from "./payloads";

describe("source rows in the payload", () => {
  it("drops rows with a blank name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "  ", url: "x" },
        { kind: "access", bucket: "other", name: "Keep", url: "y" },
      ],
    });
    expect(payload.sources).toEqual([
      { kind: "access", bucket: "other", name: "Keep", url: "y", available: null },
    ]);
  });

  it("keeps two rows that share a name", () => {
    const payload = buildAnimePayload({
      sources: [
        { kind: "access", bucket: "other", name: "Same", url: "a" },
        { kind: "access", bucket: "other", name: "Same", url: "b" },
      ],
    });
    expect(payload.sources).toHaveLength(2);
  });
});

// serialization_platform is a TAG_FIELD on manga AND novel (app/utils/
// credit_roles.py) and the novel response already exposes it, so the novel
// form has to be able to write it too - otherwise the field is readable and
// unwritable.
describe("novel serialization_platform", () => {
  it("is sent to the credits endpoint as a tag", () => {
    const payload = buildCreditsPayload("novel", {
      serialization_platform: "Kakuyomu, Narou",
    });
    expect(payload.tags.serialization_platform).toEqual(["Kakuyomu", "Narou"]);
  });

  it("comes back out of a credits response", () => {
    const form = creditsResponseToForm("novel", {
      tags: { serialization_platform: ["Kakuyomu"] },
    });
    expect(form.serialization_platform).toBe("Kakuyomu");
  });
});

// The publisher_tw / comic_publisher vocabularies are retired: every type's
// publisher field is now a `publisher` CREDIT resolving to a Publisher row,
// the way game's already was. A form still posting it as a tag writes to a
// vocabulary that no longer exists, which is a 422 on save.
describe("the publisher field posts a credit, not a tag", () => {
  it.each([
    ["anime", "distributor_tw"],
    // anime-movie shares anime's sheet header, distributor_tw, and got the
    // field for the first time in this migration.
    ["anime-movie", "distributor_tw"],
    ["manga", "publisher_tw"],
    ["novel", "publisher_tw"],
    ["comic", "publisher"],
  ])("sends %s's %s under the publisher role", (mediaType, field) => {
    const payload = buildCreditsPayload(mediaType, { [field]: "木棉花, 東立" });
    expect(payload.credits.publisher).toEqual(["木棉花", "東立"]);
    expect(payload.tags.publisher_tw).toBeUndefined();
    expect(payload.tags.comic_publisher).toBeUndefined();
  });

  it.each([
    ["anime", "distributor_tw"],
    ["anime-movie", "distributor_tw"],
    ["manga", "publisher_tw"],
    ["novel", "publisher_tw"],
    ["comic", "publisher"],
  ])("reads %s's %s back out of the credits half", (mediaType, field) => {
    const form = creditsResponseToForm(mediaType, {
      credits: { publisher: ["木棉花"] },
    });
    expect(form[field]).toBe("木棉花");
  });

  // Comic carried BOTH vocabularies; only one publisher field survives.
  it("leaves comic with no publisher_tw field at all", () => {
    const form = creditsResponseToForm("comic", { credits: {}, tags: {} });
    expect(form).not.toHaveProperty("publisher_tw");
  });
});

// The IGDB numeric id is Fill's only handle on a game, and the public
// www.igdb.com link the picker stores carries a slug rather than the id - so
// the id the admin picked has to travel in the payload of its own accord.
describe("game igdb_id", () => {
  it("is sent alongside the link", () => {
    const payload = gameFieldsPayload({
      igdb_id: "119133",
      igdb_link: "https://www.igdb.com/games/elden-ring",
    });
    expect(payload.igdb_id).toBe(119133);
    expect(payload.igdb_link).toBe("https://www.igdb.com/games/elden-ring");
  });

  it("is null when the form never got one", () => {
    expect(gameFieldsPayload({ igdb_id: "" }).igdb_id).toBeNull();
  });
});

// The Steam appid is typed in beside the store link, so a game IGDB has no
// external_games row for can still be identified by hand.
describe("game steam_appid", () => {
  it("is sent alongside the link", () => {
    const payload = gameFieldsPayload({
      steam_appid: "1245620",
      steam_link: "https://store.steampowered.com/app/1245620/",
    });
    expect(payload.steam_appid).toBe(1245620);
    expect(payload.steam_link).toBe(
      "https://store.steampowered.com/app/1245620/",
    );
  });

  it("is null when the form never got one", () => {
    expect(gameFieldsPayload({ steam_appid: "" }).steam_appid).toBeNull();
  });
});

// The three completion axes carry a vocabulary, not a boolean: "" is still
// "unknown", and "Inapplicable" says the game has none to find.
describe("game completion flags", () => {
  it("sends all three as vocabulary strings", () => {
    const payload = gameFieldsPayload({
      all_endings: "Yes",
      all_achievements: "No",
      all_collected: "Inapplicable",
    });
    expect(payload.all_endings).toBe("Yes");
    expect(payload.all_achievements).toBe("No");
    expect(payload.all_collected).toBe("Inapplicable");
  });

  it("sends an unanswered axis as null, not as a No", () => {
    const payload = gameFieldsPayload({ all_endings: "" });
    expect(payload.all_endings).toBeNull();
  });
});

// Not a completion flag: this one decides whether Steam may write playtime
// and achievements earned over what is already there.
describe("steam progress sync", () => {
  it("sends the lock as a tristate boolean", () => {
    expect(gameFieldsPayload({ steam_progress_sync: "false" }).steam_progress_sync).toBe(false);
    expect(gameFieldsPayload({ steam_progress_sync: "true" }).steam_progress_sync).toBe(true);
    expect(gameFieldsPayload({ steam_progress_sync: "" }).steam_progress_sync).toBeNull();
  });
});

describe("h-comic payloads", () => {
  it("sends each credit and tag under its own key", () => {
    const body = buildCreditsPayload("h-comic", {
      illustrator: "A, B",
      author: "",
      club: "Circle",
      original_source: "Toomics",
      h_genre_plot: "x",
      h_genre_appearance: undefined,
      h_genre_relation: "y, z",
    });
    expect(body.credits).toEqual({ illustrator: ["A", "B"], author: [], club: ["Circle"] });
    expect(body.tags).toEqual({
      original_source: ["Toomics"],
      h_genre_plot: ["x"],
      h_genre_relation: ["y", "z"],
    });
  });

  it("builds the entry body without the group order the detail page owns", () => {
    const body = hComicFieldsPayload({
      region: "KR",
      h_comic_name_en: "T",
      ch_total: "12",
      ch_behind: "",
      page_fin: "",
      reading_status: "",
      sources: [{ name: " Site ", url: "" }],
    });
    expect(body.region).toBe("KR");
    expect(body.ch_total).toBe(12);
    expect(body.ch_behind).toBeNull();
    expect(body.page_fin).toBe(0);
    expect(body.reading_status).toBe("Might Read");
    expect(body.sources).toEqual([
      { kind: "access", bucket: "other", name: "Site", url: null, available: null },
    ]);
    expect("highlight_group_order" in body).toBe(false);
  });
});

describe("h-game payloads", () => {
  it("sends the developer credit and the five tag fields under their own keys", () => {
    const body = buildCreditsPayload("h-game", {
      studio: "Studio A",
      game_genre: "RPG, Puzzle",
      game_theme: "",
      h_genre_plot: "x",
      h_genre_appearance: undefined,
      h_genre_relation: "y",
      // Game-only fields an h-game form never holds are not read.
      publisher: "P",
      director: "D",
    });
    expect(body.credits).toEqual({ studio: ["Studio A"] });
    expect(body.tags).toEqual({
      game_genre: ["RPG", "Puzzle"],
      game_theme: [],
      h_genre_plot: ["x"],
      h_genre_relation: ["y"],
    });
  });

  it("keeps an unrecorded list null and an empty one []", () => {
    const body = hGameFieldsPayload({
      audio_availability: null,
      h_presentation: [],
      platform: undefined,
    });
    expect(body.audio_availability).toBeNull();
    expect(body.h_presentation).toEqual([]);
    expect(body.platform).toBeNull();
  });

  it("sends a list in vocabulary order", () => {
    const body = hGameFieldsPayload({
      platform: ["Other", "Steam"],
      h_presentation: ["互動", "靜圖"],
      audio_availability: ["H場景", "一般對話"],
    });
    expect(body.platform).toEqual(["Steam", "Other"]);
    expect(body.h_presentation).toEqual(["靜圖", "互動"]);
    expect(body.audio_availability).toEqual(["一般對話", "H場景"]);
  });

  it("builds the entry body in h_game's columns, not game's", () => {
    const body = hGameFieldsPayload({
      h_game_name_cn: "名",
      playstyle: "ADV",
      game_type: "Base Game",
      base_game_id: "some-id",
      all_cg: "Yes",
      animation_availability: "false",
      steam_progress_sync: "",
      language_availability: "官方中文",
      usefulness: "實用",
      achievements_total: "40",
      dlsite_link_jp: "https://www.dlsite.com/x",
      dlsite_link_tw: "",
      copies: [{ storefront: "DLsite", price_paid: "12.5" }, {}],
    });
    expect(body.h_game_name_cn).toBe("名");
    expect(body.playstyle).toBe("ADV");
    // ck_h_game_base_no_parent: a Base Game carries no parent.
    expect(body.base_game_id).toBeNull();
    expect(body.all_cg).toBe("Yes");
    expect(body.animation_availability).toBe(false);
    expect(body.steam_progress_sync).toBeNull();
    expect(body.language_availability).toBe("官方中文");
    expect(body.usefulness).toBe("實用");
    expect(body.achievements_total).toBe(40);
    expect(body.dlsite_link_jp).toBe("https://www.dlsite.com/x");
    expect(body.dlsite_link_tw).toBeNull();
    expect(body.playing_status).toBe("Might Play");
    // The purchase records are Game's: an empty row is dropped.
    expect(body.copies).toHaveLength(1);
    expect(body.copies[0]).toMatchObject({ storefront: "DLsite", price_paid: 12.5, position: 1 });
    for (const gameOnly of [
      "hours_played",
      "metacritic_score",
      "all_achievements",
      "all_collected",
      "game_name_cn",
      "highlight_group_order",
    ]) {
      expect(gameOnly in body).toBe(false);
    }
  });
});

// An h-comic's animation status is derived while a hentai adapts it, and the
// server refuses (422) a different value then - so the form leaves it out.
describe("h-comic animation_status", () => {
  it("is sent while it is hand-set", () => {
    const body = hComicFieldsPayload({
      region: "JP",
      animation_status: "Announced",
      animation_status_source: "manual",
    });
    expect(body.animation_status).toBe("Announced");
  });

  it("is left out while it is derived", () => {
    const body = hComicFieldsPayload({
      region: "JP",
      animation_status: "Animated",
      animation_status_source: "derived",
    });
    expect("animation_status" in body).toBe(false);
  });
});

describe("hentai", () => {
  it("sends studio and director as credits and the three genres as tags", () => {
    const payload = buildCreditsPayload("hentai", {
      studio: "Pink Pineapple",
      director: "A, B",
      h_genre_plot: "X",
      h_genre_appearance: "",
      h_genre_relation: "Y, Z",
    });
    expect(payload.credits).toEqual({ studio: ["Pink Pineapple"], director: ["A", "B"] });
    expect(payload.tags).toEqual({
      h_genre_plot: ["X"],
      h_genre_appearance: [],
      h_genre_relation: ["Y", "Z"],
    });
  });

  it("reads the same fields back out of a credits response", () => {
    const form = creditsResponseToForm("hentai", {
      credits: { studio: ["S"], director: [] },
      tags: { h_genre_plot: ["P"] },
    });
    expect(form).toEqual({
      studio: "S",
      director: "",
      h_genre_plot: "P",
      h_genre_appearance: "",
      h_genre_relation: "",
    });
  });

  it("builds the entry body with no episode progress", () => {
    const body = hentaiFieldsPayload({
      hentai_name_cn: "C",
      series_number: "2",
      watching_status: "",
      mal_link: "https://myanimelist.net/anime/1/x",
      mal_id: "1",
      sources: [{ name: " Site ", url: "" }],
    });
    expect(body.hentai_name_cn).toBe("C");
    expect(body.series_number).toBe(2);
    expect(body.watching_status).toBe("Might Watch");
    expect(body.mal_id).toBe(1);
    expect(body.sources).toEqual([
      { kind: "access", bucket: "other", name: "Site", url: null, available: null },
    ]);
    for (const key of ["ep_total", "ep_fin", "reading_status"]) {
      expect(key in body).toBe(false);
    }
  });

  it("clears the MAL id with the link it is derived from", () => {
    const body = hentaiFieldsPayload({ mal_link: "", mal_id: "5" });
    expect(body.mal_link).toBeNull();
    expect(body.mal_id).toBeNull();
  });
});
