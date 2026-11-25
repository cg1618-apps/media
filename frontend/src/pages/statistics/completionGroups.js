// Frontend: statistics page file for completionGroups.
//
// What the Recent completions tabs list, as pure functions so the grouping,
// the per-row details and the All tab's mix are testable without rendering
// the page. An entry counts as completed when its type's own status field
// says so (isCompleted) and it carries a completed_at; every list is newest
// first.

import { isCompleted } from "../../lib/mediaTabs";
import { getDisplayName } from "../../lib/naming";
import { BOOK_TYPES, COMPLETION_LEVELS } from "../../config/fieldOptions";
import hentaiCompletionGroups, { UNRECORDED } from "./hentaiCompletions";

export { UNRECORDED };

/**
 * The franchises that hold a type's standalone entries - a film or a show
 * that belongs to no larger franchise. Identified by English name, the way
 * the Disney and Marvel groups below are; each leads its tab.
 */
export const INDIVIDUAL_FRANCHISE = {
  movie: "Individual Movie",
  "tv-show": "Individual TV Show",
};

const byCompletedDesc = (a, b) => new Date(b.completed_at) - new Date(a.completed_at);

/** `entries` of media type `type` that are completed, newest first. */
export function completedEntries(type, entries) {
  return (entries || [])
    .filter((entry) => isCompleted(type, entry) && entry.completed_at)
    .sort(byCompletedDesc);
}

/**
 * `items` bucketed by `keyOf(item)`, returned as `[{ key, label, items }]` in
 * `order`'s order with the empty groups dropped. `order` is a list of keys or
 * of `{ key, label }`; an item whose key is not in it is left out, so a
 * caller maps unknown values onto a catch-all key itself.
 */
function groupInOrder(items, keyOf, order) {
  const buckets = {};
  for (const item of items) (buckets[keyOf(item)] ||= []).push(item);
  return order
    .map((group) => (typeof group === "string" ? { key: group, label: group } : group))
    .filter(({ key }) => buckets[key]?.length)
    .map(({ key, label }) => ({ key, label, items: buckets[key] }));
}

/** `value` when it is one of `known`, else `fallback`. */
const within = (value, known, fallback) => (known.includes(value) ? value : fallback);

const franchiseOf = (entry, franchiseMap) => franchiseMap?.[String(entry.franchise_id)];

/** Movie and TV show: the Individual franchise, then Disney, Marvel and the rest. */
function studioGroups(type, items, franchiseMap) {
  const individualName = INDIVIDUAL_FRANCHISE[type];
  const individual = Object.values(franchiseMap || {}).find(
    (franchise) => franchise?.franchise_name_en === individualName,
  );
  return groupInOrder(
    items,
    (entry) => {
      const nameEn = franchiseOf(entry, franchiseMap)?.franchise_name_en || "";
      if (nameEn === individualName) return "individual";
      if (nameEn.includes("Disney")) return "disney";
      if (nameEn.includes("Marvel")) return "marvel";
      return "others";
    },
    [
      { key: "individual", label: individual ? getDisplayName(individual, "franchise") : individualName },
      { key: "disney", label: "Disney" },
      { key: "marvel", label: "Marvel" },
      { key: "others", label: "其他" },
    ],
  );
}

const ANIME_MOVIE_GROUPS = [
  { key: "吉卜力", label: "吉卜力" },
  { key: "新海誠", label: "新海誠" },
  { key: "原創動畫電影", label: "原創動畫電影" },
  { key: "改編動畫電影", label: "改編動畫電影" },
  { key: "others", label: "其他" },
];

const CARTOON_GROUPS = [
  { key: "cartoon network", label: "Cartoon Network" },
  { key: "disney", label: "Disney" },
  { key: "nickelodeon", label: "Nickelodeon" },
  { key: "adult swim", label: "Adult Swim" },
  { key: "fox", label: "FOX" },
  { key: "hbo", label: "HBO" },
  { key: "others", label: "其他" },
];

const ANIME_AIRING_GROUPS = ["TV", "Movie", "ONA"];
const MANGA_REGION_GROUPS = ["日漫", "韓漫", "國漫", "台漫"];
const H_COMIC_REGION_GROUPS = ["JP", "KR"];

/** Completion level on Game's ladder, the unrecorded ones last. */
function levelGroups(items) {
  return groupInOrder(
    items,
    (game) => within(game.completion_level, COMPLETION_LEVELS, UNRECORDED),
    [...COMPLETION_LEVELS, UNRECORDED],
  );
}

