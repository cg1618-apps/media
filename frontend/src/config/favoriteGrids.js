// The favourite 3x3 grids: what each one holds, and where its slot is stored.
//
// One list, read by the public statistics page and by the admin editor, so
// the two can never drift about which grids exist or what they are called.
//
// Every tier stores a slot the same way - a `type_slots` map of
// `{gridKey: 1..9}` on the row itself - so a grid differs only in which rows
// it may hold and how one is drawn. `tier` says which table that row is in:
//
//   franchise - a row of `franchise`, offered when its comma-separated
//               franchise_type carries `typeKey`.
//   series    - a row of `series`, offered when it holds at least one entry
//               of `entryType`.
//   entry     - a row of one media type's own table, offered when it is of
//               `entryType`.
//
// `key` is the key inside that row's `type_slots`. The franchise keys are the
// ones already in the database and must not be renamed. A key is only ever
// read alongside its tier, so "Movie" on a franchise and "Movie" on a movie
// entry are different slots and do not collide.
//
// `forType` picks which of a group's covers to show (see getCoverForSlot).
// null means "any entry under it", which is what the ACG grid wants.

export const FAVORITE_GRIDS = [
  {
    id: "acg-franchises",
    key: "ACG",
    tier: "franchise",
    title: "Favourite ACG franchises",
    short: "ACG",
    forType: null,
  },
  {
    id: "novel-franchises",
    key: "Novel",
    tier: "franchise",
    title: "Favourite novel franchises",
    short: "Novel",
    forType: "Novel",
  },
  {
    id: "movie-franchises",
    key: "Movie",
    tier: "franchise",
    title: "Favourite movie franchises",
    short: "Movie",
    forType: "Movie",
  },
  {
    id: "movie-entries",
    key: "Movie",
    tier: "entry",
    entryType: "movie",
    title: "Favourite movies",
    short: "Movie entries",
  },
  {
    id: "tv-franchises",
    key: "TV",
    tier: "franchise",
    title: "Favourite TV show franchises",
    short: "TV show",
    forType: "TV",
  },
  {
    id: "cartoon-franchises",
    key: "Cartoon",
    tier: "franchise",
    title: "Favourite cartoon franchises",
    short: "Cartoon",
    forType: "Cartoon",
  },
  {
    id: "comic-series",
    key: "Comic",
    tier: "series",
    entryType: "comic",
    title: "Favourite comic series",
    short: "Comic series",
    forType: "Comic",
  },
  {
    id: "game-franchises",
    key: "Game",
    tier: "franchise",
    title: "Favourite game franchises",
    short: "Game",
    forType: "Game",
  },
  {
    id: "game-entries",
    key: "Game",
    tier: "entry",
    entryType: "game",
    title: "Favourite games",
    short: "Game entries",
  },
];
