// Frontend: the gated media types, and the one question every surface asks
// about them.
//
// A gated type is a media type whose every entry carries a required content
// label (REQUIRED_LABEL_FOR_TYPE in app/services/rbac/gated_types.py) - today
// `h-comic` and `hentai`. A session whose access mode lacks that label is not told
// the type exists: the server withholds its entries, its vocabularies and its
// constants, and `/api/auth/me` names in `visible_gated_types` only the gated
// types the session MAY see.
//
// So the SPA never decides visibility itself. It asks `canSeeGatedType`, which
// reads that list, and every surface that could name a gated type - the nav,
// both routes, the type pickers, the search tabs, the statistics chips - asks
// through here rather than testing `"h-comic"` inline. Hiding in the UI is
// cosmetic: the server has already refused what the viewer may not read.

// Every gated media type the frontend knows how to render. A type that is not
// listed here is ungated and always visible.
export const GATED_TYPES = Object.freeze(["h-comic", "hentai"]);

// Franchise types stamped only for a gated media type (FRANCHISE_TYPE_FOR on
// the backend). A franchise-type picker offers one only when its media type
// is visible.
export const GATED_FRANCHISE_TYPES = Object.freeze({
  "H-Comic": "h-comic",
  Hentai: "hentai",
});

const GATED = new Set(GATED_TYPES);

// Franchise FAMILIES (FRANCHISE_FAMILY_FOR_TYPE in app/utils/constants.py):
// which franchise types may share one franchise. An h-comic and its hentai
// adaptation share one the way a manga and its anime do, so H-Comic and
// Hentai are one family; a type not listed is mainstream. The server refuses
// an entry written into a franchise of another family, so a gated type's
// franchise picker offers only its own family's franchises.
export const FRANCHISE_FAMILY_FOR_TYPE = Object.freeze({
  "H-Comic": "h-comic",
  Hentai: "h-comic",
});

/**
 * True when a franchise whose `franchise_type` is this comma-joined list
 * ("H-Comic, Hentai") belongs to `family`.
 */
export function inFranchiseFamily(franchiseType, family) {
  return String(franchiseType || "")
    .split(",")
    .map((t) => t.trim())
    .some((t) => FRANCHISE_FAMILY_FOR_TYPE[t] === family);
}

/** True when `type` is one of the gated media types. */
export function isGatedType(type) {
  return GATED.has(type);
}

/**
 * May this session see media type `type`?
 *
 * `auth` is the AuthContext value (or anything carrying
 * `visibleGatedTypes`). An ungated type is always visible; a gated one only
 * when the server named it. A missing list means none - a session whose
 * `/api/auth/me` has not answered yet is shown nothing gated rather than
 * everything.
 */
export function canSeeGatedType(auth, type) {
  if (!GATED.has(type)) return true;
  const visible = auth?.visibleGatedTypes;
  return Array.isArray(visible) && visible.includes(type);
}

/** `types` without the gated ones this session may not see. */
export function visibleMediaTypes(auth, types) {
  return types.filter((type) => canSeeGatedType(auth, type));
}

/**
 * The same filter over any list of objects naming a media type, e.g. the
 * `{ key, label }` tabs of the search page or `{ value, label }` pickers.
 * `keyOf` picks the type out of one item.
 */
export function visibleByType(auth, items, keyOf = (item) => item.key) {
  return items.filter((item) => canSeeGatedType(auth, keyOf(item)));
}

/** Franchise types, without those stamped only for a hidden gated type. */
export function visibleFranchiseTypes(auth, franchiseTypes) {
  return franchiseTypes.filter((ft) => {
    const gated = GATED_FRANCHISE_TYPES[ft];
    return !gated || canSeeGatedType(auth, gated);
  });
}

// The content label each gated type requires (REQUIRED_LABEL_FOR_TYPE on the
// backend). Every entry of the type carries it, and so does every franchise
// of its franchise type; the content-label endpoints refuse (422) a new set
// that drops it. So the label pickers lock it on, and the savers add it back
// rather than let a save the admin never touched fail.
export const REQUIRED_LABEL_FOR_TYPE = Object.freeze({
  "h-comic": "h-comic",
  hentai: "hentai",
});

/** The labels an entry of `mediaType` must carry: [] for an ungated type. */
export function requiredLabelsForType(mediaType) {
  const label = REQUIRED_LABEL_FOR_TYPE[mediaType];
  return label ? [label] : [];
}

/**
 * The labels a franchise of this `franchise_type` must carry. The column is a
 * comma-joined list ("ACG, Game"), and a franchise that names a gated
 * franchise type anywhere in it carries that type's label.
 */
export function requiredLabelsForFranchiseType(franchiseType) {
  const named = String(franchiseType || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  return [
    ...new Set(
      named.flatMap((ft) =>
        GATED_FRANCHISE_TYPES[ft] ? requiredLabelsForType(GATED_FRANCHISE_TYPES[ft]) : []
      )
    ),
  ];
}