const GROUPERS = {
  anime: (items) =>
    groupInOrder(
      items,
      (anime) => within(anime.airing_type, ANIME_AIRING_GROUPS, "Others"),
      [...ANIME_AIRING_GROUPS, "Others"],
    ),
  "anime-movie": (items, franchiseMap) =>
    groupInOrder(
      items,
      (movie) => {
        const franchise = franchiseOf(movie, franchiseMap);
        const name = franchise?.franchise_name_cn || franchise?.franchise_name_en || "";
        return ANIME_MOVIE_GROUPS.some(({ key }) => key === name) ? name : "others";
      },
      ANIME_MOVIE_GROUPS,
    ),
  movie: (items, franchiseMap) => studioGroups("movie", items, franchiseMap),
  "tv-show": (items, franchiseMap) => studioGroups("tv-show", items, franchiseMap),
  cartoon: (items) =>
    groupInOrder(
      items,
      (cartoon) => {
        const source = (cartoon.source_official || "").toLowerCase();
        return CARTOON_GROUPS.find(({ key }) => key !== "others" && source.includes(key))?.key ?? "others";
      },
      CARTOON_GROUPS,
    ),
  manga: (items) =>
    groupInOrder(
      items,
      (manga) => within(manga.region, MANGA_REGION_GROUPS, "others"),
      [...MANGA_REGION_GROUPS, { key: "others", label: "Others" }],
    ),
  // Every book, by type in the vocabulary's order - the book library's Type
  // filter - with an untyped book last. Reads BOOK_TYPES at call time:
  // /api/constants overwrites the array in place after mount.
  book: (items) =>
    groupInOrder(
      items,
      (book) => within(book.type, BOOK_TYPES, UNRECORDED),
      [...BOOK_TYPES, UNRECORDED],
    ),
  // Grouped by publisher, and the groups are derived rather than declared:
  // `publisher` is filled from Comic Vine and is open, so a fixed list would
  // silently drop the first run from a publisher the collection had not seen
  // before. Largest group first, with the unattributed runs last so an empty
  // field never leads.
  comic: (items) => {
    const keyOf = (comic) => (comic.publisher || "").trim() || "Others";
    const sizes = {};
    for (const comic of items) sizes[keyOf(comic)] = (sizes[keyOf(comic)] || 0) + 1;
    const order = Object.keys(sizes).sort((a, b) => {
      if (a === "Others") return 1;
      if (b === "Others") return -1;
      return sizes[b] - sizes[a] || a.localeCompare(b);
    });
    return groupInOrder(items, keyOf, order);
  },
  // A game is complete when its playing_status says so. The completion LEVEL
  // is a separate axis, used to group rather than to filter, so a Main Story
  // finish still counts as finished.
  game: levelGroups,
  // By region: a JP h-comic reads in pages and a KR one in chapters.
  "h-comic": (items) =>
    groupInOrder(
      items,
      (hComic) => within(hComic.region, H_COMIC_REGION_GROUPS, UNRECORDED),
      [...H_COMIC_REGION_GROUPS, UNRECORDED],
    ),
  "h-game": levelGroups,
  hentai: (items) => hentaiCompletionGroups(items),
};

/** One tab's completions as `[{ key, label, items }]`, empty groups dropped. */
export function completionGroups(type, entries, franchiseMap) {
  return GROUPERS[type](completedEntries(type, entries), franchiseMap);
}

/**
 * The muted details a row shows before the rating, in its own tab and in the
 * All tab alike: an array of strings, empty values left out. Hentai has no
 * airing type and H-Game no play hours, so neither mirrors its counterpart's
 * field; each shows its usefulness, as H-Comic does after its region.
 */
export function completionDetails(type, entry) {
  const hours = entry.hours_played != null ? `${entry.hours_played} h` : null;
  const details = {
    anime: [entry.airing_type],
    "tv-show": [entry.airing_type],
    cartoon: [entry.airing_type],
    manga: [entry.region],
    book: [entry.type],
    game: [hours],
    "h-comic": [entry.region, entry.usefulness],
    "h-game": [entry.usefulness],
    hentai: [entry.usefulness],
  }[type];
  return (details || []).filter(Boolean);
}

/**
 * The All tab: every type's completions in one list, newest first, as
 * `[{ type, entry }]`. `lists` is `[{ type, entries }]` and holds only the
 * types the viewer may see.
 */
export function recentCompletions(lists) {
  return lists
    .flatMap(({ type, entries }) =>
      completedEntries(type, entries).map((entry) => ({ type, entry })),
    )
    .sort((a, b) => byCompletedDesc(a.entry, b.entry));
}
