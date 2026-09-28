import {
  drawChances,
  entryFactors,
  entryWeight,
  groupPlanMarks,
  pickWeighted,
  weightGroupOf,
} from "./pickerWeights";
import { entryKey, toEntries } from "./randomPicker";

const anime = (id, fields = {}) => ({ type: "anime", item: { system_id: id, ...fields } });
const manga = (id, fields = {}) => ({ type: "manga", item: { system_id: id, ...fields } });

// A chance map read as { id: chance }, for readable assertions.
function chancesById(pool, context, weighted) {
  const out = {};
  for (const [key, chance] of drawChances(pool, context, weighted)) {
    out[key.split(":")[1]] = chance;
  }
  return out;
}

describe("weightGroupOf", () => {
  it("weighs a temporary drop as a pause, and a wait on release as a might", () => {
    expect(weightGroupOf("anime", { watching_status: "Temp Dropped" })).toBe("In Progress");
    expect(weightGroupOf("anime", { watching_status: "Paused" })).toBe("In Progress");
    expect(weightGroupOf("anime", { watching_status: "Watch When Airs" })).toBe("Might");
    expect(weightGroupOf("game", { playing_status: "Play When Released" })).toBe("Might");
  });

  it("otherwise follows the Status filter's groups", () => {
    expect(weightGroupOf("anime", { watching_status: "Won't Watch" })).toBe("Dropped");
    expect(weightGroupOf("manga", { reading_status: "Plan to Read" })).toBe("Planned");
    expect(weightGroupOf("anime", {})).toBe("Might");
  });
});

describe("drawChances", () => {
  it("shares the draw between groups by group weight, not by group size", () => {
    // One entry in progress against three completed: the group, not the
    // head count, decides - 1.5 : 1.0.
    const pool = [
      anime("p", { watching_status: "Active Watching" }),
      anime("c1", { watching_status: "Completed", my_rating: "S" }),
      anime("c2", { watching_status: "Completed", my_rating: "S" }),
      anime("c3", { watching_status: "Completed", my_rating: "S" }),
    ];
    const chances = chancesById(pool);
    expect(chances.p).toBeCloseTo(0.6);
    expect(chances.c1 + chances.c2 + chances.c3).toBeCloseTo(0.4);
  });

  it("skips a group the pool does not hold", () => {
    const pool = [anime("d", { watching_status: "Dropped" })];
    expect(chancesById(pool).d).toBeCloseTo(1);
  });

  it("orders completed entries by rating within their group only", () => {
    const pool = [
      anime("s", { watching_status: "Completed", my_rating: "S" }),
      anime("b", { watching_status: "Completed", my_rating: "B" }),
      anime("u", { watching_status: "Completed" }),
      anime("p", { watching_status: "Active Watching" }),
    ];
    const chances = chancesById(pool);
    // 1 : 0.75 : 0.5 inside Completed's 1.0 / 2.5 share.
    expect(chances.s).toBeCloseTo(0.4 * (1 / 2.25));
    expect(chances.b).toBeCloseTo(0.4 * (0.75 / 2.25));
    expect(chances.u).toBeCloseTo(0.4 * (0.5 / 2.25));
    expect(chances.p).toBeCloseTo(0.6);
  });

  it("gives every entry the same chance when unweighted", () => {
    const pool = [
      anime("p", { watching_status: "Active Watching" }),
      anime("d", { watching_status: "Dropped" }),
    ];
    expect(chancesById(pool, {}, false)).toEqual({ p: 0.5, d: 0.5 });
  });
});

