// Frontend: the h-comic form's credit and tag fields, as the Add and Modify
// pages hand them to ensureSourceValues before a save.
//
// One list for both pages, so a new field cannot be quick-created on one and
// not the other. Each person source carries its role AND its scope - a club
// created without `club|h-comic` would exist and never be offered by the
// picker that created it. The official source is left to the credits
// endpoint, which resolves a Platform value on its own, as the cartoon form
// does.
const H_COMIC_SOURCE_FIELDS = [
  ["illustrator", { kind: "person", role: "illustrator", scope: "h-comic" }],
  ["author", { kind: "person", role: "author", scope: "h-comic" }],
  ["club", { kind: "person", role: "club", scope: "h-comic" }],
  ["h_genre_plot", { kind: "option", category: "H Genre Plot", scope: "h-comic" }],
  ["h_genre_appearance", { kind: "option", category: "H Genre Appearance", scope: "h-comic" }],
  ["h_genre_relation", { kind: "option", category: "H Genre Relation", scope: "h-comic" }],
];

/** `[{source, values}]` for ensureSourceValues; `split` turns "a, b" into names. */
export function hComicSourceFields(form, split) {
  return H_COMIC_SOURCE_FIELDS.map(([key, source]) => ({
    source,
    values: split(form[key]),
  }));
}
