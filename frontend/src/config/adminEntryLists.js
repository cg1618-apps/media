// Which entry lists each admin tab actually reads.
//
// The Add and Modify pages render one tab at a time but used to fetch all
// twelve lists before painting anything. These maps are what let them fetch
// only what the visible tab reads - see hooks/useEntryLists.js.
//
// `collection`, `franchise` and `series` are NOT in these maps. They are read
// on every tab (franchise and series pickers, buildAutofillPatch, openEditor)
// and are loaded eagerly by both pages, so listing them per tab would say
// nothing.
//
// A tab missing from a map reads none of the media lists - the entity tabs
// (person, studio, publisher, character, quote, meme, alias, options) all do.
import { MEDIA_LIST_TYPES } from "../hooks/useEntryLists";

// The grouping-tier editors show a ribbon of everything hanging off the tier,
// one section per media type. Games and the gated types are absent from both
// by design: FranchiseModifyTab and SeriesModifyTab take no allGames,
// allHComics or allHentai prop, so none of them appears in a franchise or
// series ribbon.
const RIBBON_TYPES = MEDIA_LIST_TYPES.filter(
  (type) => type !== "game" && type !== "h-comic" && type !== "hentai",
);

// SeriesModifyTab additionally takes no allAnimeMovies prop - an anime movie
// belongs to a franchise but is never listed under a series.
const SERIES_RIBBON_TYPES = RIBBON_TYPES.filter((type) => type !== "anime-movie");

// Add: every media tab reads its own list, for the auto-fill typeahead and
// the duplicate check on submit. Nothing reads another tab's list.
export const ADD_TAB_LISTS = Object.fromEntries(
  MEDIA_LIST_TYPES.map((type) => [type, [type]]),
);

// Modify: the same, plus the three tiers that render cross-type ribbons.
// fav3x3 reads every list, games included: two of its grids hold game rows
// (the favourite game franchises and the favourite games themselves). No grid
// holds an h-comic or a hentai, so neither list is fetched for it.
export const MODIFY_TAB_LISTS = {
  ...ADD_TAB_LISTS,
  franchise: RIBBON_TYPES,
  series: SERIES_RIBBON_TYPES,
  fav3x3: MEDIA_LIST_TYPES.filter((type) => type !== "h-comic" && type !== "hentai"),
};

export function listsForTab(map, tab) {
  return map[tab] || [];
}

// A deep link into Modify (?id=, optionally &type=) may not name its type. The
// old fall-through chain searched these five lists, in this order, and the
// order is load-bearing: an id is unique per table, but the chain returns the
// first hit, so reordering it would change which editor an ambiguous link
// opens.
export const DEEP_LINK_FALLBACK_TYPES = [
  "anime",
  "collection",
  "franchise",
  "series",
  "anime-movie",
];
