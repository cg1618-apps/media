// Cover image URL resolution and the no-image fallback.

const FALLBACK_SVG = `data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%25%22 height=%22100%25%22%3E%3Crect width=%22100%25%22 height=%22100%25%22 fill=%22%23E5E7EB%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2212%22 fill=%22%236B7280%22 font-weight=%22bold%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22%3ENo Image%3C/text%3E%3C/svg%3E`;

export { FALLBACK_SVG };

export function isLocalHost() {
  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

// Covers are served by the app's own /api/covers/ route, NOT from /static/.
// A cover's key is `<owner_type>/<system_id>.jpg`, so its URL can be built by
// anyone who learns an entry id - and the cover is what a content label exists
// to hide. static/covers/ is therefore not mounted at all, and the route
// applies the same visibility gates the API does (app/routers/covers.py).
// Library uploads keep /static/: their names are content hashes, so nothing
// about an entry yields one.
//
// The key reaching this function comes from one of two places, and each is
// relative to a different root:
//   - image.storage_key (the image table): relative to static/ - a library
//     upload is `library/<sha>.jpg`, a backfilled legacy row is already
//     `covers/<owner_type>/<id>.jpg`.
//   - a legacy mirror column (media.cover_image_file, person.photo_file, ...):
//     relative to static/covers/, with no prefix - `<owner_type>/<id>.jpg`.
// So a value that already starts with "covers/" must have that segment
// stripped rather than repeated - doing neither doubles it and 404s. Do not
// delete either branch as redundant with the other; they resolve keys from
// two different roots that both call this function.
export function getCoverUrl(coverFile) {
  if (!coverFile || coverFile === "N/A") return FALLBACK_SVG;
  // Library images are not covers and do not live in the cover tree.
  if (coverFile.startsWith("library/")) return `/static/${coverFile}`;
  // Backfilled image.storage_key values already carry the covers/ prefix.
  if (coverFile.startsWith("covers/")) return `/api/${coverFile}`;
  return `/api/covers/${coverFile}`;
}

// Quote images live on local disk under static/quotes/.
// Returning null off localhost hides every quote-image control away from the
// dev machine. That gate is a deliberate hold, not a hosting constraint - it is
// to be revisited when self-hosting lands. Callers just check for null.
export function getQuoteImageUrl(imageFile) {
  if (!imageFile || imageFile === "N/A") return null;
  // Uploaded images resolve everywhere. The localhost hold below exists because
  // there was no way to get a file onto the machine at all - which is the thing
  // upload removes - so it does not apply to library keys.
  if (imageFile.startsWith("library/")) return `/static/${imageFile}`;
  // Same split as getCoverUrl: a backfilled image.storage_key already carries
  // covers/, and the cover tree is served by /api/covers/, not by static/.
  if (imageFile.startsWith("covers/")) return `/api/${imageFile}`;
  if (!isLocalHost()) return null;
  return `/static/quotes/${imageFile}`;
}

// ---------------------------------------------------------------------------
// Grouping-tier cover resolution (Franchise, Collection)
//
// Extracted verbatim from FranchiseLibrary.jsx so the Collection library can
// reuse the exact same fallback rules instead of duplicating them.
// ---------------------------------------------------------------------------

/** Best-effort release year, used to prefer the newest entry as a cover. */
export function getEntryYear(entry) {
  const d =
    entry.release_date_jp ||
    entry.release_date_tw ||
    entry.release_date_usa ||
    entry.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

/**
 * Tag a fetched entry list with the media type it was fetched as, which the
 * API payloads do not carry. Only the cover fallback needs it.
 */
export function withMediaType(entries, mediaType) {
  return entries.map((e) => ({ ...e, media_type: mediaType }));
}

// ---------------------------------------------------------------------------
// Focal points
//
// Every owner image (an entry's cover, a person's photo, a studio's logo) is
// rendered cropped with object-cover, which shows the centre unless told
// otherwise. Its focus - "X% Y%", stored beside the key it qualifies
// (cover_image_file -> cover_image_focus, photo_file -> photo_focus, ...) - is
// the CSS object-position that keeps the subject in frame. null is centred.
// ---------------------------------------------------------------------------

/** The inline style that applies a focal point; undefined when centred. */
export function focusStyle(focus) {
  return focus ? { objectPosition: focus } : undefined;
}

const CENTRE = Object.freeze({ x: 50, y: 50 });
const FOCUS_PATTERN = /^\s*(\d{1,3})%\s+(\d{1,3})%\s*$/;

function clampPercent(n) {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** "X% Y%" -> { x, y }; anything else (null, "", malformed) is the centre. */
export function parseFocus(focus) {
  const m = typeof focus === "string" ? FOCUS_PATTERN.exec(focus) : null;
  if (!m) return CENTRE;
  return { x: clampPercent(Number(m[1])), y: clampPercent(Number(m[2])) };
}

/**
 * { x, y } -> "X% Y%", clamped to whole percentages in 0..100. The centre is
 * null rather than "50% 50%": a centred image stores no focus at all.
 */
export function formatFocus({ x, y }) {
  const cx = clampPercent(x);
  const cy = clampPercent(y);
  if (cx === CENTRE.x && cy === CENTRE.y) return null;
  return `${cx}% ${cy}%`;
}

/**
 * The resolved cover of a group (franchise, series, collection, favourite
 * slot): the URL it borrows and the focus of the entry it borrowed it from.
 * Every group resolver below returns this shape.
 */
export const NO_COVER = Object.freeze({ url: FALLBACK_SVG, focus: null });

function hasStoredCover(entry) {
  return Boolean(entry?.cover_image_file && entry.cover_image_file !== "N/A");
}

/** An entry's own stored cover, with its focus. */
export function entryCover(entry) {
  if (!hasStoredCover(entry)) return NO_COVER;
  return {
    url: getCoverUrl(entry.cover_image_file),
    focus: entry.cover_image_focus || null,
  };
}

/**
 * Cover key for an entry that has no cover_image_file of its own.
 * Callers must tag entries with the media type they were fetched as - the API
 * payloads do not carry one, and without it there is no folder to look in.
 * A convention cover has no stored focus, so it is centred.
 */
function conventionCover(entry) {
  if (!entry.media_type) return NO_COVER;
  return {
    url: getCoverUrl(`${entry.media_type}/${entry.system_id}.jpg`),
    focus: null,
  };
}

/** The newest of `entries` that has a stored cover, or null. */
function newestWithCover(entries) {
  const withCovers = entries.filter(hasStoredCover);
  if (withCovers.length === 0) return null;
  withCovers.sort((a, b) => getEntryYear(b) - getEntryYear(a));
  return withCovers[0];
}

/**
 * Resolve a franchise's cover:
 *   1. its explicitly chosen cover_entry_id
 *   2. else the newest member entry that has a cover image
 *   3. else the newest member entry by convention filename
 *   4. else the placeholder
 *
 * Covers live under owner-typed subfolders, so the convention filename is
 * `<media_type>/<system_id>.jpg`: the id alone no longer names a file. An
 * entry that arrives without a media_type falls through to the placeholder
 * rather than to a guessed, broken URL.
 *
 * Returns `{ url, focus }` (see NO_COVER).
 */
export function getFranchiseCover(
  franchise,
  allEntriesDict,
  allEntriesByFranchise,
) {
  if (franchise.cover_entry_id) {
    const coverEntry = allEntriesDict[franchise.cover_entry_id];
    if (coverEntry) {
      if (hasStoredCover(coverEntry)) return entryCover(coverEntry);
      return conventionCover(coverEntry);
    }
  }
  const entries = allEntriesByFranchise[franchise.system_id] || [];
  const newest = newestWithCover(entries);
  if (newest) return entryCover(newest);
  if (entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => getEntryYear(b) - getEntryYear(a),
    );
    return conventionCover(sorted[0]);
  }
  return NO_COVER;
}

/**
 * Resolve a series's cover:
 *   1. its explicitly chosen cover_entry_id (searched across all provided entries)
 *   2. else the newest entry among those that has a cover image
 *   3. else the placeholder
 *
 * Unlike getFranchiseCover, entries are passed as a single combined list -
 * SeriesPage loads one flat array per media type it can hold (anime, movies,
 * TV shows, cartoons, manga, novels, comics, games) with no per-franchise
 * grouping, so there is no "convention filename" fallback to key off. The
 * caller must pass every one of them: a series whose chosen cover_entry_id
 * points at a type left out of the list silently falls back to the
 * placeholder.
 *
 * Returns `{ url, focus }` (see NO_COVER).
 */
export function getSeriesCover(series, entries) {
  if (series.cover_entry_id) {
    const coverEntry = entries.find(
      (e) => e.system_id === series.cover_entry_id,
    );
    if (hasStoredCover(coverEntry)) return entryCover(coverEntry);
  }
  const newest = newestWithCover(entries);
  return newest ? entryCover(newest) : NO_COVER;
}

/**
 * Resolve a collection's cover by delegating to a member franchise:
 *   1. its chosen cover_franchise_id, resolved via getFranchiseCover
 *   2. else the first member franchise (by name) that yields a real cover
 *   3. else the placeholder
 *
 * Returns `{ url, focus }` (see NO_COVER).
 */
export function getCollectionCover(
  collection,
  memberFranchises,
  allEntriesDict,
  allEntriesByFranchise,
) {
  const resolve = (f) =>
    getFranchiseCover(f, allEntriesDict, allEntriesByFranchise);

  if (collection.cover_franchise_id) {
    const chosen = memberFranchises.find(
      (f) => f.system_id === collection.cover_franchise_id,
    );
    if (chosen) {
      const cover = resolve(chosen);
      if (cover.url !== FALLBACK_SVG) return cover;
    }
  }
  for (const f of memberFranchises) {
    const cover = resolve(f);
    if (cover.url !== FALLBACK_SVG) return cover;
  }
  return NO_COVER;
}
