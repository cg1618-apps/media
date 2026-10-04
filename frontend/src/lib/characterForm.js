// Frontend: a character's two tag lists - appearance and trait - between the
// API's arrays and the comma-joined strings MultiSelect edits.
//
// One place for both directions, so the Add page's POST and the Modify tab's
// load and PUT cannot disagree about either list. Each list draws on its own
// system_option category, the same one for every character. A value not yet
// in the vocabulary is created by the character write itself, so neither
// page runs ensureSourceValues for these.
export const CHARACTER_TAG_FIELDS = [
  { field: "appearance", label: "Appearance", category: "Character Appearance" },
  { field: "trait", label: "Trait", category: "Character Trait" },
];

function splitList(raw) {
  return (raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The form strings for a character response's tag arrays ("" when absent). */
export function characterTagsToForm(character) {
  return Object.fromEntries(
    CHARACTER_TAG_FIELDS.map(({ field }) => [
      field,
      (character?.[field] || []).join(", "),
    ]),
  );
}

/**
 * The POST/PUT body's tag arrays from the form strings: trimmed, non-empty,
 * in the order picked. An empty list is sent as [] - it clears the list,
 * since the server replaces each list wholesale.
 */
export function characterTagsPayload(form) {
  return Object.fromEntries(
    CHARACTER_TAG_FIELDS.map(({ field }) => [field, splitList(form?.[field])]),
  );
}
