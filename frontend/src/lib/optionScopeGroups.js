// How the admin Modify / Delete pages lay out one category's values: one
// group per media type, so a shared vocabulary such as Label reads as anime's
// labels and game's labels rather than one wall.
//
// A type's group holds only the values scoped to that type ALONE. A value
// scoped to several types is listed once, in the Shared group, under a
// sub-group for its exact set of types - Genre Main serves seven types, and
// listing 奇幻 under each of them would bury every type's own values under
// copies. A value with no scopes is offered everywhere (system_option_scope),
// so it gets a group of its own, last.

import { MEDIA_TYPES } from "../config/fieldOptions";

/** The `scope` of the group holding values with no scope rows. */
export const UNSCOPED = null;

/** The `scope` of the group holding values scoped to two or more types. */
export const SHARED = "shared";

// MEDIA_TYPES order; a scope not in MEDIA_TYPES (a stale key) sorts after the
// known ones rather than vanishing.
function rank(scope) {
  const i = MEDIA_TYPES.indexOf(scope);
  return i === -1 ? MEDIA_TYPES.length : i;
}

function byRank(a, b) {
  return rank(a) - rank(b) || a.localeCompare(b);
}

// Two scope sets compared type by type in MEDIA_TYPES order, so the sets
// starting with anime come first and a shorter prefix before its extensions.
function compareScopeSets(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = byRank(a[i], b[i]);
    if (order) return order;
  }
  return a.length - b.length;
}

/**
 * Group `options` by scope: single-type groups in MEDIA_TYPES order, then
 * the shared group, then the unscoped one. Empty groups are omitted.
 *
 * Returns `[{ scope, options }]`, except that the shared group is
 * `{ scope: SHARED, sets: [{ scopes, options }] }` - one entry per distinct
 * set of types, each set's `scopes` in MEDIA_TYPES order.
 */
export function groupOptionsByScope(options) {
  const byScope = new Map();
  const bySet = new Map();
  const unscoped = [];
  for (const opt of options) {
    const scopes = [...new Set(opt.scopes ?? [])].sort(byRank);
    if (!scopes.length) {
      unscoped.push(opt);
    } else if (scopes.length === 1) {
      if (!byScope.has(scopes[0])) byScope.set(scopes[0], []);
      byScope.get(scopes[0]).push(opt);
    } else {
      const key = scopes.join("|");
      if (!bySet.has(key)) bySet.set(key, { scopes, options: [] });
      bySet.get(key).options.push(opt);
    }
  }
  const groups = [...byScope.keys()]
    .sort(byRank)
    .map((scope) => ({ scope, options: byScope.get(scope) }));
  if (bySet.size) {
    const sets = [...bySet.values()].sort((a, b) =>
      compareScopeSets(a.scopes, b.scopes),
    );
    groups.push({ scope: SHARED, sets });
  }
  if (unscoped.length) groups.push({ scope: UNSCOPED, options: unscoped });
  return groups;
}
