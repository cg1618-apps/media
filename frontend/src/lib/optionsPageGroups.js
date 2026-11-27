// How the /options page arranges its choice lists — the Internal Keys (closed
// enums) and the three system_option tiers: System Options, Tags and Common
// Options.
//
// Each tier arrives as one flat list whose natural order scatters the entries
// an admin reads together: alphabetically anime_airing_type sits three screens
// above cartoon_airing_type, and a character's two tag vocabularies are split
// by Character Group, a game guide suggestion. The groups below are presentation only - nothing in
// the data says two lists are related, and no business logic reads this file.
//
// A group is a heading plus the entries it claims, in the order they should be
// read (not alphabetically: anime before cartoon, the media types in the
// registry's own order). Entries the page was not handed are skipped, so a
// removed enum or an emptied category shrinks its group instead of printing a
// blank card.

import { categoriesForSubTab } from "./optionCategoryGroups";

/** Tier 1 group definitions, in the order they appear on the page. */
export const TIER1_GROUPS = [
  // One group, not an "Airing Type" one beside it: the three airing-type
  // lists answer the same question the other four do - what kind of work is
  // this entry - and reading them apart made the answer look like two
  // different things.
  {
    title: "Entry Type",
    keys: [
      "anime_airing_type",
      "cartoon_airing_type",
      "tv_show_airing_type",
      "movie_type",
      "anime_movie_release_type",
      "book_type",
      "comic_type",
      "game_type",
    ],
  },
  {
    title: "Region",
    keys: ["tv_region", "manga_region", "book_region"],
  },
  {
    title: "Publication Status",
    keys: [
      "airing_status",
      "film_release_status",
      "manga_serialization_status",
      "book_serialization_status",
      "game_release_status",
    ],
  },
  {
    title: "My Progress",
    keys: ["watching_status", "reading_status", "playing_status"],
  },
  // What is left of the game lists once the ones that answer a question the
  // other media types also answer have gone to their own groups: game_type to
  // Entry Type, game_release_status to Publication Status, playing_status to
  // My Progress. These four describe a game_copy - a specific copy an admin
  // owns - plus how deep a finish went, and nothing else in the app has them.
  {
    title: "Game",
    keys: [
      "completion_level",
      "game_storefront",
      "game_ownership",
      "game_copy_format",
      "game_acquisition",
    ],
  },
  {
    title: "Production Status",
    keys: ["music_status", "music_type_status"],
  },
  {
    title: "Franchise",
    keys: ["franchise_type", "franchise_expectation"],
  },
  // Named apart from the tier itself, which /options calls Internal Keys.
  {
    title: "Media Types & Categories",
    keys: [
      "media_type",
      "person_role",
      "option_categories",
      "tag_categories",
      "common_option_categories",
    ],
  },
];

