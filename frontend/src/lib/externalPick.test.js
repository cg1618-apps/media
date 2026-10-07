// Frontend: what a pick in an Add tab's external search writes into the form.
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  blankOnlyPatch,
  externalPickPatch,
  makeExternalPick,
  makeMalPick,
  makeTmdbPick,
  toIntId,
  toStringId,
} from "./externalPick";

const MAL_SPEC = {
  source: "MAL",
  idField: "mal_id",
  cast: toIntId,
  linkField: "mal_link",
  nameField: "anime_name_roman",
};

const FRIEREN = {
  external_id: "52991",
  link: "https://myanimelist.net/anime/52991",
  title: "Sousou no Frieren",
  title_alt: "Frieren: Beyond Journey's End",
};

/** Runs a pick handler against `form` through a setter, returning the result. */
function applyTo(form) {
  let state = form;
  const setter = (update) => {
    state = update(state);
  };
  return { setter, read: () => state };
}

describe("externalPickPatch", () => {
  it("writes an integer id, the link, and a blank name from the title", () => {
    const patch = externalPickPatch(
      { mal_id: "", mal_link: "", anime_name_roman: "" },
      FRIEREN,
      MAL_SPEC,
    );
    expect(patch).toEqual({
      mal_id: 52991,
      mal_link: "https://myanimelist.net/anime/52991",
      anime_name_roman: "Sousou no Frieren",
    });
  });

  it("overwrites the id and link but never a name the admin typed", () => {
    const patch = externalPickPatch(
      { mal_id: 1, mal_link: "https://old", anime_name_roman: "Frieren" },
      FRIEREN,
      MAL_SPEC,
    );
    expect(patch.mal_id).toBe(52991);
    expect(patch.mal_link).toBe(FRIEREN.link);
    expect(patch).not.toHaveProperty("anime_name_roman");
  });

  it("keeps a string id as a string (Open Library, IMDb)", () => {
    const patch = externalPickPatch(
      {},
      { external_id: "OL27448W", link: "https://openlibrary.org/works/OL27448W", title: "Dune" },
      { idField: "openlibrary_id", cast: toStringId, linkField: "openlibrary_link" },
    );
    expect(patch).toEqual({
      openlibrary_id: "OL27448W",
      openlibrary_link: "https://openlibrary.org/works/OL27448W",
    });
  });

  it("writes only the link when the form has no id field, and can name from title_alt", () => {
    const patch = externalPickPatch(
      { mal_link: "", name_jp: "" },
      { external_id: "185", link: "https://myanimelist.net/people/185", title: "Hanazawa, Kana", title_alt: "花澤香菜" },
      { linkField: "mal_link", nameField: "name_jp", nameOf: (r) => r.title_alt },
    );
    expect(patch).toEqual({ mal_link: "https://myanimelist.net/people/185", name_jp: "花澤香菜" });
  });

  it("casts an unparseable integer id to blank rather than NaN", () => {
    expect(toIntId("abc")).toBe("");
    expect(toIntId("119133")).toBe(119133);
  });
});

describe("makeExternalPick", () => {
  it("merges the patch and toasts which record it linked", () => {
    const showToast = vi.fn();
    const { setter, read } = applyTo({ mal_id: "", mal_link: "", anime_name_roman: "", other: 1 });

    makeExternalPick(setter, showToast, MAL_SPEC)(FRIEREN);

    expect(read()).toEqual({
      mal_id: 52991,
      mal_link: FRIEREN.link,
      anime_name_roman: "Sousou no Frieren",
      other: 1,
    });
    expect(showToast).toHaveBeenCalledWith("success", "Linked to MAL: Sousou no Frieren");
  });
});

describe("makeTmdbPick", () => {
  const MATRIX = {
    external_id: "movie/603",
    link: "https://www.themoviedb.org/movie/603",
    title: "The Matrix",
  };
  const resolveUrl = (ref) => `/api/movies/tmdb-imdb-id?ref=${encodeURIComponent(ref)}`;
  const blank = () => ({ imdb_id: "", imdb_link: "", movie_name_en: "" });

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("resolves the ref, then writes the IMDb id and link", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({ imdb_id: "tt0133093", imdb_link: "https://www.imdb.com/title/tt0133093/" }),
    });
    const showToast = vi.fn();
    const { setter, read } = applyTo(blank());

    await makeTmdbPick(setter, showToast, { resolveUrl, nameField: "movie_name_en" })(MATRIX);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/movies/tmdb-imdb-id?ref=movie%2F603",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(read()).toEqual({
      imdb_id: "tt0133093",
      imdb_link: "https://www.imdb.com/title/tt0133093/",
      movie_name_en: "The Matrix",
    });
    expect(showToast).toHaveBeenCalledWith("success", expect.stringMatching(/^Linked to TMDB: The Matrix/));
  });

  it("writes nothing on a 404 and shows its detail as an error", async () => {
    const detail = "TMDB has no IMDb id for movie/603. Enter the IMDb link by hand.";
    global.fetch.mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ detail }),
    });
    const showToast = vi.fn();
    const setter = vi.fn();

    await makeTmdbPick(setter, showToast, { resolveUrl, nameField: "movie_name_en" })(MATRIX);

    expect(setter).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith("error", detail);
  });

  it("writes nothing on a 502 and tells the admin to paste the link", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 502,
      json: () => Promise.resolve({ detail: "TMDB is unreachable." }),
    });
    const showToast = vi.fn();
    const setter = vi.fn();

    await makeTmdbPick(setter, showToast, { resolveUrl, nameField: "movie_name_en" })(MATRIX);

    expect(setter).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "TMDB is unreachable. Enter the IMDb link by hand.",
    );
  });
});

