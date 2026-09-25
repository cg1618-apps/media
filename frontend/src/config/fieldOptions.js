// Canonical dropdown vocabularies for the Add/Modify forms.
//
// These were duplicated as inline literals across every add-tab and modify-tab.
// They live here now because the /defaults page must offer EXACTLY the values
// the Add form's <select> can display — otherwise an admin could save a default
// the form cannot render.

import { WEEKDAYS } from "./weekdays";

export { NOVEL_UNIT_KINDS_BY_TYPE } from "../lib/novelUnits";

export const AIRING_STATUSES = [
  "Not Yet Aired",
  "Airing",
  "Finished Airing",
  "Canceled",
  "Rumored",
];

export const WATCHING_STATUSES = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Dropped",
  "Won't Watch",
];

export const READING_STATUSES = [
  "Might Read",
  "Plan to Read",
  "Active Reading",
  "Passive Reading",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Dropped",
  "Won't Read",
];

export const PLAYING_STATUSES = [
  "Might Play",
  "Plan to Play",
  "Play When Released",
  "Active Playing",
  "Passive Playing",
  "Play Anytime",
  "Paused",
  "Completed",
  "Temp Dropped",
  "Dropped",
  "Won't Play",
];

// The game vocabularies. GET /api/constants serves all eight, so these are
// the pre-fetch fallback like every list above - see CONSTANTS_FALLBACK.
export const GAME_TYPES = ["Base Game", "DLC", "Expansion", "Bundle"];

export const COMPLETION_LEVELS = [
  "Main Story",
  "Main + Extras",
  "Post-game",
  "Completionist",
];

export const GAME_RELEASE_STATUSES = [
  "Rumored",
  "Unreleased",
  "Early Access",
  "Released",
  "Ongoing",
  "Discontinued",
  "Cancelled",
];

export const GAME_STOREFRONTS = [
  "Steam",
  "Nintendo eShop",
  "PlayStation Store",
  "Xbox Store",
  "GOG",
  "Epic Games Store",
  "Physical",
  "Other",
];

export const GAME_OWNERSHIP_KINDS = [
  "Owned",
  "Wishlist",
  "Subscription",
  "Free",
  "Not Owned",
];

export const GAME_COPY_FORMATS = ["Digital", "Physical"];

export const GAME_ACQUISITION_KINDS = [
  "Bought",
  "Gifted",
  "Free",
  "Bundled",
  "Subscription",
];

// The currencies a copy's price_paid can be recorded in. Not a backend
// vocabulary - price_currency is a free string there - so this list is a
// picking aid, and the three the price columns already use lead it.
export const PRICE_CURRENCIES = ["USD", "JPY", "TWD", "EUR", "GBP", "KRW", "CNY"];

export const IS_MAIN = ["本傳", "外傳", "前傳", "後傳", "總集篇"];

export const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];

export const ANIME_AIRING_TYPES = [
  "TV",
  "Movie",
  "ONA",
  "OVA",
  "OAD",
  "Special",
  "Other",
];

export const CARTOON_AIRING_TYPES = ["TV", "Movie", "OVA", "Special"];

export const MOVIE_TYPES = ["Reality", "Animation"];

export const TV_REGIONS = ["歐美劇", "韓劇", "日劇", "陸劇", "台劇", "動畫"];

export const MANGA_REGIONS = ["日漫", "韓漫", "國漫", "台漫", "其他"];

export const NOVEL_REGIONS = ["JP", "CN", "TW", "KR", "Western"];

export const NOVEL_TYPES = ["Light Novel", "Novel", "Web", "Other"];

export const COMIC_TYPES = ["Ongoing", "Limited", "One-Shot", "Annual"];

export const MANGA_SERIALIZATION_STATUSES = ["連載中", "停更", "腰斬", "完結"];

export const NOVEL_SERIALIZATION_STATUSES = [
  "連載中",
  "連載中 (不穩定)",
  "連載中 (有生之年)",
  "停更",
  "完結",
  "腰斬",
  "可能更多",
  "未出",
];

