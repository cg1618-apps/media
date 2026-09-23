// Frontend: which h-comic fields a region uses.
//
// An h-comic is one type with two variants keyed on `region`, the pattern
// novel's `type` set (lib/novelUnits.js). The catalogue columns a region does
// not use are cleared on every write path by the server (REGION_CLEARS and
// LIST_REGION_CLEARS in app/services/domain/h_comic.py); this file is the
// form's half of the same rule, so the Add and Modify tabs never offer a field
// the save would throw away, and the detail page never renders one.
//
// Three kinds of field sit here:
//   - catalogue and reader columns the server clears (mirrored exactly);
//   - the KR-only credit and tag fields (author, official source), which the
//     server does not clear - the form clears them instead, so switching a KR
//     entry to JP does not leave an author credited on a work that has none;
//   - the region's own name column, which is hidden but never cleared: a name
//     is harmless, and keeping it lets a region change be undone.

export const H_COMIC_REGION_JP = "JP";
export const H_COMIC_REGION_KR = "KR";

// Fields only one region uses, per region. Anything not listed here is shown
// for both.
export const REGION_ONLY_FIELDS = Object.freeze({
  [H_COMIC_REGION_JP]: Object.freeze([
    "h_comic_name_jp",
    "originality",
    "animation_status",
    "series_number",
    "page_total",
    "page_fin",
  ]),
  [H_COMIC_REGION_KR]: Object.freeze([
    "h_comic_name_kr",
    "ch_total",
    "ch_behind",
    "ch_fin",
    "author",
    "original_source",
    "highlight_group_order",
  ]),
});

// Hidden but kept when the region changes (see the module comment).
const NEVER_CLEARED = new Set(["h_comic_name_jp", "h_comic_name_kr"]);

const OWNER = new Map(
  Object.entries(REGION_ONLY_FIELDS).flatMap(([region, fields]) =>
    fields.map((field) => [field, region])
  )
);

/**
 * Whether an entry (or form) of this region shows `field`.
 *
 * A field both regions use is always shown. A region-only field is shown only
 * on its region - and on none while the region is still unset, which is why
 * the forms ask for the region first.
 */
export function showsField(region, field) {
  const owner = OWNER.get(field);
  return !owner || owner === region;
}

/**
 * The form state with every field the region does not use blanked, ready to
 * build a payload from. Names are kept. The blank matches the field's shape:
 * `[]` for an array, `""` for anything else, which is how every form here
 * spells "unset".
 */
export function clearedForRegion(form) {
  const out = { ...form };
  for (const [field, owner] of OWNER) {
    if (owner === form.region || NEVER_CLEARED.has(field)) continue;
    if (!(field in out)) continue;
    out[field] = Array.isArray(out[field]) ? [] : "";
  }
  return out;
}

/**
 * The progress counter an entry of this region reads in: pages on JP,
 * chapters on KR. `null` while the region is unset.
 *
 * `{ finField, totalField, fin, total, unit, label }` - `total` is `null`
 * when unknown, `fin` is never `null`.
 */
export function progressFor(entry) {
  if (entry?.region === H_COMIC_REGION_JP) {
    return {
      finField: "page_fin",
      totalField: "page_total",
      fin: entry.page_fin ?? 0,
      total: entry.page_total ?? null,
      unit: "page",
      label: "Pages",
    };
  }
  if (entry?.region === H_COMIC_REGION_KR) {
    return {
      finField: "ch_fin",
      totalField: "ch_total",
      fin: entry.ch_fin ?? 0,
      total: entry.ch_total ?? null,
      unit: "ch",
      label: "Chapters",
    };
  }
  return null;
}
