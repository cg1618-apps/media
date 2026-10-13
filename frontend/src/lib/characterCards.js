// Frontend: the character library's cards. Each character is one card, and
// each of its other identities is another card. The function emits each
// identity right after its character; the library's sort decides the order
// shown (an identity card sorts by its own name). An identity is listed,
// searched and filtered as part of the same character, and links to its own
// identity page.
import { CHARACTER_ROLES } from "../config/fieldOptions";
import { PERSON_NAME_FIELDS } from "./naming";

export const CARD_KIND_CHARACTER = "Characters";
export const CARD_KIND_IDENTITY = "Identities";
export const HAS_IDENTITIES = "Has identities";
export const NO_IDENTITIES = "No identities";

function namesOf(row) {
  return PERSON_NAME_FIELDS.map(({ field }) => row[field]).filter(Boolean);
}

export function characterCards(characters) {
  const cards = [];
  for (const character of characters || []) {
    const identities = character.identities || [];
    // Every card of one character answers to every name it goes by.
    const searchNames = [...namesOf(character), ...identities.flatMap(namesOf)];
    cards.push({
      ...character,
      card_kind: "character",
      card_id: character.system_id,
      has_identities: identities.length > 0,
      search_names: searchNames,
    });
    for (const identity of identities) {
      cards.push({
        // The character's filterable facts: an identity is the same
        // character, so its tags, rating, role and entry types are its.
        my_rating: character.my_rating,
        role: character.role,
        media_types: character.media_types,
        restricted: character.restricted,
        appearance: character.appearance,
        trait: character.trait,
        casting_count: character.casting_count,
        // Its own face and name.
        card_kind: "identity",
        card_id: identity.system_id,
        system_id: identity.system_id,
        identity_id: identity.system_id,
        // The identity's own, so the card links to the identity page; the
        // character's stays beside it.
        public_id: identity.public_id,
        character_public_id: character.public_id,
        display_name: identity.display_name,
        character_display_name: character.display_name,
        // The character's face, for the card's footer. Named apart from the
        // identity's own display_photo_* pair, which is the cover.
        character_photo_file: character.display_photo_file ?? character.photo_file ?? null,
        character_photo_focus: character.display_photo_focus ?? character.photo_focus ?? null,
        gender: identity.display_gender,
        display_photo_file: identity.display_photo_file,
        display_photo_focus: identity.display_photo_focus,
        has_identities: true,
        search_names: searchNames,
      });
    }
  }
  return cards;
}

const NO_ROLE = "No role";

// The franchise and series hubs' Characters tab: the cards in one group per
// role, CHARACTER_ROLES order, then the characters with no role. Inside a
// group characters sort by name and each identity follows its character. The
// role is the character's own (what they are to the story overall), not one
// casting's.
export function characterCardsByRole(characters) {
  const sorted = [...(characters || [])].sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || ""),
  );
  return [...CHARACTER_ROLES, NO_ROLE]
    .map((label) => ({
      label,
      cards: characterCards(
        sorted.filter((c) =>
          label === NO_ROLE ? !CHARACTER_ROLES.includes(c.role) : c.role === label,
        ),
      ),
    }))
    .filter((group) => group.cards.length > 0);
}
