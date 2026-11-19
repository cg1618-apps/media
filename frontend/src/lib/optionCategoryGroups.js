// How the admin Add / Modify / Delete pages split one flat list of Tier 2
// categories across their "Options", "Tags" and "Common Options" sub-tabs.
//
// The split is navigational only: every sub-tab is the same form over the
// same system_option rows, and nothing in the data or the API marks a
// category as a tag or a common option. TAG_CATEGORIES and
// COMMON_OPTION_CATEGORIES (from GET /api/constants via fieldOptions.js)
// are the whole rule, so all three pages agree on which side a category
// falls without any of them listing category names.

import { COMMON_OPTION_CATEGORIES, TAG_CATEGORIES } from "../config/fieldOptions";

/** Is this category offered under the Tags sub-tab? */
export function isTagCategory(category) {
  return TAG_CATEGORIES.includes(category);
}

/** Is this category offered under the Common Options sub-tab? */
export function isCommonOptionCategory(category) {
  return COMMON_OPTION_CATEGORIES.includes(category);
}

/**
 * The categories a sub-tab offers, in the order given.
 *
 * `subTab` is "options", "tags" or "common"; any other value (People,
 * Studios) has no category picker at all, so it gets an empty list rather
 * than everything. Options is what neither of the other two claims.
 */
export function categoriesForSubTab(categories, subTab) {
  if (subTab === "tags") return categories.filter(isTagCategory);
  if (subTab === "common") return categories.filter(isCommonOptionCategory);
  if (subTab === "options") {
    return categories.filter(
      (c) => !isTagCategory(c) && !isCommonOptionCategory(c),
    );
  }
  return [];
}
