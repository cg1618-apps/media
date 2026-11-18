// The names and types an entry's save hands a franchise or series it creates.
import { describe, expect, it } from "vitest";

import { FRANCHISE_TYPES } from "../config/fieldOptions";
import {
  entryGroupNames,
  franchiseCreateBody,
  hasAnyName,
  offeredFranchiseTypes,
  orderTypes,
  SERIES_AUTOFILL_KEYS,
  seriesCreateBody,
} from "./groupQuickCreate";

const FORM = {
  anime_name_en: "Frieren",
  anime_name_cn: "葬送的芙莉蓮",
  anime_name_roman: "Sousou no Frieren",
  anime_name_jp: "葬送のフリーレン",
  anime_name_alt: "",
};

describe("entryGroupNames", () => {
  it("fills a franchise from all five of the entry's names", () => {
    expect(entryGroupNames(FORM, "anime")).toEqual({
      en: "Frieren",
      cn: "葬送的芙莉蓮",
      roman: "Sousou no Frieren",
      jp: "葬送のフリーレン",
      alt: "",
    });
  });

  it("fills a series from the EN, CN and Alt names only", () => {
    expect(entryGroupNames(FORM, "anime", SERIES_AUTOFILL_KEYS)).toEqual({
      en: "Frieren",
      cn: "葬送的芙莉蓮",
      roman: "",
      jp: "",
      alt: "",
    });
  });

  it("leaves a name the entry type does not have blank", () => {
    expect(entryGroupNames({ tv_name_en: "Lost" }, "tv")).toEqual({
      en: "Lost",
      cn: "",
      roman: "",
      jp: "",
      alt: "",
    });
  });
});

describe("hasAnyName", () => {
  it("is false for names that are all blank or whitespace", () => {
    expect(hasAnyName({ en: "  ", cn: "" })).toBe(false);
    expect(hasAnyName({ en: "", alt: "x" })).toBe(true);
  });
});

describe("create bodies", () => {
  it("trims each franchise name, sends a blank one as null and joins the types", () => {
    expect(
      franchiseCreateBody({ en: " Frieren ", cn: "", roman: "", jp: "", alt: "" }, ["Anime", "Manga"]),
    ).toEqual({
      franchise_name_en: "Frieren",
      franchise_name_cn: null,
      franchise_name_roman: null,
      franchise_name_jp: null,
      franchise_name_alt: null,
      franchise_type: "Anime, Manga",
    });
  });

  it("puts a series under its franchise", () => {
    expect(seriesCreateBody("f1", { en: "Saga", cn: "", roman: "", jp: "", alt: "" })).toEqual({
      franchise_id: "f1",
      series_name_en: "Saga",
      series_name_cn: null,
      series_name_roman: null,
      series_name_jp: null,
      series_name_alt: null,
    });
  });
});

describe("offeredFranchiseTypes", () => {
  it("offers a mainstream entry every mainstream type and no restricted one", () => {
    const offered = offeredFranchiseTypes(FRANCHISE_TYPES, "Anime");
    expect(offered).toContain("Manga");
    expect(offered).toContain("Game");
    expect(offered).not.toContain("H-Comic");
  });

  it("offers a restricted entry only the restricted family", () => {
    expect(offeredFranchiseTypes(FRANCHISE_TYPES, "H-Comic")).toEqual([
      "H-Comic",
      "H-Game",
      "Hentai",
    ]);
  });
});

describe("orderTypes", () => {
  it("orders types by the vocabulary and drops repeats", () => {
    expect(orderTypes(["Game", "Anime", "Game"], FRANCHISE_TYPES)).toEqual(["Anime", "Game"]);
  });
});
