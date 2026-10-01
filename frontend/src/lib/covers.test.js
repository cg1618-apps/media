// Frontend: unit tests for cover URL resolution.
/**
 * Cover files are stored under owner-typed subfolders
 * (`static/covers/<media_type>/<system_id>.jpg`), and the DB columns hold the
 * full key. These tests pin the two consequences: a stored key is passed
 * through untouched, and the "convention filename" fallback must know the
 * media type or give up.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_SVG,
  NO_COVER,
  focusStyle,
  formatFocus,
  parseFocus,
  getCollectionCover,
  getCoverUrl,
  getFranchiseCover,
  getSeriesCover,
} from "./covers";

/** Pretend the page is served from production rather than the dev server. */
function useRemoteHost() {
  vi.stubGlobal("location", { hostname: "cg1618.app" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getCoverUrl", () => {
  it("passes a full owner-typed key through unchanged on localhost", () => {
    expect(getCoverUrl("anime/abc123.jpg")).toBe(
      "/api/covers/anime/abc123.jpg",
    );
  });

  it("builds the same /api/covers URL off localhost as on it", () => {
    useRemoteHost();
    expect(getCoverUrl("anime-movie/abc123.jpg")).toBe(
      "/api/covers/anime-movie/abc123.jpg",
    );
  });

  it("returns the placeholder for a missing or N/A file", () => {
    expect(getCoverUrl("")).toBe(FALLBACK_SVG);
    expect(getCoverUrl("N/A")).toBe(FALLBACK_SVG);
  });
});

describe("focusStyle", () => {
  it("turns a focus into an object-position style", () => {
    expect(focusStyle("30% 15%")).toEqual({ objectPosition: "30% 15%" });
  });

  it("returns undefined for a centred image, so no style is written", () => {
    expect(focusStyle(null)).toBeUndefined();
    expect(focusStyle(undefined)).toBeUndefined();
    expect(focusStyle("")).toBeUndefined();
  });
});

describe("parseFocus / formatFocus", () => {
  it("round-trips a stored focus", () => {
    expect(parseFocus("30% 15%")).toEqual({ x: 30, y: 15 });
    expect(formatFocus({ x: 30, y: 15 })).toBe("30% 15%");
  });

  it("reads null, empty and malformed values as the centre", () => {
    for (const v of [null, undefined, "", "left top", "30%"]) {
      expect(parseFocus(v)).toEqual({ x: 50, y: 50 });
    }
  });

  it("stores the centre as null", () => {
    expect(formatFocus({ x: 50, y: 50 })).toBeNull();
    expect(formatFocus({ x: 49.6, y: 50.2 })).toBeNull();
  });

  it("clamps to whole percentages between 0 and 100", () => {
    expect(formatFocus({ x: -12, y: 140 })).toBe("0% 100%");
    expect(formatFocus({ x: 33.4, y: 66.6 })).toBe("33% 67%");
    expect(parseFocus("150% 0%")).toEqual({ x: 100, y: 0 });
  });
});

describe("a borrowed cover carries the focus of the entry it came from", () => {
  const focused = {
    system_id: "e1",
    media_type: "anime",
    release_date: "2020-01-01",
    cover_image_file: "anime/e1.jpg",
    cover_image_focus: "40% 10%",
  };
  const other = {
    system_id: "e2",
    media_type: "anime",
    release_date: "2001-01-01",
    cover_image_file: "anime/e2.jpg",
    cover_image_focus: "90% 90%",
  };
  const expected = { url: "/api/covers/anime/e1.jpg", focus: "40% 10%" };

  it("from a franchise's chosen entry", () => {
    expect(
      getFranchiseCover(
        { system_id: "f1", cover_entry_id: "e1" },
        { e1: focused, e2: other },
        { f1: [other, focused] },
      ),
    ).toEqual(expected);
  });

  it("from a franchise's newest entry", () => {
    expect(
      getFranchiseCover({ system_id: "f1" }, {}, { f1: [other, focused] }),
    ).toEqual(expected);
  });

  it("from a series's entry", () => {
    expect(getSeriesCover({}, [other, focused])).toEqual(expected);
    expect(
      getSeriesCover({ cover_entry_id: "e2" }, [other, focused]).focus,
    ).toBe("90% 90%");
  });

  it("through a collection's member franchise", () => {
    expect(
      getCollectionCover({}, [{ system_id: "f1" }], {}, { f1: [focused] }),
    ).toEqual(expected);
  });
});

describe("getFranchiseCover", () => {
  const franchise = { system_id: "f1" };

  it("uses the chosen entry's stored key", () => {
    const entry = {
      system_id: "e1",
      media_type: "anime",
      cover_image_file: "anime/e1.jpg",
    };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toEqual({ url: "/api/covers/anime/e1.jpg", focus: null });
  });

  it("builds <media_type>/<id>.jpg for a chosen entry with no stored key", () => {
    const entry = { system_id: "e1", media_type: "manga" };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toEqual({ url: "/api/covers/manga/e1.jpg", focus: null });
  });

  it("returns the placeholder when the chosen entry has no media_type", () => {
    const entry = { system_id: "e1" };
    expect(
      getFranchiseCover(
        { ...franchise, cover_entry_id: "e1" },
        { e1: entry },
        { f1: [entry] },
      ),
    ).toEqual(NO_COVER);
  });

  it("prefers the newest member entry that has a stored key", () => {
    const old = {
      system_id: "e1",
      media_type: "anime",
      release_date: "2001-01-01",
      cover_image_file: "anime/e1.jpg",
    };
    const recent = {
      system_id: "e2",
      media_type: "movie",
      release_date: "2020-01-01",
      cover_image_file: "movie/e2.jpg",
    };
    expect(getFranchiseCover(franchise, {}, { f1: [old, recent] })).toEqual({ url: "/api/covers/movie/e2.jpg", focus: null });
  });

  it("falls back to the newest member entry by convention filename", () => {
    const old = {
      system_id: "e1",
      media_type: "anime",
      release_date: "2001-01-01",
    };
    const recent = {
      system_id: "e2",
      media_type: "novel",
      release_date: "2020-01-01",
    };
    expect(getFranchiseCover(franchise, {}, { f1: [old, recent] })).toEqual({ url: "/api/covers/novel/e2.jpg", focus: null });
  });

  it("returns the placeholder when the newest member entry has no media_type", () => {
    const entry = { system_id: "e1" };
    expect(getFranchiseCover(franchise, {}, { f1: [entry] })).toEqual(NO_COVER);
  });

  it("returns the placeholder for a franchise with no entries", () => {
    expect(getFranchiseCover(franchise, {}, {})).toEqual(NO_COVER);
  });
});

describe("getSeriesCover", () => {
  it("uses the chosen entry's stored key", () => {
    const entries = [
      {
        system_id: "e1",
        media_type: "anime",
        cover_image_file: "anime/e1.jpg",
      },
    ];
    expect(getSeriesCover({ cover_entry_id: "e1" }, entries)).toEqual({ url: "/api/covers/anime/e1.jpg", focus: null });
  });

  it("falls back to the newest entry with a stored key", () => {
    const entries = [
      {
        system_id: "e1",
        release_date: "2001-01-01",
        cover_image_file: "anime/e1.jpg",
      },
      {
        system_id: "e2",
        release_date: "2020-01-01",
        cover_image_file: "comic/e2.jpg",
      },
    ];
    expect(getSeriesCover({}, entries)).toEqual({ url: "/api/covers/comic/e2.jpg", focus: null });
  });

  it("returns the placeholder when no entry has a cover", () => {
    expect(getSeriesCover({}, [{ system_id: "e1" }])).toEqual(NO_COVER);
  });
});

describe("getCollectionCover", () => {
  const entry = {
    system_id: "e1",
    media_type: "anime",
    cover_image_file: "anime/e1.jpg",
  };
  const franchises = [{ system_id: "f1" }, { system_id: "f2" }];

  it("borrows the cover of the chosen member franchise", () => {
    expect(
      getCollectionCover(
        { cover_franchise_id: "f2" },
        franchises,
        {},
        {
          f2: [entry],
        },
      ),
    ).toEqual({ url: "/api/covers/anime/e1.jpg", focus: null });
  });

  it("falls through to the first member franchise that yields a cover", () => {
    expect(getCollectionCover({}, franchises, {}, { f2: [entry] })).toEqual({ url: "/api/covers/anime/e1.jpg", focus: null });
  });

  it("returns the placeholder when no member franchise has a cover", () => {
    expect(getCollectionCover({}, franchises, {}, {})).toEqual(NO_COVER);
  });
});
