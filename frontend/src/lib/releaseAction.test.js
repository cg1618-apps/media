import { describe, it, expect } from "vitest";
import { releaseAction, releaseDetailFields } from "./releaseAction";

describe("releaseAction", () => {
  describe("two-step airing types", () => {
    it.each(["anime", "tv-show", "cartoon", "hentai"])(
      "%s: not yet aired -> Mark airing",
      (type) => {
        const a = releaseAction(type, { airing_status: "Not Yet Aired" });
        expect(a.label).toBe("Mark airing");
        expect(a.payload).toEqual({ airing_status: "Airing" });
      },
    );

    it.each(["anime", "tv-show", "cartoon", "hentai"])(
      "%s: airing -> Mark finished airing",
      (type) => {
        const a = releaseAction(type, { airing_status: "Airing" });
        expect(a.label).toBe("Mark finished airing");
        expect(a.payload).toEqual({ airing_status: "Finished Airing" });
      },
    );

    it.each(["anime", "tv-show", "cartoon", "hentai"])(
      "%s: Mark airing moves Watch When Airs to Active Watching",
      (type) => {
        const a = releaseAction(type, {
          airing_status: "Not Yet Aired",
          watching_status: "Watch When Airs",
        });
        expect(a.payload).toEqual({
          airing_status: "Airing",
          watching_status: "Active Watching",
        });
        expect(a.toast).toBe("Marked as airing · Active Watching");
      },
    );

    it("leaves any other watching status alone on Mark airing", () => {
      const a = releaseAction("anime", {
        airing_status: "Not Yet Aired",
        watching_status: "Plan to Watch",
      });
      expect(a.payload).toEqual({ airing_status: "Airing" });
    });

    it("leaves Watch When Airs alone on the finishing step", () => {
      const a = releaseAction("anime", {
        airing_status: "Airing",
        watching_status: "Watch When Airs",
      });
      expect(a.payload).toEqual({ airing_status: "Finished Airing" });
    });

    it("offers nothing on an airing status the vocabulary no longer has", () => {
      expect(releaseAction("anime", { airing_status: "Rumored" })).toBeNull();
    });
  });

  describe("one-step airing types", () => {
    it.each([
      ["anime", { airing_type: "Movie" }],
      ["cartoon", { airing_type: "Movie" }],
    ])("%s %o: not yet aired -> Mark released", (type, extra) => {
      const a = releaseAction(type, { airing_status: "Not Yet Aired", ...extra });
      expect(a.label).toBe("Mark released");
      expect(a.payload).toEqual({ airing_status: "Finished Airing" });
    });
  });

  describe("films", () => {
    it.each(["movie", "anime-movie"])("%s: Not Released -> Mark released", (type) => {
      const a = releaseAction(type, { release_status: "Not Released" });
      expect(a.label).toBe("Mark released");
      expect(a.payload).toEqual({ release_status: "Released" });
      expect(a.ask).toBe(true);
    });

    it.each(["movie", "anime-movie"])("%s: no step once Released or Canceled", (type) => {
      for (const s of ["Released", "Canceled", null, undefined]) {
        expect(releaseAction(type, { release_status: s })).toBeNull();
      }
    });

    it.each(["movie", "anime-movie"])(
      "%s: Mark released moves Watch When Released to Active Watching",
      (type) => {
        const a = releaseAction(type, {
          release_status: "Not Released",
          watching_status: "Watch When Released",
        });
        expect(a.payload).toEqual({
          release_status: "Released",
          watching_status: "Active Watching",
        });
        expect(a.toast).toBe("Marked as released · Active Watching");
      },
    );

    it.each(["Plan to Watch", "Might Watch", "Watch When Airs"])(
      "leaves %s alone on a film's Mark released",
      (status) => {
        const a = releaseAction("movie", {
          release_status: "Not Released",
          watching_status: status,
        });
        expect(a.payload).toEqual({ release_status: "Released" });
      },
    );

    it("reads release_status, not airing_status", () => {
      expect(releaseAction("movie", { airing_status: "Not Yet Aired" })).toBeNull();
    });

    it("does not take a game's pending values", () => {
      expect(releaseAction("movie", { release_status: "Unreleased" })).toBeNull();
      expect(releaseAction("game", { release_status: "Not Released" })).toBeNull();
    });
  });

  describe("serialization types", () => {
    it.each(["manga", "comic", "h-comic", "book"])(
      "%s: serializing -> Mark finished serializing",
      (type) => {
        const a = releaseAction(type, { serialization_status: "連載中" });
        expect(a.label).toBe("Mark finished serializing");
        expect(a.payload).toEqual({ serialization_status: "完結" });
      },
    );

    it("book: 未出 -> Mark serializing", () => {
      const a = releaseAction("book", { serialization_status: "未出" });
      expect(a.label).toBe("Mark serializing");
      expect(a.payload).toEqual({ serialization_status: "連載中" });
    });

    it("book: every 連載中 variant can finish", () => {
      for (const s of ["連載中 (不穩定)", "連載中 (有生之年)"]) {
        expect(
          releaseAction("book", { serialization_status: s }).payload,
        ).toEqual({ serialization_status: "完結" });
      }
    });

    it("leaves hiatus and cancelled alone", () => {
      for (const s of ["停更", "腰斬", "完結"]) {
        expect(releaseAction("manga", { serialization_status: s })).toBeNull();
      }
    });
  });

  describe("games", () => {
    it.each(["game", "h-game"])("%s: unreleased -> Mark released", (type) => {
      for (const s of ["Unreleased", "Early Access"]) {
        const a = releaseAction(type, { release_status: s });
        expect(a.label).toBe("Mark released");
        expect(a.payload).toEqual({ release_status: "Released" });
      }
    });

    it("has no step past Released, including Ongoing", () => {
      for (const s of ["Released", "Ongoing", "Discontinued", "Cancelled"]) {
        expect(releaseAction("game", { release_status: s })).toBeNull();
      }
    });
  });

  it("shows nothing once released, cancelled, or unrecorded", () => {
    for (const s of ["Finished Airing", "Canceled", null, undefined]) {
      expect(releaseAction("anime", { airing_status: s })).toBeNull();
    }
    expect(releaseAction("book", {})).toBeNull();
    expect(releaseAction("game", {})).toBeNull();
  });
});

