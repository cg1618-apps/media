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

    it("treats Rumored as not yet aired", () => {
      expect(releaseAction("anime", { airing_status: "Rumored" }).label).toBe(
        "Mark airing",
      );
    });
  });

  describe("one-step airing types", () => {
    it.each([
      ["movie", {}],
      ["anime-movie", {}],
      ["anime", { airing_type: "Movie" }],
      ["cartoon", { airing_type: "Movie" }],
    ])("%s %o: not yet aired -> Mark released", (type, extra) => {
      const a = releaseAction(type, { airing_status: "Not Yet Aired", ...extra });
      expect(a.label).toBe("Mark released");
      expect(a.payload).toEqual({ airing_status: "Finished Airing" });
    });

    it("offers no finishing step on a movie that is somehow Airing", () => {
      expect(releaseAction("movie", { airing_status: "Airing" })).toBeNull();
    });
  });

  describe("serialization types", () => {
    it.each(["manga", "comic", "h-comic", "novel"])(
      "%s: serializing -> Mark finished serializing",
      (type) => {
        const a = releaseAction(type, { serialization_status: "連載中" });
        expect(a.label).toBe("Mark finished serializing");
        expect(a.payload).toEqual({ serialization_status: "完結" });
      },
    );

    it("novel: 未出 -> Mark serializing", () => {
      const a = releaseAction("novel", { serialization_status: "未出" });
      expect(a.label).toBe("Mark serializing");
      expect(a.payload).toEqual({ serialization_status: "連載中" });
    });

    it("novel: every 連載中 variant can finish", () => {
      for (const s of ["連載中 (不穩定)", "連載中 (有生之年)"]) {
        expect(
          releaseAction("novel", { serialization_status: s }).payload,
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
      for (const s of ["Rumored", "Unreleased", "Early Access"]) {
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
    expect(releaseAction("novel", {})).toBeNull();
    expect(releaseAction("game", {})).toBeNull();
  });
});

describe("release step asks; finishing step does not", () => {
  it("flags only the release step", () => {
    expect(releaseAction("anime", { airing_status: "Not Yet Aired" }).ask).toBe(true);
    expect(releaseAction("anime", { airing_status: "Airing" }).ask).toBe(false);
    expect(releaseAction("novel", { serialization_status: "未出" }).ask).toBe(true);
    expect(releaseAction("novel", { serialization_status: "連載中" }).ask).toBe(false);
    expect(releaseAction("game", { release_status: "Unreleased" }).ask).toBe(true);
  });
});

describe("releaseDetailFields", () => {
  const names = (type, entry) => releaseDetailFields(type, entry).map((f) => f.field);

  it("anime asks for the date, broadcast slot and watch day", () => {
    expect(names("anime", {})).toEqual([
      "release_date",
      "broadcast_day",
      "broadcast_time",
      "my_watch_day",
    ]);
  });

  it("a movie-format anime has no broadcast slot to ask for", () => {
    expect(names("anime", { airing_type: "Movie" })).toEqual(["release_date"]);
  });

  it("asks every release column the type has", () => {
    expect(names("anime-movie", {})).toEqual(["release_date_jp", "release_date_tw"]);
    expect(names("movie", {})).toEqual(["release_date_tw", "release_date_usa"]);
    expect(names("game", {})).toEqual(["release_date"]);
  });

  it("leaves out what is already filled", () => {
    expect(
      names("anime", {
        release_date: "2026-10",
        broadcast_day: "Friday",
        broadcast_time: "",
        my_watch_day: null,
      }),
    ).toEqual(["broadcast_time", "my_watch_day"]);
    expect(names("tv-show", { release_date: "2026" })).toEqual([]);
  });
});