// Progress display uses {value, label} pairs — the stored value is a short code.
// This is the FULL vocabulary, and it is only for the Form Defaults page,
// which picks the default for novels of every type at once and so cannot be
// narrowed to one entry. A per-entry <select> must use
// progressDisplayOptions(novel) from lib/novelUnits.js instead, which offers
// only what that novel's type and unit rows can actually render.
export const PROGRESS_DISPLAY_OPTIONS = [
  { value: "", label: "— Default (derived from type) —" },
  { value: "vol_original", label: "VOL JP/KR (Original Volumes)" },
  { value: "vol_tw", label: "VOL TW (Taiwan Volumes)" },
  { value: "ch", label: "CH (Chapters)" },
  { value: "arc", label: "ARC (Arcs)" },
  { value: "arc_ch", label: "ARC + CH (Arc and chapter)" },
];

// A <select> must still show whatever is stored, even when the current option
// list does not offer it — a value left behind by a type change, a Pull, or a
// vocabulary that has since narrowed. This appends it back as a labelled,
// selectable entry so the admin sees what the row actually holds instead of
// the select silently reverting to the default option. Note that such a value
// no longer *renders* as progress: effectiveProgressDisplay() falls back to
// the derived mode when the type cannot support the stored one.
export function withLegacyProgressDisplay(options, currentValue) {
  if (!currentValue || options.some((o) => o.value === currentValue)) {
    return options;
  }
  return [...options, { value: currentValue, label: `${currentValue} (legacy)` }];
}

export const RELEASE_SEASONS = ["WIN", "SPR", "SUM", "FAL"];

export const RELEASE_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export const FRANCHISE_TYPES = [
  "ACG",
  "Anime Movie",
  "TV",
  "Movie",
  "Cartoon",
  "Comic",
  "Novel",
  "Game",
  // Only the gated types' franchises. /api/constants omits each for a
  // session that cannot see its type; pickers filter the fallback through
  // visibleFranchiseTypes (lib/gatedTypes.js) for the first paint too.
  "H-Comic",
  "H-Game",
  "Hentai",
];

export const FRANCHISE_EXPECTATIONS = ["Highest", "High", "Medium", "Low"];

export const SEASON_NUMS = Array.from({ length: 10 }, (_, i) => String(i + 1));

export const PART_NUMS = Array.from({ length: 7 }, (_, i) => String(i + 1));

// Yes/No selects that store the STRING "true"/"false" (never a real boolean),
// with "" meaning "unset".
export const TRISTATE = ["true", "false"];

// The three game completion axes - all_endings / all_achievements /
// all_collected. Unlike TRISTATE these store the value itself, because the
// column is a vocabulary rather than a boolean. "" is still "unset";
// "Inapplicable" says the game has none of that thing to find, which is an
// answer about the game rather than an absence of one.
// Mirrors GAME_COMPLETION_FLAGS in app/utils/constants.py, served by
// GET /api/constants as `game_completion_flag`.
export const GAME_COMPLETION_FLAGS = ["Yes", "No", "Inapplicable"];

// The h-comic vocabularies (app/utils/constants.py). /api/constants serves
// them only to a session that can see the gated type, so for anyone else
// these fallbacks are simply never overwritten - and never rendered, since
// no h-comic form is offered to that session.
export const H_COMIC_REGIONS = ["JP", "KR"];
export const H_COMIC_ORIGINALITY = ["原創", "同人"];
export const H_COMIC_ANIMATION_STATUSES = ["Not Animated", "Announced", "Animated"];
export const H_COMIC_USEFULNESS = ["非常實用", "實用", "特定情況實用", "不實用"];

