import { describe, expect, it } from "vitest";

import { REGION_ONLY_FIELDS, clearedForRegion, progressFor, showsField } from "./hComicRegion";

describe("showsField", () => {
  it("shows the JP fields on JP and hides the KR ones", () => {
    for (const field of [
      "originality",
      "animation_status",
      "series_number",
      "page_total",
      "h_comic_name_jp",
    ]) {
      expect(showsField("JP", field), field).toBe(true);
      expect(showsField("KR", field), field).toBe(false);
    }
  });

  it("shows the KR fields on KR and hides the JP ones", () => {
    for (const field of ["ch_total", "ch_behind", "h_comic_name_kr", "author", "original_source"]) {
      expect(showsField("KR", field), field).toBe(true);
      expect(showsField("JP", field), field).toBe(false);
    }
  });

  it("shows the shared fields on both", () => {
    for (const field of [
      "h_comic_name_en",
      "h_comic_name_cn",
      "h_comic_name_alt",
      "serialization_status",
      "club",
      "illustrator",
      "h_genre_plot",
      "release_date",
      "sources",
      "usefulness",
    ]) {
      expect(showsField("JP", field), field).toBe(true);
      expect(showsField("KR", field), field).toBe(true);
    }
  });

  it("shows no region-only field until a region is chosen", () => {
    expect(showsField("", "page_total")).toBe(false);
    expect(showsField("", "ch_total")).toBe(false);
    expect(showsField("", "h_comic_name_en")).toBe(true);
  });

  it("mirrors the columns the server clears", () => {
    // REGION_CLEARS + LIST_REGION_CLEARS in app/services/domain/h_comic.py:
    // what KR clears is JP-only here, and the other way round.
    expect(REGION_ONLY_FIELDS.JP).toEqual(
      expect.arrayContaining([
        "originality",
        "animation_status",
        "series_number",
        "page_total",
        "page_fin",
      ])
    );
    expect(REGION_ONLY_FIELDS.KR).toEqual(
      expect.arrayContaining(["ch_total", "ch_behind", "highlight_group_order", "ch_fin"])
    );
  });
});

describe("clearedForRegion", () => {
  const form = {
    region: "JP",
    h_comic_name_kr: "한국어",
    h_comic_name_jp: "日本語",
    originality: "同人",
    page_total: "30",
    ch_total: "12",
    ch_behind: "3",
    author: "Somebody",
    original_source: "Toomics",
    club: "A Club",
  };

  it("blanks what the region does not use and keeps what it does", () => {
    const out = clearedForRegion(form);
    expect(out.ch_total).toBe("");
    expect(out.ch_behind).toBe("");
    expect(out.author).toBe("");
    expect(out.original_source).toBe("");
    expect(out.originality).toBe("同人");
    expect(out.page_total).toBe("30");
    expect(out.club).toBe("A Club");
  });

  it("keeps the other region's name", () => {
    expect(clearedForRegion(form).h_comic_name_kr).toBe("한국어");
    expect(clearedForRegion({ ...form, region: "KR" }).h_comic_name_jp).toBe("日本語");
  });

  it("does not invent fields the form never held", () => {
    expect("series_number" in clearedForRegion({ region: "KR" })).toBe(false);
  });

  it("does not mutate its input", () => {
    clearedForRegion(form);
    expect(form.ch_total).toBe("12");
  });
});

describe("progressFor", () => {
  it("reads pages on JP", () => {
    expect(progressFor({ region: "JP", page_fin: 4, page_total: 20 })).toMatchObject({
      finField: "page_fin",
      fin: 4,
      total: 20,
      unit: "page",
    });
  });

  it("reads chapters on KR, with an unknown total as null", () => {
    expect(progressFor({ region: "KR", ch_fin: null })).toMatchObject({
      finField: "ch_fin",
      fin: 0,
      total: null,
      unit: "ch",
    });
  });

  it("has no counter without a region", () => {
    expect(progressFor({})).toBeNull();
  });
});