describe("entryFactors", () => {
  it("applies a rating only to a completed entry", () => {
    expect(
      entryFactors(anime("a", { watching_status: "Active Watching", my_rating: "F" })).rating
    ).toBe(1);
    expect(entryFactors(anime("a", { watching_status: "Completed", my_rating: "A+" })).rating).toBe(
      1
    );
    expect(entryFactors(anime("a", { watching_status: "Completed", my_rating: "D" })).rating).toBe(
      0.5
    );
  });

  it("counts a completion through a summary for less", () => {
    const f = entryFactors(anime("a", { watching_status: "Completed (解說)", my_rating: "S" }));
    expect(f.rating).toBeCloseTo(0.8);
  });

  it("takes the larger plan mark, from the entry or its series or franchise", () => {
    expect(entryFactors(anime("a", { watch_next: true })).plan).toBe(1.5);
    expect(entryFactors(manga("m", { to_reread: true })).plan).toBe(1.2);
    expect(entryFactors(manga("m", { read_next: true, to_reread: true })).plan).toBe(1.5);
    expect(entryFactors(anime("a")).plan).toBe(1);

    const planMarks = groupPlanMarks([
      { kind: "rewatch", media_type: "anime", scope: "franchise", target_id: "f1" },
      { kind: "next", media_type: "manga", scope: "series", target_id: "s1" },
      // An entry-scope row is carried on the entry itself, not read from here.
      { kind: "next", media_type: "anime", scope: "entry", target_id: "a" },
    ]);
    expect(entryFactors(anime("a", { franchise_id: "f1" }), { planMarks }).plan).toBe(1.2);
    expect(entryFactors(manga("m", { series_id: "s1" }), { planMarks }).plan).toBe(1.5);
    // A mark under another media type does not reach this entry.
    expect(entryFactors(manga("m", { franchise_id: "f1" }), { planMarks }).plan).toBe(1);
    expect(entryFactors(anime("a"), { planMarks }).plan).toBe(1);
  });

  it("favours 2000 and later, counting an undated entry as earlier", () => {
    expect(entryFactors(anime("a", { release_date: "2000-01" })).decade).toBe(1.5);
    expect(entryFactors(anime("a", { release_date: "1999" })).decade).toBe(1);
    expect(entryFactors(anime("a")).decade).toBe(1);
  });

  it("weighs serialization only within one type's mode", () => {
    const done = manga("m", { serialization_status: "完結" });
    expect(entryFactors(done, { mode: "manga" }).serialization).toBe(1.5);
    expect(entryFactors(done, { mode: "all" }).serialization).toBe(1);
    expect(
      entryFactors({ type: "h-comic", item: { serialization_status: "完結" } }, { mode: "h-comic" })
        .serialization
    ).toBe(1.2);
    expect(
      entryFactors(
        { type: "novel", item: { serialization_status: "連載中 (有生之年)" } },
        { mode: "novel" }
      ).serialization
    ).toBe(0.3);
    expect(entryFactors(manga("m"), { mode: "manga" }).serialization).toBe(1);
  });

  it("multiplies the factors into one weight", () => {
    const e = manga("m", { read_next: true, release_date: "2015", serialization_status: "連載中" });
    expect(entryWeight(e, { mode: "manga" })).toBeCloseTo(1.5 * 1.5 * 1.3);
  });
});

describe("pickWeighted", () => {
  const pool = toEntries("anime", [{ system_id: "a" }, { system_id: "b" }, { system_id: "c" }]);

  it("draws by the random source, and says the chance it had", () => {
    const first = pickWeighted(pool, null, {}, true, () => 0);
    expect(entryKey(first.entry)).toBe("anime:a");
    expect(first.chance).toBeCloseTo(1 / 3);
    expect(entryKey(pickWeighted(pool, null, {}, true, () => 0.99).entry)).toBe("anime:c");
  });

  it("never repeats the previous pick while there is another", () => {
    for (const r of [0, 0.5, 0.99]) {
      const { entry, chance } = pickWeighted(pool, pool[0], {}, true, () => r);
      expect(entryKey(entry)).not.toBe("anime:a");
      expect(chance).toBeCloseTo(1 / 2);
    }
  });

  it("repeats the only entry, and draws nothing from an empty pool", () => {
    expect(pickWeighted([pool[0]], pool[0], {}).entry).toBe(pool[0]);
    expect(pickWeighted([], null, {})).toBeNull();
  });

  it("draws the heavier group more often", () => {
    const mixed = [
      anime("p", { watching_status: "Active Watching" }),
      anime("d", { watching_status: "Dropped" }),
    ];
    // p holds 1.5 / 1.8 of the draw, so a roll of 0.8 still lands on it.
    expect(entryKey(pickWeighted(mixed, null, {}, true, () => 0.8).entry)).toBe("anime:p");
    expect(entryKey(pickWeighted(mixed, null, {}, false, () => 0.8).entry)).toBe("anime:d");
  });
});
