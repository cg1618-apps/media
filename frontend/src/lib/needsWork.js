// Frontend: what can carry a 待補充 Needs Work mark.
//
// Every entry of the twelve media types and the three grouping tiers - the
// OWNER_TABLES keys on the backend (app/utils/media_resolver.py), which
// /api/needs-work/{owner_type}/{owner_id} accepts.
import { MEDIA_TYPE_LABELS } from "../config/mediaRegistry";

// The Tier 2 category of common notes (NEEDS_WORK_NOTE_CATEGORY in
// app/utils/credit_roles.py): offered as one-click picks and suggestions
// beside the note field, edited on the Options tab. The note stays free text.
export const NEEDS_WORK_NOTE_CATEGORY = "Needs Work Note";

export const NEEDS_WORK_OWNER_TYPES = new Set([
  ...Object.keys(MEDIA_TYPE_LABELS),
  "collection",
  "franchise",
  "series",
]);

export const OTHER_NOTES = "Other";
export const NO_NOTE = "No note";

/**
 * The Needs Work page's sections, from the server's one-group-per-note list
 * (`[{ note, items }]`) and the common notes in their option order.
 *
 * A note that is one of the common notes keeps a section of its own, in the
 * option's order; every other note goes into one Other section, its rows in
 * the server's order; the unnoted marks come last, in No note. A section
 * with no marks is left out. Each section is `{ key, label, kind, items }`,
 * `kind` one of "common", "other", "none".
 */
export function needsWorkSections(groups, commonNotes) {
  const common = [...new Set(commonNotes ?? [])];
  const byNote = new Map();
  const other = [];
  let unnoted = [];
  for (const group of groups ?? []) {
    if (group.note == null) unnoted = group.items;
    else if (common.includes(group.note)) byNote.set(group.note, group.items);
    else other.push(...group.items);
  }
  const sections = common
    .filter((note) => byNote.get(note)?.length)
    .map((note) => ({ key: `common:${note}`, label: note, kind: "common", items: byNote.get(note) }));
  if (other.length) sections.push({ key: "other", label: OTHER_NOTES, kind: "other", items: other });
  if (unnoted.length) sections.push({ key: "none", label: NO_NOTE, kind: "none", items: unnoted });
  return sections;
}
