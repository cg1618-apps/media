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
//               franchise_type carries one of `franchiseTypes`, or `key`
//               when the grid names none.
//   series    - a row of `series`, offered when it holds at least one entry
//               of `entryType`.
//   entry     - a row of one media type's own table, offered when it is of
//               `entryType`.
//
// `key` is the key inside that row's `type_slots`. The franchise keys are the
// ones already in the database and must not be renamed - so the AniManga
// grid's key is "ACG", the spelling every stored row and every sheet backup
// carries, while `franchiseTypes` says which franchises it holds - and the
// book grid's key is "Novel", the type's name when the rows were written. A key is
// only ever read alongside its tier, so "Movie" on a franchise and "Movie" on a movie
// entry are different slots and do not collide.
//
// `forType` picks which of a group's covers to show (see getCoverForSlot).
// null means "any entry under it", which is what the AniManga grid wants.
//
// `gatedType` marks a grid that holds only a gated media type's rows. It is
// drawn - on the statistics page, in its sidebar and in the admin editor -
// only for a session that can see that type: visibleFavoriteGrids below.
import { canSeeGatedType } from "../lib/gatedTypes";
import { ANIMANGA_FRANCHISE_TYPES } from "./fieldOptions";

export const FAVORITE_GRIDS = [
  {
    id: "animanga-franchises",
    // The stored type_slots key; see the note above.
    key: "ACG",
    tier: "franchise",
    franchiseTypes: ANIMANGA_FRANCHISE_TYPES,
    title: "AniManga franchises",
    short: "AniManga",
    forType: null,
  },
  {
    id: "book-franchises",
    // The stored type_slots key, kept from before Novel became Book; the
    // franchises it holds are named by franchiseTypes, as AniManga's are.
    key: "Novel",
    tier: "franchise",
    franchiseTypes: ["Book"],
    title: "Book franchises",
    short: "Book",
    forType: "Book",
  },
  {
    id: "movie-franchises",
    key: "Movie",
    tier: "franchise",
    title: "Movie franchises",
    short: "Movie",
    forType: "Movie",
  },
  {
    id: "movie-entries",
    key: "Movie",
    tier: "entry",
    entryType: "movie",
    title: "Movies",
    short: "Movie entries",
  },
  {
    id: "tv-franchises",
    key: "TV",
    tier: "franchise",
    title: "TV show franchises",
    short: "TV show",
    forType: "TV",
  },
  {
    id: "cartoon-franchises",
    key: "Cartoon",
    tier: "franchise",
    title: "Cartoon franchises",
    short: "Cartoon",
    forType: "Cartoon",
  },
  {
    id: "comic-series",
    key: "Comic",
    tier: "series",
    entryType: "comic",
    title: "Comic series",
    short: "Comic series",
    forType: "Comic",
  },
  {
    id: "game-franchises",
    key: "Game",
    tier: "franchise",
    title: "Game franchises",
    short: "Game",
    forType: "Game",
  },
  {
    id: "game-entries",
    key: "Game",
    tier: "entry",
    entryType: "game",
    title: "Games",
    short: "Game entries",
  },
  {
    id: "h-game-franchises",
    key: "H-Game",
    tier: "franchise",
    title: "H-game franchises",
    short: "H-Game",
    forType: "H-Game",
    gatedType: "h-game",
  },
  {
    id: "h-game-entries",
    key: "H-Game",
    tier: "entry",
    entryType: "h-game",
    title: "H-games",
    short: "H-Game entries",
    gatedType: "h-game",
  },
];

// The favourite-entity grids: studios and people rather than media. `tier`
// is "studio" or "person" and the slot is stored in that row's own
// `type_slots`, under `key`. Which rows a grid offers is read off the list
// payload (favoritePool in utils/statsUtils):
//
//   mediaTypes - a studio credited on any of these media types.
//   roles      - a person holding any of these `{ role, scopes? }` role rows,
//                in one of `scopes` when it names some, in any scope when not.
//   gender     - a person whose gender is this (男 / 女).
//
// "Non-anime director" is every director scope that is not an animation
// one; hentai is gated and so in neither director grid.
const ANIME_SCOPES = ["anime", "anime-movie"];

export const FAVORITE_ENTITY_GRIDS = [
  {
    id: "anime-studios",
    key: "Anime Studio",
    tier: "studio",
    mediaTypes: ANIME_SCOPES,
    title: "Anime studios",
    short: "Anime studio",
  },
  {
    id: "game-studios",
    key: "Game Studio",
    tier: "studio",
    mediaTypes: ["game"],
    title: "Game studios",
    short: "Game studio",
  },
  {
    id: "non-anime-directors",
    key: "Non-Anime Director",
    tier: "person",
    roles: [{ role: "director", scopes: ["movie", "tv-show", "cartoon", "game"] }],
    title: "Non-anime directors",
    short: "Non-anime director",
  },
  {
    id: "anime-directors",
    key: "Anime Director",
    tier: "person",
    roles: [{ role: "director", scopes: ANIME_SCOPES }],
    title: "Anime directors",
    short: "Anime director",
  },
  {
    id: "composers",
    key: "Composer",
    tier: "person",
    roles: [{ role: "composer" }],
    title: "Music / Composers",
    short: "Composer",
  },
  {
    id: "manga-authors",
    key: "Manga Author",
    tier: "person",
    roles: [{ role: "author", scopes: ["manga"] }],
    title: "Manga authors",
    short: "Manga author",
  },
  {
    id: "book-authors",
    key: "Book Author",
    tier: "person",
    roles: [{ role: "author", scopes: ["book"] }],
    title: "Book authors",
    short: "Book author",
  },
  {
    id: "illustrators",
    key: "Illustrator",
    tier: "person",
    roles: [{ role: "illustrator" }],
    title: "Illustrators",
    short: "Illustrator",
  },
  {
    id: "female-seiyuu",
    key: "Female Seiyuu",
    tier: "person",
    roles: [{ role: "seiyuu" }],
    gender: "女",
    title: "Female seiyuu",
    short: "Female seiyuu",
  },
  {
    id: "male-seiyuu",
    key: "Male Seiyuu",
    tier: "person",
    roles: [{ role: "seiyuu" }],
    gender: "男",
    title: "Male seiyuu",
    short: "Male seiyuu",
  },
];

/** The grids this session may see: every ungated one, and a gated one only
 * when its type is visible (lib/gatedTypes.js). */
export function visibleFavoriteGrids(auth, grids = FAVORITE_GRIDS) {
  return grids.filter((grid) => !grid.gatedType || canSeeGatedType(auth, grid.gatedType));
}
