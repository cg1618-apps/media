// Frontend: each named source's own icon, drawn beside its name on the
// Sources card.
//
// The icons are the sites' favicons, saved under assets/source-icons/ and
// bundled with the SPA - nothing is fetched from the sites at runtime.
//
// Keyed by the EXACT stored name: the `Platform` and `Reference Source`
// vocabularies for main rows, plus the column-backed links (MAL, IMDb, Steam,
// ...) that SourcesCard names itself. Regional variants share their site's
// icon. A name not listed - `Official site`, `Cinema`, `Other`, or a value an
// admin adds later - simply has no icon. Other and Restricted rows never get
// one, even when their free text happens to match a name here; the lookup is
// the caller's to skip for them.
const FILES = import.meta.glob("../assets/source-icons/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

function file(slug) {
  return FILES[`../assets/source-icons/${slug}.png`];
}

const ICON_SLUGS = Object.freeze({
  // Platform
  "Cartoon Network": "cartoon-network",
  ABC: "abc",
  Fox: "fox",
  "Disney+": "disney-plus",
  "HBO Max": "hbo-max",
  Nickelodeon: "nickelodeon",
  NBC: "nbc",
  "Comedy Central": "comedy-central",
  "Adult Swim": "adult-swim",
  FX: "fx",
  "The CW": "the-cw",
  Netflix: "netflix",
  "Prime Video": "prime-video",
  "Apple TV+": "apple-tv",
  Crunchyroll: "crunchyroll",
  動畫瘋: "bahamut",
  Bilibili: "bilibili",
  DLsite: "dlsite",
  "DLsite TW": "dlsite",
  "DLsite JP": "dlsite",
  Toptoon: "toptoon",
  "Toptoon TW": "toptoon",
  "Toptoon KR": "toptoon",
  Toomics: "toomics",
  "Toomics TW": "toomics",
  "Toomics KR": "toomics",
  Lezhin: "lezhin",
  "Lezhin TW": "lezhin",
  "Lezhin KR": "lezhin",
  // Reference Source
  SteamDB: "steamdb",
  HowLongToBeat: "howlongtobeat",
  Metacritic: "metacritic",
  Wikipedia: "wikipedia",
  "Fandom wiki": "fandom",
  Twitter: "twitter",
  AniList: "anilist",
  "KeyFrame Staff List": "keyframe",
  // Column-backed links
  MyAnimeList: "myanimelist",
  AniDB: "anidb",
  "E-Hentai": "e-hentai",
  IMDb: "imdb",
  "Comic Vine": "comic-vine",
  "Open Library": "open-library",
  IGDB: "igdb",
  Steam: "steam",
});

/** The icon URL for a source name, or null when it has none. */
export function sourceIconUrl(name) {
  const slug = ICON_SLUGS[(name || "").trim()];
  return (slug && file(slug)) || null;
}

/** Every name with an icon - for the test that proves each one resolves. */
export const SOURCE_ICON_NAMES = Object.freeze(Object.keys(ICON_SLUGS));
