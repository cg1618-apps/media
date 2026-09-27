// Frontend: the restricted sources each media type offers, and which of them a
// new entry is prefilled with.
//
// Restricted sources are free text (bucket "restricted"), so these are
// suggestions rather than a vocabulary. Nothing on the server knows the list -
// a stored row is a typed name like any other.
//
// The NAMES are fixed here and change only in code. Per type they sit in one
// or more VARIANTS: `all` for every type but h-comic, whose names depend on
// the region and so sit in `JP` and `KR`. Each variant has:
//
//   - `prefill`: the built-in names a new entry starts with, one untouched
//     row each, and the ones the editor's Prefill button adds when missing -
//     which is how an existing entry gets them on Modify.
//   - `optional`: names only offered while typing, never added on their own.
//
// Which names are ACTUALLY prefilled is the admin's pick on /defaults, stored
// per variant in the form-defaults config as `restricted_prefill`
// (`{ all: [...] }`, or `{ JP: [...], KR: [...] }`). A variant with no pick
// uses its built-in `prefill`; an empty pick prefills nothing. Every name the
// variant has is still suggested, picked ones first.
//
// Choosing a name fills the row's text and nothing more, so it can still be
// edited for that one entry; the list itself does not change.
//
// Which rows a form holds is the owner's once they touch it. So h-comic's Add
// form follows the region only with rows that are still UNTOUCHED - a
// prefilled name with no url - and never removes a row that has one, or a
// name the region's prefill does not contain.
import { H_COMIC_REGION_JP, H_COMIC_REGION_KR } from "./hComicRegion";

const GIMY = "Gimy";
const ALL = "all";
const JMTT = "禁漫天堂";

// The six restricted sources only a KR h-comic has.
const H_COMIC_KR_ONLY = Object.freeze([
  "污汙漫畫",
  "漫小肆ikanhm",
  "ToonGod",
  "Anime Planet",
  "MANGA18",
  "MANGADNA",
]);

const only = (prefill, optional = []) => ({ [ALL]: { prefill, optional } });

// Per media type (the data layer's hyphenated keys), per variant. Every type
// with a Sources block is listed, even with no names yet, so /defaults offers
// its prefill pick; a type not listed has no restricted sources at all.
const RESTRICTED_SOURCES = Object.freeze({
  anime: only([GIMY, "Anime1"]),
  "anime-movie": only([GIMY, "Anime1"]),
  "tv-show": only([GIMY]),
  movie: only([GIMY]),
  cartoon: only([GIMY]),
  manga: only(["漫畫櫃 (電腦版)", "漫畫櫃 (手機版)", "漫畫人"], ["包子漫畫"]),
  novel: only(
    [],
    [
      "bili嗶哩輕小說",
      "無限輕小說",
      "無限小說",
      "輕小說文庫",
      "真白萌",
      "和圖書",
      "小說狂人",
      "全本小說",
    ]
  ),
  comic: only(["BatCave"], ["GlobalComix", "Read Comics Online"]),
  game: only([]),
  "h-comic": {
    [H_COMIC_REGION_JP]: { prefill: [JMTT], optional: [] },
    [H_COMIC_REGION_KR]: { prefill: [JMTT, ...H_COMIC_KR_ONLY], optional: [] },
  },
  "h-game": only([]),
  hentai: only(["Hanime1"]),
});

const VARIANT_LABELS = Object.freeze({
  [ALL]: "Every entry",
  [H_COMIC_REGION_JP]: "JP",
  [H_COMIC_REGION_KR]: "KR",
});

function unique(names) {
  return [...new Set(names)];
}

function cleanPicks(names) {
  return unique((names || []).map((name) => (name || "").trim()).filter(Boolean));
}

/**
 * The variants a type's prefill is picked in, for /defaults:
 * `[{ key, label, names, builtIn }]`, where `names` is every name the variant
 * offers (built-in prefill first) and `builtIn` its unpicked prefill. Empty
 * for a type with no restricted names.
 */
export function prefillVariants(mediaType) {
  return Object.entries(RESTRICTED_SOURCES[mediaType] || {}).map(([key, v]) => ({
    key,
    label: VARIANT_LABELS[key] || key,
    names: unique([...v.prefill, ...v.optional]),
    builtIn: [...v.prefill],
  }));
}

// One variant's `{ prefill, suggestions }` under the admin's picks.
function forVariant(variant, picks) {
  const prefill =
    picks && Array.isArray(picks[variant.key])
      ? cleanPicks(picks[variant.key])
      : [...variant.builtIn];
  return { prefill, suggestions: unique([...prefill, ...variant.names]) };
}

/**
 * `{ prefill, suggestions }` for a media type. `region` matters only to
 * h-comic: a region uses its own variant, and an unset region has what every
 * region has in common. `picks` is the type's stored `restricted_prefill`
 * (null for the built-ins).
 */
export function restrictedSourcesFor(mediaType, region = "", picks = null) {
  const variants = prefillVariants(mediaType);
  if (variants.length === 0) return { prefill: [], suggestions: [] };
  const own =
    variants.find((v) => v.key === ALL) || (region && variants.find((v) => v.key === region));
  if (own) return forVariant(own, picks);

  const resolved = variants.map((v) => forVariant(v, picks));
  const common = (key) =>
    resolved[0][key].filter((name) => resolved.every((r) => r[key].includes(name)));
  const prefill = common("prefill");
  return { prefill, suggestions: unique([...prefill, ...common("suggestions")]) };
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

/** A new entry's built-in sources: one untouched restricted row per name. */
export function defaultRestrictedSources(mediaType) {
  return withRestrictedSources([], restrictedSourcesFor(mediaType).prefill);
}

/**
 * A new entry's starting sources: `rows` (a configured `sources` default)
 * with its restricted rows replaced by the picked prefill. The restricted
 * rows are the pick's to decide, so none survive from `rows`.
 */
export function startingSources(mediaType, rows, region = "", picks = null) {
  return withRestrictedSources(
    (rows || []).filter((row) => !isRestricted(row)),
    restrictedSourcesFor(mediaType, region, picks).prefill
  );
}

/**
 * An h-comic's rows after the region changes on the Add form: the prefilled
 * names the old region had and the new one does not are dropped while still
 * untouched, and the new region's missing ones are added.
 */
export function followRegion(rows, fromRegion, toRegion, picks = null) {
  const next = restrictedSourcesFor("h-comic", toRegion, picks).prefill;
  const kept = new Set(next);
  const dropped = new Set(
    restrictedSourcesFor("h-comic", fromRegion, picks).prefill.filter(
      (name) => !kept.has(name)
    )
  );
  const remaining = (rows || []).filter(
    (row) =>
      !(isRestricted(row) && !row.url && dropped.has((row.name || "").trim()))
  );
  return withRestrictedSources(remaining, next);
}

/**
 * An h-comic Add form with an auto-fill patch applied. A copied region
 * carries the form's untouched prefilled sources over to it, as choosing the
 * region by hand does - unless the patch copied the sources as well, which
 * then win as they are.
 */
export function mergeHComicAutofill(form, patch, picks = null) {
  const next = { ...form, ...patch };
  if ("region" in patch && !("sources" in patch)) {
    next.sources = followRegion(form.sources, form.region, patch.region, picks);
  }
  return next;
}
