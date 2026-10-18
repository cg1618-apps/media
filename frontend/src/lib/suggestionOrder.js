// Frontend: the order the Add/Modify forms' tags fields offer their values in
// - most used first - and which studios a studio field offers before anything
// is typed. Kept free of React so it is tested directly.
//
// The counts are `sources.usage`, GET /api/credits/usage, fetched once with
// the rest of the suggestion bag (lib/sources.js): per media type, how many
// visible entries of that type use each studio, publisher, person (per role)
// and vocabulary value, keyed by system_id. Nothing is counted per keystroke;
// typing only re-ranks (MultiSelect, through lib/suggest.js's rankByMatch).

// The vocabularies ordered by appearances: the genre and label tags. Every
// other vocabulary keeps the order its admin gave it (sort_order) - a
// platform or an imprint list is curated, a genre list is not.
export const APPEARANCE_ORDERED_CATEGORIES = new Set([
  "Genre Main",
  "Genre Sub",
  "Label",
  "Game Genre",
  "H Genre Plot",
  "H Genre Appearance",
  "H Genre Relation",
]);

/**
 * The media type a descriptor is counted under: its own `scope` when it has
 * one (person, publisher, a scoped vocabulary, the manga form's anime-studio
 * field), else the form's - `sources.mediaType`, which the Add and Modify
 * pages set to the open tab (withMediaType).
 */
export function usageType(sources, source) {
  return source?.scope || sources?.mediaType || null;
}

/**
 * `{system_id: count}` for this descriptor's values on its media type, or
 * null when the field is not ordered by appearances or the counts are not
 * loaded - the caller then keeps the list's own order.
 */
export function usageCounts(sources, source) {
  const type = usageType(sources, source);
  const byType = type ? sources?.usage?.[type] : null;
  if (!byType || !source) return null;
  switch (source.kind) {
    case "studio":
      return byType.studio || {};
    case "publisher":
      return byType.publisher || {};
    case "person":
      return byType.person?.[source.role] || {};
    case "option":
      return APPEARANCE_ORDERED_CATEGORIES.has(source.category)
        ? byType.option || {}
        : null;
    default:
      return null;
  }
}

/**
 * A sorted copy of `items` ({ id, name }): the most appearances first, ties
 * by name, case-insensitively. A value with no count sorts as 0.
 */
export function byAppearances(items, counts) {
  return [...items].sort(
    (a, b) =>
      (counts[b.id] ?? 0) - (counts[a.id] ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/**
 * The bag for one form: the same lists, with `mediaType` naming the type
 * the form edits, so a descriptor without a scope of its own (a studio, a
 * genre) is counted and scoped under it.
 */
export function withMediaType(sources, mediaType) {
  return { ...sources, mediaType };
}
