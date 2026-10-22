// Frontend: the three shared classification tags - Genre Main, Genre Sub and
// 標籤 Label - as anime-movie, movie, tv-show, cartoon, manga, novel and comic
// carry them. Anime has its own pickers for the same three and game carries
// only Label, so neither reads GENRE_LABEL_FIELDS; anime's TagReplace does read
// GENRE_LABEL_KEYS.
//
// One list for the form component (components/forms/GenreLabelFields.jsx)
// and for the Add and Modify save paths, so a field cannot be rendered on a
// tab and left out of the quick-create, or the reverse. Every source carries
// the media type as its scope: an unscoped descriptor would offer a value
// scoped to manga on the movie form, and create a typed value unscoped -
// offered on every type at once.

export const GENRE_LABEL_TYPES = [
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
];

export const GENRE_LABEL_FIELDS = [
  { key: "genre_main", category: "Genre Main", label: "Genre Main", placeholder: "Select genres..." },
  { key: "genre_sub", category: "Genre Sub", label: "Genre Sub", placeholder: "Select sub-genres..." },
  { key: "label", category: "Label", label: "標籤 Label", placeholder: "Select labels..." },
];

/** The three form keys, for TagReplace (components/forms/TagReplace.jsx). */
export const GENRE_LABEL_KEYS = GENRE_LABEL_FIELDS.map(({ key }) => key);

/** The option source descriptor for one of the three fields on `mediaType`. */
export function genreLabelSource(mediaType, category) {
  return { kind: "option", category, scope: mediaType };
}

/** `[{source, values}]` for ensureSourceValues; `split` turns "a, b" into names. */
export function genreLabelSourceFields(mediaType, form, split) {
  return GENRE_LABEL_FIELDS.map(({ key, category }) => ({
    source: genreLabelSource(mediaType, category),
    values: split(form[key]),
  }));
}
