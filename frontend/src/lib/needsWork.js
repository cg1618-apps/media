// Frontend: what can carry a 待補充 Needs Work mark.
//
// Every entry of the twelve media types and the three grouping tiers - the
// OWNER_TABLES keys on the backend (app/utils/media_resolver.py), which
// /api/needs-work/{owner_type}/{owner_id} accepts.
import { MEDIA_TYPE_LABELS } from "../config/mediaRegistry";

export const NEEDS_WORK_OWNER_TYPES = new Set([
  ...Object.keys(MEDIA_TYPE_LABELS),
  "collection",
  "franchise",
  "series",
]);