describe("blankOnlyPatch", () => {
  it("fills null, undefined, empty and whitespace fields, and nothing else", () => {
    const form = {
      a: null,
      b: undefined,
      c: "",
      d: "  ",
      typed: "Mine",
      zero: 0,
      status: "Not Yet Aired",
    };
    const prefill = {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      typed: "MAL's",
      zero: 12,
      status: "Finished Airing",
    };
    expect(blankOnlyPatch(form, prefill)).toEqual({ a: 1, b: 2, c: 3, d: 4, e: 5 });
  });

  it("never writes a blank prefill value", () => {
    expect(blankOnlyPatch({ a: "" }, { a: "  ", b: null })).toEqual({});
  });

  it("treats a field still at its default as unfilled, and a changed one as typed", () => {
    const defaults = { status: "Not Yet Aired", ep: 0, kept: "Default" };
    const form = { status: "Not Yet Aired", ep: 0, kept: "Changed" };
    const prefill = { status: "Finished Airing", ep: 28, kept: "MAL's" };
    expect(blankOnlyPatch(form, prefill, defaults)).toEqual({
      status: "Finished Airing",
      ep: 28,
    });
  });
});

describe("makeMalPick", () => {
  const prefillUrl = (id) => `/api/anime/mal-prefill/${id}`;
  const PREFILL = {
    anime_name_en: "Frieren: Beyond Journey's End",
    anime_name_jp: "葬送のフリーレン",
    ep_total: 28,
    studio: "Madhouse",
  };
  const blank = () => ({
    mal_id: "",
    mal_link: "",
    anime_name_roman: "",
    anime_name_en: "",
    anime_name_jp: "",
    ep_total: "",
    studio: "",
  });

  function answer(body, { ok = true, status = 200 } = {}) {
    global.fetch.mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  }

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("links at once, then fills only the fields still blank", async () => {
    answer(PREFILL);
    const showToast = vi.fn();
    const { setter, read } = applyTo({ ...blank(), studio: "Typed Studio" });

    await makeMalPick(setter, showToast, { nameField: "anime_name_roman", prefillUrl })(FRIEREN);

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/anime/mal-prefill/52991",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(read()).toEqual({
      mal_id: 52991,
      mal_link: FRIEREN.link,
      anime_name_roman: "Sousou no Frieren",
      anime_name_en: "Frieren: Beyond Journey's End",
      anime_name_jp: "葬送のフリーレン",
      ep_total: 28,
      studio: "Typed Studio",
    });
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Linked to MAL: Sousou no Frieren (3 fields filled)",
    );
  });

  it("drops a response that arrives after the admin picked again", async () => {
    let resolveFetch;
    global.fetch.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const showToast = vi.fn();
    const { setter, read } = applyTo(blank());

    const pending = makeMalPick(setter, showToast, {
      nameField: "anime_name_roman",
      prefillUrl,
    })(FRIEREN);
    // A second pick lands before the first one's details come back.
    setter((form) => ({ ...form, mal_id: 1, mal_link: "https://myanimelist.net/anime/1" }));
    resolveFetch({ ok: true, status: 200, json: () => Promise.resolve(PREFILL) });
    await pending;

    expect(read().mal_id).toBe(1);
    expect(read().anime_name_en).toBe("");
    expect(read().studio).toBe("");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("keeps the id and link when the details fail to load", async () => {
    answer({ detail: "MyAnimeList (Tenrai) is unreachable." }, { ok: false, status: 502 });
    const showToast = vi.fn();
    const { setter, read } = applyTo(blank());

    await makeMalPick(setter, showToast, { nameField: "anime_name_roman", prefillUrl })(FRIEREN);

    expect(read()).toEqual({
      ...blank(),
      mal_id: 52991,
      mal_link: FRIEREN.link,
      anime_name_roman: "Sousou no Frieren",
    });
    expect(showToast).toHaveBeenCalledWith(
      "error",
      "Linked to MAL: Sousou no Frieren, but its details could not be loaded. MyAnimeList (Tenrai) is unreachable.",
    );
  });

  it("says so when every field was already filled", async () => {
    answer({ studio: "Madhouse" });
    const showToast = vi.fn();
    const { setter } = applyTo({ ...blank(), studio: "Typed Studio" });

    await makeMalPick(setter, showToast, { nameField: "anime_name_roman", prefillUrl })(FRIEREN);

    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Linked to MAL: Sousou no Frieren (no blank field to fill)",
    );
  });
});
