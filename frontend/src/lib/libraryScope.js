// Frontend: which parts of a library config a viewer is shown.
//
// A filter def, sort def or table column marked `personal: true` reads a
// value that is the viewer's own - its status, rating, progress, usefulness,
// plan flags, game copies - rather than a fact about the work. A viewer
// without self.list (useViewScope().ownData false) has none of those values,
// so it is shown the catalogue parts only: no personal filter, sort or column
// at all, rather than empty ones. LibraryLayout drops them from a media
// library's config; FranchiseLibrary's own table drops its columns the same
// way.

/** `defs` without the ones marked `personal`. */
export function withoutPersonal(defs) {
  return defs.filter((def) => !def.personal);
}

/** `key` when `sortDefs` holds it, else the first sort's key. */
export function resolveSortKey(sortDefs, key) {
  return sortDefs.some((s) => s.key === key) ? key : sortDefs[0]?.key;
}

/**
 * `config` without its personal filter, sort and column defs. A
 * `defaultSort` that named a dropped sort falls back to the first remaining
 * one. Returns a new object; `config` is not touched.
 */
export function catalogueOnly(config) {
  const sortDefs = withoutPersonal(config.sortDefs);
  return {
    ...config,
    filterDefs: withoutPersonal(config.filterDefs),
    sortDefs,
    tableColumns: withoutPersonal(config.tableColumns),
    defaultSort: resolveSortKey(sortDefs, config.defaultSort),
  };
}

/** The config a viewer is shown: whole with a list of its own, else catalogueOnly. */
export function libraryConfigFor(config, ownData) {
  return ownData ? config : catalogueOnly(config);
}
