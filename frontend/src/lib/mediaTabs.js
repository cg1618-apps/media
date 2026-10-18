// The media tab row on the franchise and series hubs, and the header totals
// taken over it.
//
// Each row is { label, type, entries, offered }: the tab's label, the media
// type key its entries are, the list it shows, and whether the page offers
// that type at all (default true). A tab appears when it is offered and its
// list holds something. Its count, the header's entry total and the header's
// completed count are all read from the same rows, so a tab cannot be added
// without being counted.
import { COMPLETED_STATUSES } from "../config/statusGroups";
import { MEDIA_CONFIG } from "../config/mediaRegistry";

/** Whether `entry`, of media type `type`, is finished by its own status field. */
export function isCompleted(type, entry) {
  const field = MEDIA_CONFIG[type]?.statusField;
  return field != null && COMPLETED_STATUSES.includes(entry?.[field]);
}

export function buildMediaTabs(rows) {
  const shown = rows.filter(
    ({ entries, offered = true }) => offered && entries.length > 0,
  );
  const counts = new Map(
    shown.map(({ label, entries }) => [label, entries.length]),
  );
  const total = shown.reduce((sum, { entries }) => sum + entries.length, 0);
  const completed = shown.reduce(
    (sum, { type, entries }) =>
      sum + entries.filter((entry) => isCompleted(type, entry)).length,
    0,
  );
  return {
    tabs: shown.map(({ label }) => label),
    countOf: (tab) => counts.get(tab) ?? 0,
    total,
    completed,
  };
}