// The h-game vocabularies (app/utils/constants.py), served the same way: only
// to a session that can see the gated type. Fixed vocabularies, not system
// options. The last four are multi-choice: the entry holds a list over the
// vocabulary, [] for "none of these" and null for "not recorded". An h-game's
// usefulness is H_COMIC_USEFULNESS.
export const H_GAME_PLAYSTYLES = ["ADV", "RPG", "SLG", "Other"];
export const H_GAME_LANGUAGE_AVAILABILITY = ["官方中文", "中文補丁", "無中文"];
export const H_GAME_AUDIO_AVAILABILITY = ["一般對話", "H場景"];
export const H_GAME_H_PRESENTATIONS = ["靜圖", "動圖", "2D動畫", "3D動畫", "3D模型", "互動"];
export const H_GAME_ART_STYLES = [
  "2D",
  "2.5D",
  "3D",
  "Pixel",
  "Live2D",
  "Live-action-like",
  "Live-action",
];
export const H_GAME_PLATFORMS = ["Steam", "DLsite", "Nintendo", "Other"];

// The hentai vocabulary of its own (HENTAI_SOURCE_MATERIALS). A hentai also
// reads H_COMIC_ORIGINALITY and H_COMIC_USEFULNESS above, served for it as
// for h-comic, and anime's AIRING_STATUSES. Gated the same way.
export const HENTAI_SOURCE_MATERIALS = ["Original", "Manga", "Novel"];

export const MUSIC_STATUSES = ["Need", "Pending", "Done"];

export const SEIYUU_STATUSES = ["Need", "Done"];

// The person_role vocabulary a credit can imply. Derived in Python from
// CREDIT_ROLES (app/utils/credit_roles.py) and served by GET /api/constants -
// this array is the pre-fetch fallback, NOT a second source of truth. It used
// to be a hand-written literal inside OptionsAddTab.jsx with nothing enforcing
// the match, which is the exact two-copies pattern the options redesign exists
// to delete.
//
// Moving it here did not stop it drifting: it sat holding the PRE-COLLAPSE
// keys (manga_author, novel_author, novel_illustrator, comic_writer,
// comic_artist) long after the 2026-09-04 collapse replaced them with author
// and illustrator, because the live API masks a wrong fallback. It is now
// pinned by test_person_role_fallback_matches_python in
// tests/unit/test_credit_roles.py.
export const PERSON_ROLES = [
  "director",
  "producer",
  "composer",
  "author",
  "illustrator",
  "club",
  "seiyuu",
];

// Hyphenated media type keys (MEDIA_TABLES in app/utils/media_resolver.py),
// used by the Options form's scope picker. NOT person-role scopes, which are
// the coarser anime / non_anime split.
export const MEDIA_TYPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  // Gated: omitted by /api/constants for a session that cannot see them, and
  // filtered through visibleMediaTypes by ScopePicker, the one component
  // that renders this list, so the first paint does not name them either.
  "h-comic",
  "h-game",
  "hentai",
];

// Tier 2 CATEGORY NAMES (OPTION_CATEGORIES in app/utils/credit_roles.py), not
// their values. The Options form needs these because the categories present
// in the stored options cannot include one that has no values yet - which is
// how every new tag field starts life.
export const OPTION_CATEGORIES = [
  "Genre Main",
  "Genre Sub",
  "Label",
  "Quality",
  "Official Source",
  // "Publisher / Distributor TW" and "Comic Publisher" were here until
  // 2026-09-07. Both vocabularies are retired: every publisher and TW
  // distributor is a `publisher` entity credited through the publisher role.
  "Comic Imprint",
  "Comic Continuity",
  "Comic Era",
  "Comic Event",
  "Game Genre",
  "Game Theme",
  "Game Mode",
  "Combat Mode",
  "Game Platform",
  "H Genre Plot",
  "H Genre Appearance",
  "H Genre Relation",
  "Franchise for Filter",
];

// The subset of OPTION_CATEGORIES the admin pages group under their "Tags"
// sub-tab (TAG_CATEGORIES in app/utils/credit_roles.py). Navigation only -
// both sub-tabs are the same form over the same system_option rows.
export const TAG_CATEGORIES = ["Genre Main", "Genre Sub", "Label", "Quality"];