describe("release step asks; finishing step does not", () => {
  it("flags only the release step", () => {
    expect(releaseAction("anime", { airing_status: "Not Yet Aired" }).ask).toBe(true);
    expect(releaseAction("anime", { airing_status: "Airing" }).ask).toBe(false);
    expect(releaseAction("book", { serialization_status: "未出" }).ask).toBe(true);
    expect(releaseAction("book", { serialization_status: "連載中" }).ask).toBe(false);
    expect(releaseAction("game", { release_status: "Unreleased" }).ask).toBe(true);
  });
});

describe("releaseDetailFields", () => {
  const names = (type, entry) => releaseDetailFields(type, entry).map((f) => f.field);

  it("anime asks for the date, broadcast slot and watch day", () => {
    expect(names("anime", {})).toEqual([
      "release_date_jp",
      "release_date_tw",
      "broadcast_day",
      "broadcast_time",
      "my_watch_day",
    ]);
  });

  it("a movie-format anime has no broadcast slot to ask for", () => {
    expect(names("anime", { airing_type: "Movie" })).toEqual([
      "release_date_jp",
      "release_date_tw",
    ]);
  });

  it("asks every release column the type has", () => {
    expect(names("anime-movie", {})).toEqual(["release_date_jp", "release_date_tw"]);
    expect(names("anime-movie", { release_type: "Cinema" })).toEqual([
      "release_date_jp",
      "release_date_tw",
    ]);
    expect(names("movie", {})).toEqual(["release_date_tw", "release_date_usa"]);
    expect(names("game", {})).toEqual(["release_date"]);
    expect(names("book", {})).toEqual(["release_date_jp", "release_date_tw"]);
  });

  it("an ONA anime movie asks for its one release date", () => {
    const fields = releaseDetailFields("anime-movie", { release_type: "ONA" });
    expect(fields).toEqual([{ field: "release_date_jp", label: "Release date", kind: "date" }]);
    expect(names("anime-movie", { release_type: "ONA", release_date_jp: "2026-10" })).toEqual([]);
  });

  it("leaves out what is already filled", () => {
    expect(
      names("anime", {
        release_date_jp: "2026-10",
        release_date_tw: "2026-10",
        broadcast_day: "Friday",
        broadcast_time: "",
        my_watch_day: null,
      }),
    ).toEqual(["broadcast_time", "my_watch_day"]);
    expect(names("tv-show", { release_date: "2026" })).toEqual([]);
  });
});

// The status move and my watch day are the viewer's own list fields: a viewer
// without self.list gets the release step without them, and the mirror case
// with the same entry still carries them.
describe("a release step for a viewer without self.list", () => {
  const waiting = { airing_status: "Not Yet Aired", watching_status: "Watch When Airs" };

  it("does not move the watching status", () => {
    expect(releaseAction("anime", waiting, { canTrack: false }).payload).toEqual({
      airing_status: "Airing",
    });
    expect(releaseAction("anime", waiting).payload).toEqual({
      airing_status: "Airing",
      watching_status: "Active Watching",
    });
  });

  it("does not move a film's watching status either", () => {
    const film = { release_status: "Not Released", watching_status: "Watch When Released" };
    expect(releaseAction("movie", film, { canTrack: false }).payload).toEqual({
      release_status: "Released",
    });
    expect(releaseAction("movie", film).payload).toEqual({
      release_status: "Released",
      watching_status: "Active Watching",
    });
  });

  it("does not ask for my watch day", () => {
    const fields = (opts) => releaseDetailFields("anime", waiting, opts).map((f) => f.field);
    expect(fields({ canTrack: false })).not.toContain("my_watch_day");
    expect(fields({ canTrack: false })).toContain("broadcast_day");
    expect(fields()).toContain("my_watch_day");
  });
});
