import { describe, it, expect, afterEach } from "vitest";

import {
  NOTE_SUGGESTION_CATEGORIES,
  TAG_CATEGORIES,
  applyConstants,
} from "../config/fieldOptions";
import {
  categoriesForSubTab,
  isNoteSuggestionCategory,
  isTagCategory,
} from "./optionCategoryGroups";
import { OPTION_SUB_TABS } from "../components/forms/OptionSubTabBar";

// applyConstants mutates TAG_CATEGORIES and NOTE_SUGGESTION_CATEGORIES in
// place, so restore their real contents after any test that overwrites them.
const ORIGINAL_TAG_CATEGORIES = [...TAG_CATEGORIES];
const ORIGINAL_NOTE_SUGGESTION_CATEGORIES = [...NOTE_SUGGESTION_CATEGORIES];
afterEach(() => {
  applyConstants({
    tag_categories: ORIGINAL_TAG_CATEGORIES,
    note_suggestion_categories: ORIGINAL_NOTE_SUGGESTION_CATEGORIES,
  });
});

const ALL = [
  "Character Group",
  "Comic Era",
  "Genre Main",
  "Genre Sub",
  "Geography Group",
  "Label",
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

describe("isNoteSuggestionCategory", () => {
  it("recognises the note sections' field suggestions, before /api/constants answers", () => {
    for (const c of ["Character Group", "Collectible Type", "Item Type", "Geography Group"]) {
      expect(isNoteSuggestionCategory(c)).toBe(true);
    }
    // A section-level note suggestion stays under Options.
    expect(isNoteSuggestionCategory("Song Type")).toBe(false);
  });

  it("follows /api/constants rather than a copy of the list", () => {
    applyConstants({ note_suggestion_categories: ["Song Type"] });
    expect(isNoteSuggestionCategory("Song Type")).toBe(true);
    expect(isNoteSuggestionCategory("Character Group")).toBe(false);
  });
});

describe("categoriesForSubTab", () => {
  it("splits the categories across the three pickers with nothing lost", () => {
    const tags = categoriesForSubTab(ALL, "tags");
    const options = categoriesForSubTab(ALL, "options");
    const notes = categoriesForSubTab(ALL, "notes");
    expect(tags).toEqual(["Genre Main", "Genre Sub", "Label"]);
    expect(options).toEqual(["Comic Era", "Official Source", "Song Type"]);
    expect(notes).toEqual(["Character Group", "Geography Group"]);
    expect([...tags, ...options, ...notes].sort()).toEqual([...ALL].sort());
  });

  it("offers no categories on a sub-tab that has no category picker", () => {
    expect(categoriesForSubTab(ALL, "people")).toEqual([]);
    expect(categoriesForSubTab(ALL, "studios")).toEqual([]);
  });
});

describe("OPTION_SUB_TABS", () => {
  it("offers Options, Tags and Note Suggestions", () => {
    expect(OPTION_SUB_TABS.map((t) => [t.key, t.label])).toEqual([
      ["options", "Options"],
      ["tags", "Tags"],
      ["notes", "Note Suggestions"],
    ]);
  });

  it("no longer offers Studios under System Option", () => {
    expect(OPTION_SUB_TABS.map((t) => t.key)).not.toContain("studios");
  });
});
