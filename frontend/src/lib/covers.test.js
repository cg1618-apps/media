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
  thumbUrl,
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

describe("thumbUrl", () => {
  it("asks the cover route for its small version", () => {
    expect(thumbUrl(getCoverUrl("anime/abc123.jpg"))).toBe(
      "/api/covers/anime/abc123.jpg?size=thumb",
    );
    expect(thumbUrl(getCoverUrl("covers/character/abc123.jpg"))).toBe(
      "/api/covers/character/abc123.jpg?size=thumb",
    );
  });

  it("points a library upload at the thumbnail stored beside it", () => {
    expect(thumbUrl(getCoverUrl("library/deadbeef.jpg"))).toBe(
      "/static/library/thumbs/deadbeef.jpg",
    );
    expect(thumbUrl("/static/library/thumbs/deadbeef.jpg")).toBe(
      "/static/library/thumbs/deadbeef.jpg",
    );
  });

  it("leaves the placeholder and anything else alone", () => {
    expect(thumbUrl(FALLBACK_SVG)).toBe(FALLBACK_SVG);
    expect(thumbUrl("https://example.com/x.jpg")).toBe("https://example.com/x.jpg");
    expect(thumbUrl(undefined)).toBeUndefined();
  });
});

describe("focusStyle", () => {
  it("turns a focus into an object-position style", () => {
    expect(focusStyle("30% 15%")).toEqual({ objectPosition: "30% 15%" });
  });

  it("scales a zoomed focus about its focal point", () => {
    expect(focusStyle("30% 15% 2.5")).toEqual({
      objectPosition: "30% 15%",
      transform: "scale(2.5)",
      transformOrigin: "30% 15%",
    });
  });

  it("letterboxes a fit focus on the inset surface colour, not a grey", () => {
    expect(focusStyle("50% 0% fit")).toEqual({
      objectFit: "contain",
      objectPosition: "50% 0%",
      backgroundColor: "var(--color-surface-2)",
    });
  });

  it("returns undefined for a centred or malformed focus, so no style is written", () => {
    for (const v of [null, undefined, "", "left top", "50% 50% 9", "50% 50% fill"]) {
      expect(focusStyle(v)).toBeUndefined();
    }
  });
});

describe("parseFocus / formatFocus", () => {
  it("round-trips a stored focus", () => {
    for (const [stored, parsed] of [
      ["30% 15%", { x: 30, y: 15, zoom: 1, fit: false }],
      ["30% 15% 1.5", { x: 30, y: 15, zoom: 1.5, fit: false }],
      ["0% 100% 2.25", { x: 0, y: 100, zoom: 2.25, fit: false }],
      ["50% 50% 4", { x: 50, y: 50, zoom: 4, fit: false }],
      ["50% 50% fit", { x: 50, y: 50, zoom: 1, fit: true }],
      ["10% 90% fit", { x: 10, y: 90, zoom: 1, fit: true }],
    ]) {
      expect(parseFocus(stored)).toEqual(parsed);
      expect(formatFocus(parsed)).toBe(stored);
    }
  });

  it("reads null, empty and malformed values as the centre", () => {
    const centre = { x: 50, y: 50, zoom: 1, fit: false };
    for (const v of [null, undefined, "", "left top", "30%"]) {
      expect(parseFocus(v)).toEqual(centre);
    }
  });

  it("refuses a zoom the server would refuse, rather than guessing", () => {
    // 1 is written by leaving the token out; the rest are out of range,
    // over-precise or not a zoom at all. Same list as the backend's.
    const centre = { x: 50, y: 50, zoom: 1, fit: false };
    for (const v of [
      "30% 15% 1",
      "30% 15% 1.0",
      "30% 15% 1.50",
      "30% 15% 4.5",
      "30% 15% 5",
      "30% 15% 0",
      "30% 15% 0.5",
      "30% 15% -2",
      "30% 15% 1.255",
      "30% 15% fitted",
      "30% 15% fit 2",
    ]) {
      expect(parseFocus(v)).toEqual(centre);
    }
  });

  it("stores the centre at zoom 1 as null", () => {
    expect(formatFocus({ x: 50, y: 50 })).toBeNull();
    expect(formatFocus({ x: 49.6, y: 50.2, zoom: 1 })).toBeNull();
    expect(formatFocus({ x: 50, y: 50, zoom: 1.004 })).toBeNull();
  });

  it("never stores fit or a zoomed centre as null", () => {
    expect(formatFocus({ x: 50, y: 50, fit: true })).toBe("50% 50% fit");
    expect(formatFocus({ x: 50, y: 50, zoom: 2 })).toBe("50% 50% 2");
  });

  it("writes no zoom token at zoom 1, and ignores zoom when fitting", () => {
    expect(formatFocus({ x: 30, y: 15, zoom: 1 })).toBe("30% 15%");
    expect(formatFocus({ x: 30, y: 15, zoom: 3, fit: true })).toBe("30% 15% fit");
  });

  it("clamps the zoom to 1..4 and two decimals, with no trailing zeros", () => {
    expect(formatFocus({ x: 30, y: 15, zoom: 9 })).toBe("30% 15% 4");
    expect(formatFocus({ x: 30, y: 15, zoom: 0.5 })).toBe("30% 15%");
    expect(formatFocus({ x: 30, y: 15, zoom: 1.256 })).toBe("30% 15% 1.26");
    expect(formatFocus({ x: 30, y: 15, zoom: 1.5 })).toBe("30% 15% 1.5");
    expect(formatFocus({ x: 30, y: 15, zoom: 2.0 })).toBe("30% 15% 2");
  });

  it("clamps to whole percentages between 0 and 100", () => {
    expect(formatFocus({ x: -12, y: 140 })).toBe("0% 100%");
    expect(formatFocus({ x: 33.4, y: 66.6 })).toBe("33% 67%");
    expect(parseFocus("150% 0%")).toEqual({ x: 100, y: 0, zoom: 1, fit: false });
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

  it("passes a zoomed or fitted focus through untouched", () => {
    for (const focus of ["40% 10% 2.5", "40% 10% fit"]) {
      expect(getSeriesCover({}, [{ ...focused, cover_image_focus: focus }]).focus).toBe(
        focus,
      );
    }
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
      media_type: "book",
      release_date: "2020-01-01",
    };
    expect(getFranchiseCover(franchise, {}, { f1: [old, recent] })).toEqual({ url: "/api/covers/book/e2.jpg", focus: null });
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
