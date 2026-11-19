import { describe, it, expect, afterEach } from "vitest";

import {
  COMMON_OPTION_CATEGORIES,
  TAG_CATEGORIES,
  applyConstants,
} from "../config/fieldOptions";
import {
  categoriesForSubTab,
  isCommonOptionCategory,
  isTagCategory,
} from "./optionCategoryGroups";
import { OPTION_SUB_TABS } from "../components/forms/OptionSubTabBar";

// applyConstants mutates TAG_CATEGORIES and COMMON_OPTION_CATEGORIES in
// place, so restore their real contents after any test that overwrites them.
const ORIGINAL_TAG_CATEGORIES = [...TAG_CATEGORIES];
const ORIGINAL_COMMON_OPTION_CATEGORIES = [...COMMON_OPTION_CATEGORIES];
afterEach(() => {
  applyConstants({
    tag_categories: ORIGINAL_TAG_CATEGORIES,
    common_option_categories: ORIGINAL_COMMON_OPTION_CATEGORIES,
  });
});

const ALL = [
  "Character Group",
  "Comic Era",
  "Genre Main",
  "Genre Sub",
  "Geography Group",
  "Label",
  "Needs Work Note",
  "Official Source",
  "Song Type",
];

describe("isTagCategory", () => {
  it("recognises the tag categories", () => {
    expect(isTagCategory("Label")).toBe(true);
    expect(isTagCategory("Genre Main")).toBe(true);
  });

  it("leaves the ones that name an outside party alone", () => {
    expect(isTagCategory("Comic Era")).toBe(false);
    expect(isTagCategory("Comic Imprint")).toBe(false);
  });

  it("follows /api/constants rather than a copy of the list", () => {
    applyConstants({ tag_categories: ["Comic Era"] });
    expect(isTagCategory("Comic Era")).toBe(true);
    expect(isTagCategory("Label")).toBe(false);
  });
});

describe("isCommonOptionCategory", () => {
  it("recognises every suggestion-only vocabulary, before /api/constants answers", () => {
    for (const c of [
      "Character Group",
      "Collectible Type",
      "Item Type",
      "Weapon & Gear Type",
      "Enemy Tier",
      "Side Quest Type",
      "Geography Group",
      "Song Type",
      "Song Source",
      "Needs Work Note",
    ]) {
      expect(isCommonOptionCategory(c)).toBe(true);
    }
    // A vocabulary whose values are created from what was typed stays put.
    expect(isCommonOptionCategory("Comic Era")).toBe(false);
    expect(isCommonOptionCategory("Label")).toBe(false);
  });

  it("follows /api/constants rather than a copy of the list", () => {
    applyConstants({ common_option_categories: ["Comic Era"] });
    expect(isCommonOptionCategory("Comic Era")).toBe(true);
    expect(isCommonOptionCategory("Character Group")).toBe(false);
  });
});

describe("categoriesForSubTab", () => {
  it("splits the categories across the three pickers with nothing lost", () => {
    const tags = categoriesForSubTab(ALL, "tags");
    const options = categoriesForSubTab(ALL, "options");
    const common = categoriesForSubTab(ALL, "common");
    expect(tags).toEqual(["Genre Main", "Genre Sub", "Label"]);
    expect(options).toEqual(["Comic Era", "Official Source"]);
    expect(common).toEqual([
      "Character Group",
      "Geography Group",
      "Needs Work Note",
      "Song Type",
    ]);
    expect([...tags, ...options, ...common].sort()).toEqual([...ALL].sort());
  });

  it("offers no categories on a sub-tab that has no category picker", () => {
    expect(categoriesForSubTab(ALL, "people")).toEqual([]);
    expect(categoriesForSubTab(ALL, "studios")).toEqual([]);
  });
});

describe("OPTION_SUB_TABS", () => {
  it("offers Options, Tags and Common Options", () => {
    expect(OPTION_SUB_TABS.map((t) => [t.key, t.label])).toEqual([
      ["options", "Options"],
      ["tags", "Tags"],
      ["common", "Common Options"],
    ]);
  });

  it("no longer offers Studios under System Option", () => {
    expect(OPTION_SUB_TABS.map((t) => t.key)).not.toContain("studios");
  });
});
