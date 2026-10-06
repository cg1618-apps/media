// Frontend: the character library's cards. Each character is one card, and
// each of its other identities is another card right after it - an identity
// is listed, searched and filtered as part of the same character, and links
// to the character's page with that identity highlighted.
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
        public_id: character.public_id,
        display_name: identity.display_name,
        character_display_name: character.display_name,
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
