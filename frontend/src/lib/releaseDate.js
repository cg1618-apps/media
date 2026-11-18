// Mirrors app/utils/release_date.py. Release dates are stored as YYYY,
// YYYY-MM, or YYYY-MM-DD; precision is self-describing from the length, and
// display never invents the components a value does not have.

const RELEASE_DATE_PATTERN = /^\d{4}(-\d{2}(-\d{2})?)?$/;

export function isValidReleaseDate(value) {
  // An empty field is not an error — the column is nullable.
  if (value === null || value === undefined || value === "") return true;
  if (!RELEASE_DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  if (month !== undefined) {
    if (month < 1 || month > 12) return false;
    if (day !== undefined) {
      // Day 0 of the next month is the last day of this one.
      const lastDay = new Date(year, month, 0).getDate();
      if (day < 1 || day > lastDay) return false;
    }
  }
  return true;
}

export function formatReleaseDate(value) {
  if (value === null || value === undefined || value === "") return "TBA";
  return String(value);
}

// The year component, for sorting and for the compact "1997 – 2011" renderings.
// Returns 0 when nothing is stored so undated entries sort as the oldest under
// a descending compare and the caller can test it as falsy.
export function releaseYear(value) {
  if (value === null || value === undefined || value === "") return 0;
  return parseInt(String(value).slice(0, 4), 10) || 0;
}

// Which release columns represent an entry, most preferred first. Mirrors
// RELEASE_PRIORITY; keyed by the hyphenated media-type slug, as there.
export const RELEASE_PRIORITY = {
  anime: ["release_date_jp", "release_date_tw"],
  "anime-movie": ["release_date_jp", "release_date_tw"],
  movie: ["release_date_tw", "release_date_usa"],
  "tv-show": ["release_date"],
  cartoon: ["release_date"],
  manga: ["release_date"],
  book: ["release_date_jp", "release_date_tw"],
  comic: ["release_date"],
  game: ["release_date"],
  "h-comic": ["release_date"],
  hentai: ["release_date"],
  "h-game": ["release_date"],
};

// The entry's most meaningful release date, or null. Mirrors
// primary_release_value.
export function primaryReleaseValue(mediaType, entry) {
  for (const column of RELEASE_PRIORITY[mediaType] || []) {
    if (entry[column]) return entry[column];
  }
  return null;
}

// A numeric sort score, year * 10000 + month * 100 + day. Missing precision
// resolves to the FIRST of the period, matching release_date.sort_key on the
// backend, so a bare "2020" sorts level with "2020-01-01". Undated values
// score 0.
export function releaseScore(value) {
  if (value === null || value === undefined || value === "") return 0;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year) return 0;
  return year * 10000 + (month || 1) * 100 + (day || 1);
}

// The last day a stored value can mean, as YYYY-MM-DD: a bare year runs to
// 31 December, a year-month to the month's last day. Null for an empty or
// malformed value.
function periodEnd(value) {
  if (!value || !isValidReleaseDate(value)) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  if (day) return `${year}-${pad(month)}-${pad(day)}`;
  if (month) return `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
  return `${year}-12-31`;
}

// Today in the viewer's own calendar, as YYYY-MM-DD.
export function todayIso(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Whether a stored release date is still ahead: nothing the value can mean
// has passed. A partial date stays upcoming through the last day of the
// period it names - "2026-11" until the month is over - and a date that is
// today is still upcoming. An empty or malformed value is never upcoming.
export function isUpcomingReleaseDate(value, today = todayIso()) {
  const end = periodEnd(value);
  return end !== null && end >= today;
}

// The earliest of `values` that is still upcoming, or null when none is.
export function earliestUpcomingReleaseDate(values, today = todayIso()) {
  const upcoming = values.filter((v) => isUpcomingReleaseDate(v, today));
  if (upcoming.length === 0) return null;
  return upcoming.reduce((a, b) => (releaseScore(b) < releaseScore(a) ? b : a));
}
