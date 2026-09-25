// Frontend: the hentai form's credit and tag fields - which suggestion source
// each reads, and what the Add and Modify pages hand ensureSourceValues
// before a save.
//
// One list for the form and both pages, so a field cannot be offered from
// one source and quick-created into another. The director carries its role
// AND its scope - a director created without `director|hentai` would exist
// and never be offered by the picker that created it. A studio is unscoped,
// as every studio is. The three genres are h-comic's vocabularies, shared,
// and asked for under the hentai scope.
export const HENTAI_SOURCES = Object.freeze({
  studio: { kind: "studio" },
  director: { kind: "person", role: "director", scope: "hentai" },
  h_genre_plot: { kind: "option", category: "H Genre Plot", scope: "hentai" },
  h_genre_appearance: { kind: "option", category: "H Genre Appearance", scope: "hentai" },
  h_genre_relation: { kind: "option", category: "H Genre Relation", scope: "hentai" },
});

/** `[{source, values}]` for ensureSourceValues; `split` turns "a, b" into names. */
export function hentaiSourceFields(form, split) {
  return Object.entries(HENTAI_SOURCES).map(([key, source]) => ({
    source,
    values: split(form[key]),
  }));
}
