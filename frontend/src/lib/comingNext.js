// The dashboard's Coming Next section: what the viewer is waiting on or has
// planned that releases in the season after the current one.
//
// Seasons are calendar quarters (WIN Jan–Mar, SPR Apr–Jun, SUM Jul–Sep,
// FAL Oct–Dec), matching calculate_seasonal_from_month on the backend. Anime
// keep their own release_season, which MAL may set against the month; every
// other type's season is derived from the month of its primary release date,
// so a year-only date has no season and is left out.
import { primaryReleaseValue, releaseScore } from "./releaseDate";

const SEASON_CODES = ["WIN", "SPR", "SUM", "FAL"];

// The types Coming Next covers, in display order. Reading types have no
// "when released" status, and the gated types are not shown on the dashboard.
export const COMING_NEXT_TYPES = [
  { type: "anime", label: "Anime" },
  { type: "anime-movie", label: "Anime Movie" },
  { type: "movie", label: "Movie" },
  { type: "tv-show", label: "TV Show" },
  { type: "cartoon", label: "Cartoon" },
  { type: "game", label: "Game" },
];

// Each sub-section's status per status field. Games say "released" where the
// watched types say "airs".
const SUBSECTION_STATUS = {
  airs: { watching_status: "Watch When Airs", playing_status: "Play When Released" },
  planned: { watching_status: "Plan to Watch", playing_status: "Plan to Play" },
};

const STATUS_FIELD = {
  game: "playing_status",
};

/** "SPR 2026" -> { code: "SPR", year: 2026 }; null when unset or malformed. */
export function parseSeason(raw) {
  const match = /^(WIN|SPR|SUM|FAL) (\d{4})$/.exec(String(raw ?? "").trim());
  return match ? { code: match[1], year: Number(match[2]) } : null;
}

/** The season a calendar date falls in. */
export function seasonOfDate(date) {
  return {
    code: SEASON_CODES[Math.floor(date.getMonth() / 3)],
    year: date.getFullYear(),
  };
}

export function seasonAfter({ code, year }) {
  const index = SEASON_CODES.indexOf(code) + 1;
  return index === SEASON_CODES.length
    ? { code: SEASON_CODES[0], year: year + 1 }
    : { code: SEASON_CODES[index], year };
}

export function formatSeason({ code, year }) {
  return `${code} ${year}`;
}

/** The entry's release season, or null when its date carries no month. */
export function entrySeason(entry, mediaType) {
  const value = primaryReleaseValue(mediaType, entry);
  if (!value) return null;
  const [year, month] = String(value).split("-").map(Number);
  if (!year) return null;
  if (mediaType === "anime" && SEASON_CODES.includes(entry.release_season)) {
    return { code: entry.release_season, year };
  }
  if (!month) return null;
  return { code: SEASON_CODES[Math.floor((month - 1) / 3)], year };
}

function inSeason(entry, mediaType, season) {
  const s = entrySeason(entry, mediaType);
  return !!s && s.code === season.code && s.year === season.year;
}

/**
 * Splits `lists` ({ [mediaType]: entries }) into the two sub-sections for
 * `season`. Each is an array of { type, label, items } in COMING_NEXT_TYPES
 * order, sorted by release date, with empty types omitted.
 */
export function selectComingNext(lists, season) {
  const section = (key) =>
    COMING_NEXT_TYPES.map(({ type, label }) => {
      const field = STATUS_FIELD[type] || "watching_status";
      const status = SUBSECTION_STATUS[key][field];
      const items = (lists[type] || [])
        .filter((e) => e[field] === status && inSeason(e, type, season))
        .sort(
          (a, b) =>
            releaseScore(primaryReleaseValue(type, a)) -
            releaseScore(primaryReleaseValue(type, b)),
        );
      return { type, label, items };
    }).filter((group) => group.items.length > 0);

  return { airs: section("airs"), planned: section("planned") };
}
