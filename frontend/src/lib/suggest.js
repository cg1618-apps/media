// Frontend: how a type-or-choose input orders what it offers for the text
// typed so far. Kept free of React so it is tested directly.
//
// Matching is tiered: the option equal to the text, then those starting with
// it, then those merely containing it. Inside a tier the caller's own order
// is kept, which is what lets a picker put its best candidates first (the
// cast editor's seiyuu by rating and appearances) without the match tiers
// undoing it.

const EXACT = 0;
const PREFIX = 1;
const CONTAINS = 2;

/** 0 exact, 1 prefix, 2 contains, or null - both strings already normalised. */
export function matchTier(candidate, typed) {
  if (candidate === typed) return EXACT;
  if (candidate.startsWith(typed)) return PREFIX;
  if (candidate.includes(typed)) return CONTAINS;
  return null;
}

/**
 * `items` that match `typed`, exact first, then prefix, then contains, each
 * tier in the order given. `keyOf(item)` is the item's text, normalised the
 * same way `typed` was. Nothing typed keeps every item, in order.
 */
export function rankByMatch(items, typed, keyOf = (item) => item) {
  if (!typed) return items;
  const tiers = [[], [], []];
  for (const item of items) {
    const tier = matchTier(keyOf(item), typed);
    if (tier !== null) tiers[tier].push(item);
  }
  return tiers.flat();
}

/**
 * What a suggesting free-text input offers for what has been typed so far.
 *
 * Nothing typed offers everything. Otherwise every option containing the
 * text, case-insensitively, with those that start with it first - and the
 * option that already equals the text is left out, since picking it would
 * change nothing.
 */
export function suggest(options, text) {
  const typed = (text ?? "").trim().toLowerCase();
  if (!typed) return options;
  return rankByMatch(options, typed, (option) => option.toLowerCase()).filter(
    (option) => option.toLowerCase() !== typed,
  );
}
