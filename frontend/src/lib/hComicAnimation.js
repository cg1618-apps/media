// Frontend: an h-comic's animation status, hand-set or derived.
//
// While a hentai adapts an h-comic - a stored relation
// `hentai -adaptation-> h-comic` - the server serves a DERIVED status
// (`Animated` once any adapting hentai has aired, `Announced` before) and
// says so in `animation_status_source`; a write naming any other value is
// refused (422). Without one the status is hand-set ("manual"), and a KR
// entry has none at all (null). See docs/entry-types.md.

/** True when the served status comes from an adapting hentai. */
export function isDerivedAnimationStatus(entry) {
  return entry?.animation_status_source === "derived";
}

/**
 * The hentai entries a relation card's rows name as adapting this h-comic:
 * the stored rows only (a derived row is a peer implied by a chain, not an
 * adaptation), read from the h-comic's side, where the stored
 * `hentai -> h-comic` row arrives as `reverse`. Each is the row's `other`
 * endpoint, carrying `display_name` and `nav_path`.
 */
export function adaptingHentai(rows) {
  return (rows || [])
    .filter(
      (row) =>
        row.relation_type === "adaptation" &&
        row.direction === "reverse" &&
        !row.derived &&
        row.other?.media_type === "hentai" &&
        !row.other.missing
    )
    .map((row) => row.other);
}
