// Inverts the options list into the shape the /aliases page reads.
//
// GET /api/options/ answers the question the pickers ask - "what values does
// this category offer?" - with the aliases hanging off each value. The alias
// page asks the opposite one: "IGDB just said 'Role-playing (RPG)'; what does
// that become?" So the rows are turned inside out here, source first, with
// the external string as the key rather than the payload.
//
// Every value of an aliased category gets a row, aliased or not. A value no
// external string reaches is the gap this page exists to show: a category
// IGDB fills, holding a value IGDB can never produce, can only be set by
// hand - and from the options side it looks exactly like a value in a
// category no API touches.

/**
 * Group every alias row by source, then by the category it belongs to.
 *
 * Returns
 *   [{ source, total, categories: [{
 *        category,
 *        aliased,                          // how many alias rows
 *        rows: [{ external, value, family }],
 *      }] }]
 *
 * A category's rows are its values in the order GET /api/options serves them
 * (sort_order, so a Game Platform's main platforms come first): one row per
 * alias, and one row with `external: null` for a value with none. `family` is
 * a Game Platform console's main platform, null otherwise.
 *
 * Categories are only listed under a source if at least one of their values
 * carries a row for it - otherwise every category in the database would
 * appear under "igdb" with all its values unconverted, which says nothing.
 */
export function groupAliasesBySource(options) {
  const list = options || [];
  const sources = new Map();
  for (const option of list) {
    for (const alias of option.aliases || []) {
      if (!sources.has(alias.source)) sources.set(alias.source, new Set());
      sources.get(alias.source).add(option.category);
    }
  }

  const collator = new Intl.Collator("en", { sensitivity: "base" });

  return [...sources.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([source, categoryNames]) => {
      const categories = [...categoryNames]
        .sort((a, b) => collator.compare(a, b))
        .map((category) => {
          const rows = [];
          let aliased = 0;
          for (const option of list.filter((o) => o.category === category)) {
            const own = (option.aliases || []).filter((a) => a.source === source);
            const family = option.family ?? null;
            if (own.length === 0) {
              rows.push({ external: null, value: option.value, family });
            }
            for (const alias of own) {
              rows.push({ external: alias.value, value: option.value, family });
              aliased += 1;
            }
          }
          return { category, aliased, rows };
        });
      return {
        source,
        total: categories.reduce((n, c) => n + c.aliased, 0),
        categories,
      };
    });
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What one row stores, in the order it is stored: a console's main platform
 * first, then the value. The value is left out when it only repeats what the
 * API said ("Android" is stored as Mobile, Android - the row shows Mobile),
 * unless nothing would be left.
 */
export function storedValues({ external, value, family }) {
  const stored = family ? [family, value] : [value];
  if (external == null || stored.length === 1) return stored;
  return stored.filter((v) => !sameName(v, external));
}
