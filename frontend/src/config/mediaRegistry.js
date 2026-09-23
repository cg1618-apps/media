// Media type registry: per-type API endpoint, nav path, and status metadata.

export const MEDIA_CONFIG = {
  anime:         { statusField: "watching_status", apiEndpoint: "/api/anime",       navPath: "/anime",        statusType: "watch" },
  "anime-movie": { statusField: "watching_status", apiEndpoint: "/api/anime-movie", navPath: "/anime-movie",  statusType: "watch" },
  movie:         { statusField: "watching_status", apiEndpoint: "/api/movies",      navPath: "/movie",        statusType: "watch" },
  "tv-show":     { statusField: "watching_status", apiEndpoint: "/api/tv-shows",    navPath: "/tv-show",      statusType: "watch" },
  cartoon:       { statusField: "watching_status", apiEndpoint: "/api/cartoon",     navPath: "/cartoon",      statusType: "watch" },
  manga:         { statusField: "reading_status",  apiEndpoint: "/api/manga",       navPath: "/manga",        statusType: "read"  },
  novel:         { statusField: "reading_status",  apiEndpoint: "/api/novel",       navPath: "/novel",        statusType: "read"  },
  comic:         { statusField: "reading_status",  apiEndpoint: "/api/comic",       navPath: "/comic",        statusType: "read"  },
  game:          { statusField: "playing_status",  apiEndpoint: "/api/game",        navPath: "/game",         statusType: "play"  },
  // A gated type: registered like any other, drawn only where canSeeGatedType
  // (lib/gatedTypes.js) says the session may see it.
  "h-comic":     { statusField: "reading_status",  apiEndpoint: "/api/h-comic",     navPath: "/h-comic",      statusType: "read"  },
  collection:    { statusField: null,              apiEndpoint: "/api/collection",  navPath: "/collection",   statusType: null    },
  franchise:     { statusField: null,              apiEndpoint: "/api/franchise",   navPath: "/franchise",    statusType: null    },
  series:        { statusField: null,              apiEndpoint: "/api/series",      navPath: "/series",       statusType: null    },
};
