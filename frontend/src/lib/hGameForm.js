// Frontend: the h-game form's credit and tag fields, as the Add and Modify
// pages hand them to ensureSourceValues before a save.
//
// One list for both pages, as lib/hComicForm.js is for h-comic. Every option
// source carries the `h-game` scope, so a value quick-created from this form
// is offered by the picker that created it.
const H_GAME_SOURCE_FIELDS = [
  ["studio", { kind: "studio" }],
  ["game_genre", { kind: "option", category: "Game Genre", scope: "h-game" }],
  ["game_theme", { kind: "option", category: "Game Theme", scope: "h-game" }],
  ["h_genre_plot", { kind: "option", category: "H Genre Plot", scope: "h-game" }],
  ["h_genre_appearance", { kind: "option", category: "H Genre Appearance", scope: "h-game" }],
  ["h_genre_relation", { kind: "option", category: "H Genre Relation", scope: "h-game" }],
];

/** `[{source, values}]` for ensureSourceValues; `split` turns "a, b" into names. */
export function hGameSourceFields(form, split) {
  return H_GAME_SOURCE_FIELDS.map(([key, source]) => ({
    source,
    values: split(form[key]),
  }));
}
