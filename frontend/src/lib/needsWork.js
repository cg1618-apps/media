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
