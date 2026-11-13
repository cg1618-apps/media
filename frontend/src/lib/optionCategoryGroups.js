// How the admin Add / Modify / Delete pages split one flat list of Tier 2
// categories across their "Options", "Tags" and "Note Suggestions" sub-tabs.
//
// The split is navigational only: every sub-tab is the same form over the
// same system_option rows, and nothing in the data or the API marks a
// category as a tag or a note suggestion. TAG_CATEGORIES and
// NOTE_SUGGESTION_CATEGORIES (from GET /api/constants via fieldOptions.js)
// are the whole rule, so all three pages agree on which side a category
// falls without any of them listing category names.

import { NOTE_SUGGESTION_CATEGORIES, TAG_CATEGORIES } from "../config/fieldOptions";

/** Is this category offered under the Tags sub-tab? */
export function isTagCategory(category) {
  return TAG_CATEGORIES.includes(category);
}

/** Is this category offered under the Note Suggestions sub-tab? */
export function isNoteSuggestionCategory(category) {
  return NOTE_SUGGESTION_CATEGORIES.includes(category);
}

/**
 * The categories a sub-tab offers, in the order given.
 *
 * `subTab` is "options", "tags" or "notes"; any other value (People, Studios)
 * has no category picker at all, so it gets an empty list rather than
 * everything. Options is what neither of the other two claims.
 */
export function categoriesForSubTab(categories, subTab) {
  if (subTab === "tags") return categories.filter(isTagCategory);
  if (subTab === "notes") return categories.filter(isNoteSuggestionCategory);
  if (subTab === "options") {
    return categories.filter(
      (c) => !isTagCategory(c) && !isNoteSuggestionCategory(c),
    );
  }
  return [];
}
