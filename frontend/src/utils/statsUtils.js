// Frontend: helper functions for statistics calculations.
import { getCoverUrl, FALLBACK_SVG, parseTypes } from "./media";
import { getDisplayName as getEntityName } from "../lib/naming";
import { entityPath } from "../lib/entityPath";

const TYPE_TO_ENTRY_TYPES = {
  ACG: ["anime", "manga"],
  "Anime Movie": ["anime_movie"],
  TV: ["tv_show"],
  Movie: ["movie"],
  Cartoon: ["cartoon"],
  Novel: ["novel"],
  Comic: ["comic"],
  Game: ["game"],
  "H-Comic": ["h_comic"],
  "H-Game": ["h_game"],
};

export function getDisplayName(f) {
  return (
    f.franchise_name_cn ||
    f.franchise_name_en ||
    f.franchise_name_roman ||
    f.franchise_name_jp ||
    f.franchise_name_alt ||
    "—"
  );
}

export function getEntryYear(entry) {
  const d =
    entry.release_date_jp ||
    entry.release_date_tw ||
    entry.release_date_usa ||
    entry.release_date;
  if (d) return parseInt(String(d).slice(0, 4), 10) || 0;
  return 0;
}

export function getCoverForSlot(
  franchise,
  allEntriesByFranchise,
  forType = null,
) {
  const entries = allEntriesByFranchise[String(franchise.system_id)] || [];
  const chosen = forType
    ? franchise.type_covers?.[forType]
    : franchise.cover_entry_id;
  return pickCover(entries, chosen, forType);
}

// The same choice for a series: its own cover_entry_id if that entry still
// has a cover, else the newest entry under it that has one.
export function getSeriesCoverForSlot(series, allEntriesBySeries, forType = null) {
  const entries = allEntriesBySeries[String(series.system_id)] || [];
  return pickCover(entries, series.cover_entry_id, forType);
}

// Shared by both groups. `chosen` is a cover_entry_id, which may be a UUID or
// the string form of one depending on which map it came out of, so both ends
// are compared as strings.
function pickCover(entries, chosen, forType) {
  if (chosen) {
    const picked = entries.find((e) => String(e.system_id) === String(chosen));
    if (picked?.cover_image_file && picked.cover_image_file !== "N/A") {
      return getCoverUrl(picked.cover_image_file);
    }
  }
  const allowedTypes = forType ? TYPE_TO_ENTRY_TYPES[forType] : null;
  const withCover = entries.filter(
    (e) =>
      e.cover_image_file &&
      e.cover_image_file !== "N/A" &&
      (!allowedTypes || !e._type || allowedTypes.includes(e._type)),
  );
  if (withCover.length === 0) return FALLBACK_SVG;
  withCover.sort((a, b) => getEntryYear(b) - getEntryYear(a));
  return getCoverUrl(withCover[0].cover_image_file);
}

// ==========================================
// FAVOURITE GRIDS
// ==========================================
//
// A grid holds franchises, series or entries (see config/favoriteGrids.js),
// and the three differ only in how a row is named, covered, linked and
// filtered. These four dispatch on grid.tier so the grid component and the
// admin editor can stay tier-blind.

// The slot a row holds in `grid`, or null. A slot outside 1..9 is treated as
// absent rather than clamped: it cannot be drawn, and silently moving it
// would overwrite whatever legitimately sits where it landed.
export function slotIn(row, grid) {
  const slot = row?.type_slots?.[grid.key];
  return slot >= 1 && slot <= 9 ? slot : null;
}

export function favoriteName(row, grid) {
  if (grid.tier === "franchise") return getDisplayName(row);
  if (grid.tier === "series") return getEntityName(row, "series");
  return getEntityName(row, grid.entryType);
}

export function favoritePath(row, grid) {
  return entityPath(grid.tier === "entry" ? grid.entryType : grid.tier, row);
}

export function favoriteCover(row, grid, { byFranchise, bySeries }) {
  if (grid.tier === "franchise") {
    return getCoverForSlot(row, byFranchise, grid.forType);
  }
  if (grid.tier === "series") {
    return getSeriesCoverForSlot(row, bySeries, grid.forType);
  }
  return row.cover_image_file && row.cover_image_file !== "N/A"
    ? getCoverUrl(row.cover_image_file)
    : FALLBACK_SVG;
}

// Everything a grid may hold. Franchises are filtered on the type they
// declare; a series on whether it actually holds an entry of the grid's type,
// because a series declares no type of its own; an entry list arrives already
// narrowed to its type.
export function favoritePool(grid, { franchises, series, bySeries, entries }) {
  if (grid.tier === "franchise") {
    return (franchises || []).filter((f) =>
      parseTypes(f.franchise_type).includes(grid.key),
    );
  }
  if (grid.tier === "series") {
    return (series || []).filter((s) =>
      ((bySeries || {})[String(s.system_id)] || []).some(
        (e) => e._type === grid.entryType,
      ),
    );
  }
  return entries || [];
}

// Every name a row carries, for the admin picker's search box. Tier-blind on
// purpose: the five name columns are spelled the same way on a franchise, a
// series and every entry table, so nothing here has to know which it has.
export function favoriteSearchNames(row) {
  return Object.entries(row)
    .filter(
      ([key, value]) =>
        /_name_(en|cn|roman|jp|alt)$/.test(key) && typeof value === "string",
    )
    .map(([, value]) => value);
}

// The pool in name order, for a picker that lists all of it. The grids
// themselves read the pool directly and key off the slot.
export function favoriteOptions(grid, data) {
  return [...favoritePool(grid, data)].sort((a, b) =>
    favoriteName(a, grid).localeCompare(favoriteName(b, grid)),
  );
}
