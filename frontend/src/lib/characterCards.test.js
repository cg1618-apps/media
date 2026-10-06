import { describe, expect, it } from "vitest";
import { characterCards } from "./characterCards";

const shinichi = {
  system_id: "c1", public_id: 7, display_name: "Kudo Shinichi", name_en: "Kudo Shinichi",
  gender: "男", my_rating: "A", role: "Main", media_types: ["anime"], appearance: ["glasses"], trait: [],
  casting_count: 3, display_photo_file: "character/c1.jpg",
  identities: [{ system_id: "i1", display_name: "Edogawa Conan", name_en: "Edogawa Conan", name_jp: "江戸川コナン",
    display_gender: "男", display_photo_file: "character-identity/i1.jpg", display_photo_focus: null }],
};
const ran = { system_id: "c2", public_id: 8, display_name: "Mouri Ran", name_en: "Mouri Ran", identities: [] };

describe("characterCards", () => {
  it("emits each identity card right after its character", () => {
    expect(characterCards([shinichi, ran]).map((c) => c.display_name)).toEqual([
      "Kudo Shinichi", "Edogawa Conan", "Mouri Ran",
    ]);
  });

  it("an identity card links to its character and inherits its filterable fields", () => {
    const card = characterCards([shinichi])[1];
    expect(card).toMatchObject({
      card_kind: "identity", public_id: 7, identity_id: "i1", character_display_name: "Kudo Shinichi",
      display_photo_file: "character-identity/i1.jpg", appearance: ["glasses"], my_rating: "A",
    });
  });

  it("every card of one character is found by any of that character's names", () => {
    const cards = characterCards([shinichi]);
    for (const card of cards) {
      expect(card.search_names).toEqual(expect.arrayContaining(["Kudo Shinichi", "Edogawa Conan", "江戸川コナン"]));
    }
  });

  it("marks whether a character has identities", () => {
    const [shinichiCard, , ranCard] = characterCards([shinichi, ran]);
    expect(shinichiCard.has_identities).toBe(true);
    expect(ranCard.has_identities).toBe(false);
  });
});