// Shape-matched to GET /api/constants. Rendered only until the fetch resolves.
export const CONSTANTS_FALLBACK = {
  watching_status: WATCHING_STATUSES,
  reading_status: READING_STATUSES,
  playing_status: PLAYING_STATUSES,
  airing_status: AIRING_STATUSES,
  anime_airing_type: ANIME_AIRING_TYPES,
  cartoon_airing_type: CARTOON_AIRING_TYPES,
  franchise_type: FRANCHISE_TYPES,
  franchise_expectation: FRANCHISE_EXPECTATIONS,
  my_rating: MY_RATINGS,
  is_main: IS_MAIN,
  movie_type: MOVIE_TYPES,
  tv_region: TV_REGIONS,
  manga_region: MANGA_REGIONS,
  novel_region: NOVEL_REGIONS,
  novel_type: NOVEL_TYPES,
  comic_type: COMIC_TYPES,
  game_type: GAME_TYPES,
  completion_level: COMPLETION_LEVELS,
  game_release_status: GAME_RELEASE_STATUSES,
  game_storefront: GAME_STOREFRONTS,
  game_ownership: GAME_OWNERSHIP_KINDS,
  game_copy_format: GAME_COPY_FORMATS,
  game_acquisition: GAME_ACQUISITION_KINDS,
  manga_serialization_status: MANGA_SERIALIZATION_STATUSES,
  novel_serialization_status: NOVEL_SERIALIZATION_STATUSES,
  h_comic_region: H_COMIC_REGIONS,
  h_comic_originality: H_COMIC_ORIGINALITY,
  h_comic_animation_status: H_COMIC_ANIMATION_STATUSES,
  h_comic_usefulness: H_COMIC_USEFULNESS,
  h_game_playstyle: H_GAME_PLAYSTYLES,
  h_game_language_availability: H_GAME_LANGUAGE_AVAILABILITY,
  h_game_audio_availability: H_GAME_AUDIO_AVAILABILITY,
  h_game_h_presentation: H_GAME_H_PRESENTATIONS,
  h_game_art_style: H_GAME_ART_STYLES,
  h_game_platform: H_GAME_PLATFORMS,
  hentai_source_material: HENTAI_SOURCE_MATERIALS,
  day_of_week: WEEKDAYS,
  music_status: MUSIC_STATUSES,
  seiyuu_status: SEIYUU_STATUSES,
  person_role: PERSON_ROLES,
  media_type: MEDIA_TYPES,
  option_categories: OPTION_CATEGORIES,
  tag_categories: TAG_CATEGORIES,
};

// Every Add/Modify tab imports the arrays above (e.g. `AIRING_STATUSES`) and
// maps over them directly, so they are the actual values rendered in every
// <select>. useConstants() calls this once, after GET /api/constants
// resolves, to overwrite each array's CONTENTS in place (never reassign the
// binding — every importer holds a reference to the same array object, and
// only an in-place mutation is visible to code that already imported it).
// That makes /api/constants the effective source of truth for every
// consumer without threading the hook through each tab: these arrays are
// the pre-fetch fallback only, exactly as CONSTANTS_FALLBACK documents.
//
// Deliberate trade-off: mutating an array a component already imported
// works ONLY because array identity never changes — React never sees a new
// prop/state value, so this mutation cannot trigger a re-render on its own.
// That is exactly why App.jsx also calls useConstants() once at the root:
// its setState is what forces the one re-render that lets every already-
// mounted <select> read the arrays' new contents. Skip that call and this
// function silently does nothing visible until the next unrelated render.
export function applyConstants(data) {
  if (!data) return;
  for (const [key, target] of Object.entries(CONSTANTS_FALLBACK)) {
    const values = data[key];
    if (!Array.isArray(values) || !Array.isArray(target)) continue;
    target.length = 0;
    target.push(...values);
  }
}
