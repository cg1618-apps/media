// How the admin Modify / Delete pages lay out one category's values: one
// group per media type the values are scoped to, so a shared vocabulary such
// as Label reads as anime's labels and game's labels rather than one wall.
//
// A value with several scopes is listed under each of them - it is offered
// on each, and the admin looking for game's labels expects to find it there.
// A value with no scopes is offered everywhere (system_option_scope), so it
// gets a group of its own, last, rather than a copy under every type.

import { MEDIA_TYPES } from "../config/fieldOptions";

/** The `scope` of the group holding values with no scope rows. */
export const UNSCOPED = null;

/**
 * Group `options` by scope, in MEDIA_TYPES order, unscoped last.
 *
 * Returns `[{ scope, options }]` with empty groups omitted. A scope not in
 * MEDIA_TYPES (a stale key) sorts after the known ones rather than vanishing.
 */
export function groupOptionsByScope(options) {
  const byScope = new Map();
  const unscoped = [];
  for (const opt of options) {
    const scopes = opt.scopes ?? [];
    if (!scopes.length) {
      unscoped.push(opt);
      continue;
    }
    for (const scope of scopes) {
      if (!byScope.has(scope)) byScope.set(scope, []);
      byScope.get(scope).push(opt);
    }
  }
  const rank = (s) => {
    const i = MEDIA_TYPES.indexOf(s);
    return i === -1 ? MEDIA_TYPES.length : i;
  };
  const groups = [...byScope.keys()]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map((scope) => ({ scope, options: byScope.get(scope) }));
  if (unscoped.length) groups.push({ scope: UNSCOPED, options: unscoped });
  return groups;
}
