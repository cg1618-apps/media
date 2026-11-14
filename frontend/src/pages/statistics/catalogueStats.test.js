import { describe, it, expect } from "vitest";
import { scoreBuckets, scoredTypes, sortTypeRows } from "./catalogueStats";

const MAL = [
  { media_type: "manga", bucket: 8, entry_count: 2 },
  { media_type: "anime", bucket: 9, entry_count: 1 },
  { media_type: "anime", bucket: 8, entry_count: 3 },
];

describe("scoreBuckets", () => {
  it("pools every media type into ten one-point MAL buckets, highest first", () => {
    const { rows, total } = scoreBuckets(MAL, "mal");
    expect(rows.map((r) => r.label)).toEqual([
      "9–10", "8–9", "7–8", "6–7", "5–6", "4–5", "3–4", "2–3", "1–2", "0–1",
    ]);
    expect(rows[0].count).toBe(1);
    expect(rows[1].count).toBe(5);
    expect(total).toBe(6);
  });

  it("narrows to the selected media type", () => {
    const { rows, total } = scoreBuckets(MAL, "mal", "manga");
    expect(rows[1].count).toBe(2);
    expect(rows[0].count).toBe(0);
    expect(total).toBe(2);
  });

  it("labels AniList's ten-point buckets on its 0-100 scale", () => {
    const { rows } = scoreBuckets([{ media_type: "anime", bucket: 90, entry_count: 4 }], "anilist");
    expect(rows.map((r) => r.label)).toEqual([
      "90–100", "80–89", "70–79", "60–69", "50–59", "40–49", "30–39", "20–29", "10–19", "0–9",
    ]);
    expect(rows[0].count).toBe(4);
  });

  it("keeps every bucket when nothing is scored", () => {
    const { rows, total } = scoreBuckets([], "mal");
    expect(rows).toHaveLength(10);
    expect(total).toBe(0);
  });
});

describe("scoredTypes", () => {
  it("lists the types present, in registry order", () => {
    expect(scoredTypes(MAL)).toEqual(["anime", "manga"]);
  });
});

describe("sortTypeRows", () => {
  it("orders the type table as the registry does", () => {
    const rows = sortTypeRows([
      { media_type: "manga", entry_count: 1, franchise_count: 1 },
      { media_type: "anime", entry_count: 4, franchise_count: 2 },
    ]);
    expect(rows.map((r) => r.media_type)).toEqual(["anime", "manga"]);
  });
});
