// Frontend: a character's two tag lists - appearance and trait - between the
// API's arrays and the comma-joined strings MultiSelect edits; and the three
// firsts a character and an identity both carry (CHARACTER_FIRST_FIELDS).
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

// Where a character - or one of its identities - first turns up, as free
// text in whatever notation the work uses. An identity's are its own, never
// its character's. The order is the order they usually happen in.
export const CHARACTER_FIRST_FIELDS = [
  {
    field: "first_mention",
    label: "First Mention",
    hint: "First talked about or named, before being seen.",
  },
  {
    field: "first_appearance",
    label: "First Appearance",
    hint: "First shown at all, even a glimpse with no real part yet.",
  },
  {
    field: "first_encounter",
    label: "First Encounter",
    hint: "The main character first actually faces them: meets, talks, fights.",
  },
];

export const CHARACTER_FIRST_PLACEHOLDER = "第1卷 第13章, 1-13, S1 ep 8";

/** The form strings for a record's firsts ("" when unset). */
export function firstsToForm(record) {
  return Object.fromEntries(
    CHARACTER_FIRST_FIELDS.map(({ field }) => [field, record?.[field] || ""]),
  );
}

/** The POST/PUT body's firsts: trimmed, a blank one as null. */
export function firstsPayload(form) {
  return Object.fromEntries(
    CHARACTER_FIRST_FIELDS.map(({ field }) => [field, form?.[field]?.trim() || null]),
  );
}

/** The detail page's rows: only the firsts that are set, as InfoCard fields. */
export function firstsRows(record) {
  return CHARACTER_FIRST_FIELDS.filter(({ field }) => record?.[field]?.trim()).map(
    ({ field, label }) => ({ label, value: record[field] }),
  );
}
