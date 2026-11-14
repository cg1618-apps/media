// Frontend: statistics page file for hentaiCompletions.
//
// A hentai's completions, grouped by what it adapts, in vocabulary order, with
// the unrecorded ones last. Pure, so the grouping is testable without
// rendering the page.

import { HENTAI_SOURCE_MATERIALS } from "../../config/fieldOptions";
import { COMPLETED_STATUSES } from "../../utils/media";

export const UNRECORDED = "Unrecorded";

// Reads HENTAI_SOURCE_MATERIALS at call time: /api/constants overwrites the
// array in place after mount, so a value the server adds is grouped too.
export default function hentaiCompletionGroups(allHentai) {
  const completed = (allHentai || [])
    .filter((h) => COMPLETED_STATUSES.includes(h.watching_status) && h.completed_at)
    .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
  const bySource = {};
  for (const h of completed) {
    const key = HENTAI_SOURCE_MATERIALS.includes(h.source_material)
      ? h.source_material
      : UNRECORDED;
    (bySource[key] ||= []).push(h);
  }
  return [...HENTAI_SOURCE_MATERIALS, UNRECORDED]
    .filter((key) => bySource[key]?.length)
    .map((key) => ({ key, label: key, items: bySource[key] }));
}
