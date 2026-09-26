// Frontend: the restricted sources each media type is prefilled with and
// offers.
//
// Restricted sources are free text (bucket "restricted"), so these are
// suggestions rather than a vocabulary. Nothing on the server knows the list -
// a stored row is a typed name like any other. Per type there are two lists:
//
//   - `prefill`: the names every entry has. A new entry's form starts with one
//     untouched row for each, and the editor's Prefill button adds whichever
//     are missing - which is how an existing entry gets them on Modify.
//   - `suggestions`: every name the type offers while typing, `prefill` first.
//     A name only here is offered, never added on its own.
//
// Choosing a name fills the row's text and nothing more, so it can still be
// edited for that one entry; the list itself does not change.
//
// Which rows a form holds is the owner's once they touch it. So h-comic's Add
// form follows the region only with rows that are still UNTOUCHED - a
// suggested name with no url - and never removes a row that has one, or a name
// the suggestions do not contain.
import { H_COMIC_REGION_KR } from "./hComicRegion";

const GIMY = "Gimy";

// Per media type (the data layer's hyphenated keys): the names every entry
// has, then the names that are only offered. A type not listed has neither.
const RESTRICTED_SOURCES = Object.freeze({
  anime: { prefill: [GIMY, "Anime1"], optional: [] },
  "anime-movie": { prefill: [GIMY, "Anime1"], optional: [] },
  "tv-show": { prefill: [GIMY], optional: [] },
  movie: { prefill: [GIMY], optional: [] },
  cartoon: { prefill: [GIMY], optional: [] },
  manga: {
    prefill: ["漫畫櫃 (電腦版)", "漫畫櫃 (手機版)", "漫畫人"],
    optional: ["包子漫畫"],
  },
  novel: {
    prefill: [],
    optional: [
      "bili嗶哩輕小說",
      "無限輕小說",
      "無限小說",
      "輕小說文庫",
      "真白萌",
      "和圖書",
      "小說狂人",
      "全本小說",
    ],
  },
  comic: { prefill: ["BatCave"], optional: ["GlobalComix", "Read Comics Online"] },
  "h-comic": { prefill: ["禁漫天堂"], optional: [] },
});

// Added to h-comic's prefill on KR.
export const H_COMIC_KR_RESTRICTED_SOURCES = Object.freeze([
  "污汙漫畫",
  "漫小肆ikanhm",
  "ToonGod",
  "Anime Planet",
  "MANGA18",
  "MANGADNA",
]);

/**
 * `{ prefill, suggestions }` for a media type. `region` matters only to
 * h-comic, whose KR entries have six more.
 */
export function restrictedSourcesFor(mediaType, region = "") {
  const entry = RESTRICTED_SOURCES[mediaType] || { prefill: [], optional: [] };
  const prefill =
    mediaType === "h-comic" && region === H_COMIC_REGION_KR
      ? [...entry.prefill, ...H_COMIC_KR_RESTRICTED_SOURCES]
      : [...entry.prefill];
  return { prefill, suggestions: [...prefill, ...entry.optional] };
}

function restrictedRow(name) {
  return { kind: "access", bucket: "restricted", name, url: "", available: null };
}

function isRestricted(row) {
  return row.bucket === "restricted";
}

/**
 * `rows` plus a restricted row for every name in `names` that `rows` does not
 * already carry. Existing rows are kept exactly as they are.
 */
export function withRestrictedSources(rows, names) {
  const current = rows || [];
  const present = new Set(
    current.filter(isRestricted).map((row) => (row.name || "").trim())
  );
  const missing = names.filter((name) => !present.has(name));
  return [...current, ...missing.map(restrictedRow)];
}

/** A new entry's sources: one untouched restricted row per prefilled name. */
export function defaultRestrictedSources(mediaType) {
  return withRestrictedSources([], restrictedSourcesFor(mediaType).prefill);
}

/**
 * An h-comic's rows after the region changes on the Add form: the prefilled
 * names the old region had and the new one does not are dropped while still
 * untouched, and the new region's missing ones are added.
 */
export function followRegion(rows, fromRegion, toRegion) {
  const kept = new Set(restrictedSourcesFor("h-comic", toRegion).prefill);
  const dropped = new Set(
    restrictedSourcesFor("h-comic", fromRegion).prefill.filter((name) => !kept.has(name))
  );
  const remaining = (rows || []).filter(
    (row) =>
      !(isRestricted(row) && !row.url && dropped.has((row.name || "").trim()))
  );
  return withRestrictedSources(remaining, restrictedSourcesFor("h-comic", toRegion).prefill);
}
