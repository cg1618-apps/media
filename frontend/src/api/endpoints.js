// Frontend: centralized API endpoint builders — the single source of URL truth.
// Import these instead of hardcoding "/api/..." strings in components.
import { MEDIA_CONFIG } from "../config/mediaRegistry";

// Generic CRUD path builder for a base like "/api/anime".
function crud(base) {
  return {
    list: () => `${base}/`,
    detail: (id) => `${base}/${id}`,
    create: () => `${base}/`,
    update: (id) => `${base}/${id}`,
    patch: (id) => `${base}/${id}`,
    remove: (id) => `${base}/${id}`,
  };
}

// Per-type resource endpoints, derived from the media registry.
// Works for every key in MEDIA_CONFIG (anime, movie, manga, franchise, series, ...).
export function resource(type) {
  const cfg = MEDIA_CONFIG[type];
  if (!cfg) throw new Error(`Unknown resource type: ${type}`);
  return {
    ...crud(cfg.apiEndpoint),
    complete: (id) => `${cfg.apiEndpoint}/${id}/complete`,
  };
}

export const endpoints = {
  resource,

  auth: {
    login: () => "/api/auth/login",
    logout: () => "/api/auth/logout",
    me: () => "/api/auth/me",
    accessMode: () => "/api/auth/access-mode",
  },

  // Tier 1 closed enums. Read-only by design - they live in Python.
  constants: {
    list: () => "/api/constants",
    // Admin-only, unlike the enum list above: the external-API field
    // inventory behind /external-apis.
    externalApis: () => "/api/constants/external-apis",
  },

  options: {
    list: () => "/api/options/",
    byCategory: (category) => `/api/options/${category}`,
    create: () => "/api/options/",
    update: (id) => `/api/options/${id}`,
    remove: (id) => `/api/options/${id}`,
  },

  roles: {
    list: () => "/api/roles/",
    catalog: () => "/api/roles/catalog",
    detail: (id) => `/api/roles/${id}`,
    create: () => "/api/roles/",
    update: (id) => `/api/roles/${id}`,
    permissions: (id) => `/api/roles/${id}/permissions`,
    remove: (id) => `/api/roles/${id}`,
  },

  accessModes: {
    list: () => "/api/access-modes/",
    catalog: () => "/api/access-modes/catalog",
    detail: (id) => `/api/access-modes/${id}`,
    create: () => "/api/access-modes/",
    update: (id) => `/api/access-modes/${id}`,
    grants: (id) => `/api/access-modes/${id}/grants`,
    remove: (id) => `/api/access-modes/${id}`,
  },

  users: {
    list: () => "/api/users/",
    create: () => "/api/users/",
    update: (id) => `/api/users/${id}`,
    remove: (id) => `/api/users/${id}`,
    accessModes: (id) => `/api/users/${id}/access-modes`,
  },

  // The caller's own account. No id in any path: these act on whoever the
  // session says you are.
  account: {
    settings: () => "/api/account/settings",
  },

  profile: {
    detail: (username) => `/api/profile/${encodeURIComponent(username)}`,
  },

  community: {
    forEntry: (mediaId) => `/api/community/${mediaId}`,
  },

  contentLabels: {
    list: () => "/api/content-labels/",
    create: () => "/api/content-labels/",
    update: (id) => `/api/content-labels/${id}`,
    remove: (id) => `/api/content-labels/${id}`,
    forEntry: (mediaType, entryId) =>
      `/api/content-labels/entry/${mediaType}/${entryId}`,
    forFranchise: (franchiseId) =>
      `/api/content-labels/franchise/${franchiseId}`,
  },

  seasonal: {
    list: () => "/api/seasonal/",
    detail: (id) => `/api/seasonal/${id}`,
    currentSeason: () => "/api/seasonal/current-season",
    update: (id) => `/api/seasonal/${id}`,
  },

  announcements: {
    list: () => "/api/announcements/",
    create: () => "/api/announcements/",
    update: () => "/api/announcements/",
    remove: (title) => `/api/announcements/?title=${encodeURIComponent(title)}`,
  },

  images: {
    list: (params = "") => `/api/images${params ? `?${params}` : ""}`,
    upload: () => "/api/images",
    attach: (imageId) => `/api/images/${imageId}/attach`,
    detach: (imageId, attachmentId) =>
      `/api/images/${imageId}/attach/${attachmentId}`,
    remove: (imageId, force = false) =>
      `/api/images/${imageId}${force ? "?force=true" : ""}`,
    clearOwner: (ownerType, ownerId, role = "cover") =>
      `/api/images/owners/${ownerType}/${ownerId}/${role}`,
  },

  // Watch orders don't fit the resource() CRUD shape: lists and their items
  // live under one prefix, and reorder is its own verb.
  watchOrder: {
    lists: () => "/api/watch-order/lists",
    list: (id) => `/api/watch-order/lists/${id}`,
    createList: () => "/api/watch-order/lists",
    updateList: (id) => `/api/watch-order/lists/${id}`,
    patchList: (id) => `/api/watch-order/lists/${id}`,
    removeList: (id) => `/api/watch-order/lists/${id}`,
    duplicateList: (id) => `/api/watch-order/lists/${id}/duplicate`,
    createItem: (listId) => `/api/watch-order/lists/${listId}/items`,
    updateItem: (itemId) => `/api/watch-order/items/${itemId}`,
    patchItem: (itemId) => `/api/watch-order/items/${itemId}`,
    removeItem: (itemId) => `/api/watch-order/items/${itemId}`,
    reorder: (listId) => `/api/watch-order/lists/${listId}/reorder`,
    createSection: (listId) => `/api/watch-order/lists/${listId}/sections`,
    updateSection: (sectionId) => `/api/watch-order/sections/${sectionId}`,
    patchSection: (sectionId) => `/api/watch-order/sections/${sectionId}`,
    removeSection: (sectionId) => `/api/watch-order/sections/${sectionId}`,
    candidates: () => "/api/watch-order/candidates",
    createRelease: () => "/api/watch-order/lists/release",
    backfillRelease: () => "/api/watch-order/lists/release/backfill",
  },

  mediaRelation: {
    kinds: () => "/api/media-relation/kinds",
    forEntry: () => "/api/media-relation/for-entry",
    inScope: () => "/api/media-relation/",
    create: () => "/api/media-relation/",
    patch: (id) => `/api/media-relation/${id}`,
    remove: (id) => `/api/media-relation/${id}`,
    resetScope: () => "/api/media-relation/scope",
    graph: () => "/api/media-relation/graph",
  },

  // One game's choice graph: its blocks (nodes), the branches and links out
  // of them (edges), and the viewer's own done/note marks on either. The graph
  // read takes `?game_id=`; node and edge writes need manage.catalog, a mark
  // needs self.personal_notes. `nextPart` creates a branch's next block and
  // points the branch at it in one write.
  gameChoice: {
    graph: () => "/api/game-choice/graph",
    createNode: () => "/api/game-choice/nodes",
    patchNode: (id) => `/api/game-choice/nodes/${id}`,
    removeNode: (id) => `/api/game-choice/nodes/${id}`,
    markNode: (id) => `/api/game-choice/nodes/${id}/mark`,
    createEdge: () => "/api/game-choice/edges",
    patchEdge: (id) => `/api/game-choice/edges/${id}`,
    removeEdge: (id) => `/api/game-choice/edges/${id}`,
    nextPart: (id) => `/api/game-choice/edges/${id}/next`,
    markEdge: (id) => `/api/game-choice/edges/${id}/mark`,
  },

  formDefaults: {
    list: () => "/api/form-defaults/",
    detail: (type) => `/api/form-defaults/${type}`,
    update: (type) => `/api/form-defaults/${type}`,
    reset: (type) => `/api/form-defaults/${type}`,
  },

  randomPickerDefaults: {
    detail: (mode) => `/api/random-picker-defaults/${mode}`,
    update: (mode) => `/api/random-picker-defaults/${mode}`,
    reset: (mode) => `/api/random-picker-defaults/${mode}`,
  },

  person: {
    list: (qs = "") => `/api/person/${qs ? `?${qs}` : ""}`,
    detail: (id) => `/api/person/${id}`,
    create: () => "/api/person/",
    update: (id) => `/api/person/${id}`,
    // PATCH: a partial body - the detail page's rating and remark.
    patch: (id) => `/api/person/${id}`,
    // The credit count the admin confirmed. Required: the API answers 409 if
    // it no longer matches, so a stale confirmation cannot delete history.
    remove: (id, credits) => `/api/person/${id}?credits=${credits}`,
    merge: (id) => `/api/person/${id}/merge`,
    entries: (id) => `/api/person/${id}/entries`,
    roleCounts: () => "/api/person/role-counts",
    roleScopes: () => "/api/person/role-scopes",
    // Club membership (person_membership). `clubs` reads and replaces the
    // clubs an artist belongs to; `members` reads and replaces a club's
    // members, in display order. PUT bodies: {club_ids} / {member_ids}.
    clubs: (id) => `/api/person/${id}/clubs`,
    members: (id) => `/api/person/${id}/members`,
    // The Add tab's MyAnimeList picker (ExternalSearchResult rows).
    searchMal: (q, limit = 10) =>
      `/api/person/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  credits: {
    get: (mediaType, entryId) => `/api/credits/${mediaType}/${entryId}`,
    update: (mediaType, entryId) => `/api/credits/${mediaType}/${entryId}`,
  },

  character: {
    list: (qs = "") => `/api/character/${qs ? `?${qs}` : ""}`,
    detail: (id) => `/api/character/${id}`,
    create: () => "/api/character/",
    update: (id) => `/api/character/${id}`,
    // PATCH: a partial body - the detail page's rating and remark.
    patch: (id) => `/api/character/${id}`,
    // The casting count the admin confirmed. Required: the API answers 409 if
    // it no longer matches, so a stale confirmation cannot delete history.
    remove: (id, castings) => `/api/character/${id}?castings=${castings}`,
    merge: (id) => `/api/character/${id}/merge`,
    entries: (id) => `/api/character/${id}/entries`,
    // The Add tab's MyAnimeList picker (ExternalSearchResult rows).
    searchMal: (q, limit = 10) =>
      `/api/character/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  casting: {
    get: (mediaType, entryId) => `/api/casting/${mediaType}/${entryId}`,
    replace: (mediaType, entryId) => `/api/casting/${mediaType}/${entryId}`,
    // Entries in one franchise that have a cast, for the editor's import.
    sources: (qs) => `/api/casting/sources?${qs}`,
    // POST {media_type, mal_link}: the MAL entry's cast as cast rows.
    fromMal: () => "/api/casting/mal",
  },

  publisher: {
    // Optional query string, like person.list: `scope=<media-type>` narrows the
    // list to the publishers offered on that type. Called with no argument it
    // returns every publisher — which is what the admin list pages want, since
    // a publisher with no scope rows yet must still be reachable to be given
    // one.
    list: (qs = "") => `/api/publisher/${qs ? `?${qs}` : ""}`,
    detail: (id) => `/api/publisher/${id}`,
    create: () => "/api/publisher/",
    update: (id) => `/api/publisher/${id}`,
    // PATCH: a partial body - the detail page's rating and remark.
    patch: (id) => `/api/publisher/${id}`,
    remove: (id) => `/api/publisher/${id}`,
    merge: (id) => `/api/publisher/${id}/merge`,
    entries: (id) => `/api/publisher/${id}/entries`,
  },

  studio: {
    list: () => "/api/studio/",
    detail: (id) => `/api/studio/${id}`,
    create: () => "/api/studio/",
    update: (id) => `/api/studio/${id}`,
    // PATCH: a partial body - the detail page's rating and remark.
    patch: (id) => `/api/studio/${id}`,
    remove: (id) => `/api/studio/${id}`,
    merge: (id) => `/api/studio/${id}/merge`,
    entries: (id) => `/api/studio/${id}/entries`,
  },

  // Hand-maintained exchange rates, read by the statistics spend block and
  // written from the admin page. Not under `system`: those routes all sit
  // behind manage.pipelines, and the read has to be open to any member who
  // can open /statistics.
  fxRates: {
    get: () => "/api/fx-rates",
    update: () => "/api/fx-rates",
  },

  system: {
    currentSeason: () => "/api/system/config/current_season",
    logs: () => "/api/system/logs",
    log: (id) => `/api/system/logs/${id}`,
    deleted: () => "/api/system/deleted",
    deletedRecord: (id) => `/api/system/deleted/${id}`,
  },

  quotes: {
    list: (qs = "") => `/api/quote/${qs ? `?${qs}` : ""}`,
    grouped: (qs = "") => `/api/quote/grouped${qs ? `?${qs}` : ""}`,
    byEntry: (mediaType, entryId) =>
      `/api/quote/?media_type=${mediaType}&entry_id=${entryId}`,
    detail: (id) => `/api/quote/${id}`,
    create: () => "/api/quote/",
    update: (id) => `/api/quote/${id}`,
    patch: (id) => `/api/quote/${id}`,
    remove: (id) => `/api/quote/${id}`,
  },

  memes: {
    list: (qs = "") => `/api/meme/${qs ? `?${qs}` : ""}`,
    grouped: (qs = "") => `/api/meme/grouped${qs ? `?${qs}` : ""}`,
    byOwner: (ownerType, ownerId) =>
      `/api/meme/?owner_type=${ownerType}&owner_id=${ownerId}`,
    detail: (id) => `/api/meme/${id}`,
    create: () => "/api/meme/",
    update: (id) => `/api/meme/${id}`,
    patch: (id) => `/api/meme/${id}`,
    remove: (id) => `/api/meme/${id}`,
  },

  // The site-wide Resources page: a tree of groups and Markdown items. Plural
  // because `resource` (above) already names the per-media-type CRUD builder.
  resources: {
    list: () => "/api/resources",
    create: () => "/api/resources",
    patch: (id) => `/api/resources/${id}`,
    remove: (id) => `/api/resources/${id}`,
    reorder: () => "/api/resources/reorder",
  },

  // The Add tabs' external pickers. CRUD for each type comes from
  // resource(type); these groups hold the endpoints that are not CRUD. Every
  // search answers ExternalSearchResult rows (external_id, link, title,
  // title_alt, year, detail, cover_url), or a 502 whose detail says why.
  anime: {
    searchMal: (q, limit = 10) =>
      `/api/anime/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  animeMovie: {
    searchMal: (q, limit = 10) =>
      `/api/anime-movie/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  manga: {
    searchMal: (q, limit = 10) =>
      `/api/manga/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  novel: {
    searchMal: (q, limit = 10) =>
      `/api/novel/search-mal?q=${encodeURIComponent(q)}&limit=${limit}`,
    searchOpenLibrary: (q, limit = 10) =>
      `/api/novel/search-openlibrary?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  // A TMDB result's external_id is a ref ("movie/603"), not the IMDb id the
  // row is keyed by; tmdbImdbId(ref) turns the picked one into
  // {imdb_id, imdb_link}, or a 404 when TMDB has none.
  movie: {
    searchTmdb: (q, limit = 10) =>
      `/api/movies/search-tmdb?q=${encodeURIComponent(q)}&limit=${limit}`,
    tmdbImdbId: (ref) => `/api/movies/tmdb-imdb-id?ref=${encodeURIComponent(ref)}`,
  },

  tvShow: {
    searchTmdb: (q, limit = 10) =>
      `/api/tv-shows/search-tmdb?q=${encodeURIComponent(q)}&limit=${limit}`,
    tmdbImdbId: (ref) => `/api/tv-shows/tmdb-imdb-id?ref=${encodeURIComponent(ref)}`,
  },

  cartoon: {
    searchTmdb: (q, limit = 10) =>
      `/api/cartoon/search-tmdb?q=${encodeURIComponent(q)}&limit=${limit}`,
    tmdbImdbId: (ref) => `/api/cartoon/tmdb-imdb-id?ref=${encodeURIComponent(ref)}`,
  },

  // Comic Vine allows 200 requests an hour, so its picker searches on Enter.
  comic: {
    searchComicVine: (q, limit = 10) =>
      `/api/comic/search-comicvine?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  game: {
    searchIgdb: (q, limit = 10) =>
      `/api/game/search-igdb?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  // The gated h-game type's copy of the same picker endpoint. Its CRUD is
  // resource("h-game").
  hGame: {
    searchIgdb: (q, limit = 10) =>
      `/api/h-game/search-igdb?q=${encodeURIComponent(q)}&limit=${limit}`,
  },

  dataControl: {
    fill: (type) => `/api/data-control/fill/${type}`,
    fillAll: () => "/api/data-control/fill/all",
    replace: (type) => `/api/data-control/replace/${type}`,
    replaceSingle: (type, id) => `/api/data-control/replace/${type}/${id}`,
    replaceAll: () => "/api/data-control/replace/all",
    pull: (tab) => `/api/data-control/pull/${tab}`,
    pullAll: () => "/api/data-control/pull",
    backup: () => "/api/data-control/backup",
    calculateAll: () => "/api/data-control/calculate/all",
    cleanScan: () => "/api/data-control/clean/scan",
    cleanApply: () => "/api/data-control/clean/apply",
    checkDuplicates: () => "/api/data-control/check/duplicates",
    checkRemarks: () => "/api/data-control/check/remarks",
    checkMusic: () => "/api/data-control/check/music",
    checkAloneGroups: () => "/api/data-control/check/alone-groups",
    markAloneGroupReviewed: (kind, id) =>
      `/api/data-control/check/alone-groups/${kind}/${id}/reviewed`,
    checkCoverImage: () => "/api/data-control/calculate/check-cover-image",
    setCoverFields: () => "/api/data-control/calculate/set-cover-image-fields",
    downloadMissingCovers: () => "/api/data-control/calculate/download-missing-covers",
    deleteOrphanedCovers: () => "/api/data-control/calculate/delete-orphaned-covers",
  },
};
