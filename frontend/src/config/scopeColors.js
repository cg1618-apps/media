// Frontend: one hue per searchable type, for the two places colour is allowed
// to name a type.
//
// THE TWO EXCEPTIONS TO DESIGN RULE 5
// -----------------------------------
// docs/frontend/design-system.md rule 5 says colour never encodes a category,
// and config/mediaTypeColors.js still honours that everywhere else: a relation
// graph mixes types but shows a handful at a time, each read from its label.
//
// 1. The System Options table (SCOPE_CHIPS). It runs the same twelve media
//    type keys down one narrow column across hundreds of rows, where the
//    question is "which of these two values is offered in the same places?" -
//    a shape comparison, answered instantly by hue and slowly by reading
//    "anime-movie" against "anime".
// 2. The nav search dropdown's type badge (typeHue). It mixes up to nineteen
//    types in eight rows that the reader scans while still typing, to find
//    the one row of the type they meant; hue finds it before the badge text
//    is read. That covers the grouping tiers, seasonal and the credited
//    entities as well as the media types, so it has seven hues the System
//    Options table never uses.
//
// Colour is the index in both, not decoration, and never the only signal: the
// type is still written in the chip, so nothing is lost to a colourblind
// reader or a greyscale print.
//
// Classes are spelled out per key rather than built as `bg-scope-${key}`
// because Tailwind scans source text for literal class names - an
// interpolated one is never generated and the chip renders unstyled.
const CHIP = "text-[10px] font-bold rounded px-1.5 py-0.5 border";

// Colour classes only - fill, border, text - so each surface keeps its own
// chip shape. A media type has one hue wherever it is coloured.
export const TYPE_HUES = {
  anime: "bg-scope-anime/12 border-scope-anime/40 text-scope-anime",
  "anime-movie": "bg-scope-anime-movie/12 border-scope-anime-movie/40 text-scope-anime-movie",
  movie: "bg-scope-movie/12 border-scope-movie/40 text-scope-movie",
  "tv-show": "bg-scope-tv-show/12 border-scope-tv-show/40 text-scope-tv-show",
  cartoon: "bg-scope-cartoon/12 border-scope-cartoon/40 text-scope-cartoon",
  manga: "bg-scope-manga/12 border-scope-manga/40 text-scope-manga",
  novel: "bg-scope-novel/12 border-scope-novel/40 text-scope-novel",
  comic: "bg-scope-comic/12 border-scope-comic/40 text-scope-comic",
  game: "bg-scope-game/12 border-scope-game/40 text-scope-game",
  "h-comic": "bg-scope-h-comic/12 border-scope-h-comic/40 text-scope-h-comic",
  "h-game": "bg-scope-h-game/12 border-scope-h-game/40 text-scope-h-game",
  hentai: "bg-scope-hentai/12 border-scope-hentai/40 text-scope-hentai",
  // Grouping tiers: saturated hues in the gaps the media types leave.
  collection: "bg-scope-collection/12 border-scope-collection/40 text-scope-collection",
  franchise: "bg-scope-franchise/12 border-scope-franchise/40 text-scope-franchise",
  series: "bg-scope-series/12 border-scope-series/40 text-scope-series",
  seasonal: "bg-scope-seasonal/12 border-scope-seasonal/40 text-scope-seasonal",
  // Credited entities: low-saturation slate, taupe and mauve, so a person,
  // studio or publisher row reads as "not a title" before its label does.
  person: "bg-scope-person/12 border-scope-person/40 text-scope-person",
  studio: "bg-scope-studio/12 border-scope-studio/40 text-scope-studio",
  publisher: "bg-scope-publisher/12 border-scope-publisher/40 text-scope-publisher",
};

/** Colour classes for one searchable type, or null for an unknown one. */
export function typeHue(type) {
  return TYPE_HUES[type] || null;
}

const MEDIA_SCOPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  "h-comic",
  "h-game",
  "hentai",
];

export const SCOPE_CHIPS = Object.fromEntries(
  MEDIA_SCOPES.map((key) => [key, `${CHIP} ${TYPE_HUES[key]}`]),
);

// A scope row can hold a key this build has never heard of - an older
// frontend against a database that gained a media type - so an unknown key
// renders as a plain ink chip rather than losing its border and fill.
const FALLBACK = `${CHIP} bg-surface-2 border-border text-text-muted`;

/** Chip classes for one system_option_scope key. */
export function scopeChip(scope) {
  return SCOPE_CHIPS[scope] || FALLBACK;
}

// Usage (watch / origin) is a different axis from media type, not a parallel
// taxonomy - it does not get its own hue family. Giving it one (a ninth and
// tenth colour alongside the eight scope hues) would sit in the same visual
// register as SCOPE_CHIPS and invite exactly the collision this replaced:
// a usage chip and a scope chip rendering pixel-identical in the same table.
// Usage chips are ink instead, the way SourcesCard.jsx's `Tag` renders a
// site tag - a hairline border and muted text, no fill - so watch and origin
// read as "not a media type" at a glance and differ from each other only by
// their label, which is exactly how they differ conceptually.
const USAGE_CHIP =
  "text-[10px] font-bold rounded px-1.5 py-0.5 border border-border-strong text-text-muted";

export const USAGE_CHIPS = {
  watch: USAGE_CHIP,
  origin: USAGE_CHIP,
};

/** Chip classes for one system_option usage key. */
export function usageChip(usage) {
  return USAGE_CHIPS[usage] || FALLBACK;
}
