// A character's appearance and trait lists, between the API's arrays and the
// comma-joined strings the form's MultiSelects edit.
import { describe, expect, it } from "vitest";

import {
  CHARACTER_TAG_FIELDS,
  characterTagsPayload,
  characterTagsToForm,
} from "./characterForm";

describe("CHARACTER_TAG_FIELDS", () => {
  it("draws each list from its own option category", () => {
    expect(CHARACTER_TAG_FIELDS.map((f) => [f.field, f.category])).toEqual([
      ["appearance", "Character Appearance"],
      ["trait", "Character Trait"],
    ]);
  });
});

describe("characterTagsToForm", () => {
  it("joins each array in its served order", () => {
    expect(
      characterTagsToForm({ appearance: ["Red Hair", "Glasses"], trait: ["Kuudere"] }),
    ).toEqual({ appearance: "Red Hair, Glasses", trait: "Kuudere" });
  });

  it("gives an empty string for an empty or missing list", () => {
    expect(characterTagsToForm({ appearance: [] })).toEqual({ appearance: "", trait: "" });
  });
});

describe("characterTagsPayload", () => {
  it("splits each string into trimmed, non-empty values in picked order", () => {
    expect(
      characterTagsPayload({ appearance: " Glasses ,, Red Hair ", trait: "Kuudere" }),
    ).toEqual({ appearance: ["Glasses", "Red Hair"], trait: ["Kuudere"] });
  });

  // The server replaces a list wholesale, so an emptied field must clear it:
  // [] is sent, never null and never left out.
  it("sends an emptied list as []", () => {
    expect(characterTagsPayload({ appearance: "", trait: undefined })).toEqual({
      appearance: [],
      trait: [],
    });
  });

  it("round-trips a response through the form", () => {
    const character = { appearance: ["Glasses", "Red Hair"], trait: ["Kuudere"] };
    expect(characterTagsPayload(characterTagsToForm(character))).toEqual(character);
  });
});