// Tier 2 group definitions, in the order they appear on the page. Category
// names are the strings in system_option.category, spelled exactly as
// OPTION_CATEGORIES builds them in app/utils/credit_roles.py - a rename there
// drops the category into Other rather than hiding it.
//
// Listed rather than derived. The "Tags" group here is not TAG_CATEGORIES:
// that list answers a different question (which sub-tab of Add/Modify edits a
// category, see optionCategoryGroups.js) and spans the Tags, Game, H Genre and
// Character groups below, so the Tags sub-tab's picker reads under those four
// headings.
//
// Two categories left this list on 2026-09-07: "Publisher / Distributor TW"
// (which sat under Source & Platform) and "Comic Publisher" (which sat with
// the other Comic vocabularies). Neither is a vocabulary any more - a
// publisher is an entity edited on the Publisher tab, not a system_option
// value edited here.
export const TIER2_GROUPS = [
  {
    title: "Tags",
    categories: ["Genre Main", "Genre Sub", "Label"],
  },
  {
    title: "Game",
    categories: [
      "Game Genre",
      "Game Theme",
      "Game Mode",
      "Combat Mode",
      "Game Platform",
    ],
  },
  // The three adult genre vocabularies the gated types share.
  {
    title: "H Genre",
    categories: ["H Genre Plot", "H Genre Appearance", "H Genre Relation"],
  },
  {
    title: "Comic",
    categories: [
      "Comic Imprint",
      "Comic Continuity",
      "Comic Era",
      "Comic Event",
    ],
  },
  {
    title: "Source & Platform",
    categories: [
      "Platform",
      "Serialization Platform",
      "Exclusive Platform",
      "Reference Source",
    ],
  },
  // A character's two tag lists - one vocabulary each, for every character.
  {
    title: "Character",
    categories: ["Character Appearance", "Character Trait"],
  },
  // The common options (COMMON_OPTION_CATEGORIES) come last, in the four
  // groups the Common Options sub-tab's picker reads them in.
  //
  // What the note sections' free-text fields suggest - a game guide
  // character's group, a collectible's, an item's or a weapon's type, an
  // enemy's tier, a side quest's type, a place's group - and an easter egg's
  // group.
  {
    title: "Note Suggestion",
    categories: [
      "Easter Egg Group",
      "Character Group",
      "Collectible Type",
      "Item Type",
      "Weapon & Gear Type",
      "Enemy Tier",
      "Side Quest Type",
      "Geography Group",
    ],
  },
  // The suggestions the music note sections draw on: an OP or ED's cut, and
  // the label of a song link.
  {
    title: "Music",
    categories: ["Song Type", "Song Source"],
  },
  // The 待補充 note's common values. One category, declared as a group of one
  // on purpose, so it reads beside the other common options rather than
  // among the leftovers.
  {
    title: "Needs Work",
    categories: ["Needs Work Note"],
  },
  // What a studio's Countries field and a publisher's Country field
  // suggest. A group of one, like Needs Work.
  {
    title: "Studio & Publisher",
    categories: ["Country"],
  },
];

/** The heading the leftovers live under. */
export const UNGROUPED_TITLE = "Other";

/**
 * Arrange `names` into sections, following `groups`.
 *
 * Every group that claims at least two of the given names becomes a section
 * holding them in the group's own order, then one `Other` section holds the
 * rest alphabetically. Two is the threshold because a group the data shrank
 * to one is not a group - it is a heading that says the same thing as the
 * card under it, and it reads better among the leftovers. A group DECLARED
 * with one member is the exception: its one member is the whole group, so
 * it stands whenever that member is present.
 *
 * Every name comes back exactly once, so a section index and the content it
 * indexes can never disagree about what exists.
 */
function arrange(names, groups) {
  const remaining = new Set(names);
  const sections = [];

  for (const group of groups) {
    const present = group.members.filter((name) => remaining.has(name));
    if (present.length < Math.min(2, group.members.length)) continue;
    present.forEach((name) => remaining.delete(name));
    sections.push({ title: group.title, members: present });
  }

  const leftovers = [...remaining].sort();
  if (leftovers.length > 0) {
    sections.push({ title: UNGROUPED_TITLE, members: leftovers });
  }
  return sections;
}

/**
 * Arrange the served enum keys into the sections Tier 1 renders.
 *
 * Returns `[{ title, keys }]` in display order. See `arrange`.
 */
export function groupTier1Keys(keys) {
  const groups = TIER1_GROUPS.map((g) => ({
    title: g.title,
    members: g.keys,
  }));
  return arrange(keys, groups).map((s) => ({
    title: s.title,
    keys: s.members,
  }));
}

/**
 * Arrange the categories the database holds rows for into the sections Tier 2
 * renders.
 *
 * Returns `[{ title, categories }]` in display order. See `arrange`.
 */
export function groupTier2Categories(categories) {
  const groups = TIER2_GROUPS.map((g) => ({
    title: g.title,
    members: g.categories,
  }));
  return arrange(categories, groups).map((s) => ({
    title: s.title,
    categories: s.members,
  }));
}

/**
 * Split the categories the database holds rows for into the page's three
 * system_option tiers - the same split as the Options, Tags and Common Options
 * sub-tabs of Add / Modify (lib/optionCategoryGroups.js) - each arranged by
 * groupTier2Categories.
 *
 * Returns `{ options, tags, common }`, each `[{ title, categories }]`.
 */
export function groupOptionTiers(categories) {
  return Object.fromEntries(
    ["options", "tags", "common"].map((subTab) => [
      subTab,
      groupTier2Categories(categoriesForSubTab(categories, subTab)),
    ]),
  );
}
