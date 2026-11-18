// Frontend: the franchise and series an entry form's save creates for it.
//
// When an Add or Modify form names a franchise or a series that does not
// exist, the save offers to create it (useGroupQuickCreate). The names it
// offers are the entry's own: a franchise takes all five of the entry's
// names, a series its EN, CN and Alt names. The owner may edit them in the
// confirmation before anything is written, and may give the franchise more
// franchise types than the one the entry's media type implies - only types
// of the same family, since the server refuses a franchise_type that spans
// two (FRANCHISE_FAMILY_FOR_TYPE).
import { FRANCHISE_FAMILY_FOR_TYPE } from "./gatedTypes";

// Every name a franchise and a series carry, in the order the forms show them.
export const GROUP_NAME_KEYS = ["en", "cn", "roman", "jp", "alt"];

// The entry names a new series is filled from.
export const SERIES_AUTOFILL_KEYS = ["en", "cn", "alt"];

/**
 * The `{ en, cn, roman, jp, alt }` names a group is filled from: `form`'s
 * `<prefix>_name_<key>` for each of `keys`, "" for every other key and for a
 * name the entry does not have.
 */
export function entryGroupNames(form, prefix, keys = GROUP_NAME_KEYS) {
  return Object.fromEntries(
    GROUP_NAME_KEYS.map((key) => [
      key,
      keys.includes(key) ? form?.[`${prefix}_name_${key}`] || "" : "",
    ]),
  );
}

/** Whether at least one of `names` holds more than whitespace. */
export function hasAnyName(names) {
  return GROUP_NAME_KEYS.some((key) => (names?.[key] || "").trim());
}

// Each name as the create body carries it: trimmed, and null when blank.
function namesBody(kind, names) {
  return Object.fromEntries(
    GROUP_NAME_KEYS.map((key) => [`${kind}_name_${key}`, (names?.[key] || "").trim() || null]),
  );
}

/** The POST /api/franchise/ body for `names` and `types`. */
export function franchiseCreateBody(names, types) {
  return {
    ...namesBody("franchise", names),
    franchise_type: types.length ? types.join(", ") : null,
  };
}

/** The POST /api/series/ body for `names`, under `franchiseId`. */
export function seriesCreateBody(franchiseId, names) {
  return { franchise_id: franchiseId, ...namesBody("series", names) };
}

/**
 * The franchise types the confirmation offers: those of `visibleTypes` in the
 * same family as `anchor` (the implied type), in vocabulary order.
 */
export function offeredFranchiseTypes(visibleTypes, anchor) {
  const family = FRANCHISE_FAMILY_FOR_TYPE[anchor] ?? null;
  return visibleTypes.filter((t) => (FRANCHISE_FAMILY_FOR_TYPE[t] ?? null) === family);
}

/** `types` in the order `vocabulary` lists them, any it does not list last. */
export function orderTypes(types, vocabulary) {
  const rank = (t) => {
    const i = vocabulary.indexOf(t);
    return i === -1 ? vocabulary.length : i;
  };
  return [...new Set(types)].sort((a, b) => rank(a) - rank(b));
}
