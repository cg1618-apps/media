// Frontend: helper functions for statistics calculations.
import { parseTypes } from "./media";
import { NO_COVER, entryCover, getCoverUrl } from "../lib/covers";
import { getDisplayName as getEntityName } from "../lib/naming";
import { entityPath } from "../lib/entityPath";

const TYPE_TO_ENTRY_TYPES = {
  Anime: ["anime", "anime_movie"],
  Manga: ["manga"],
  "Anime Movie": ["anime_movie"],
  TV: ["tv_show"],
  Movie: ["movie"],
  Cartoon: ["cartoon"],
  Book: ["book"],
  Comic: ["comic"],
  Game: ["game"],
  "H-Comic": ["h_comic"],
  "H-Game": ["h_game"],
  Hentai: ["hentai"],
};

// The book types the Statistics Novel section counts. A guide, an art book
// or anything else filed under 指南/設定集 or 其他 is a book but not a novel,
// and a book with no type is not counted either.
export const NOVEL_BOOK_TYPES = ["輕小說", "小說", "網路小說", "短篇集"];

/** The books the Novel section counts: those of a novel type only. */
export function novelsOnly(books) {
  return (books || []).filter((book) => NOVEL_BOOK_TYPES.includes(book?.type));
}

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
// are compared as strings. Returns `{ url, focus }` (lib/covers.js NO_COVER):
// a borrowed cover keeps the focal point of the entry it came from.
function pickCover(entries, chosen, forType) {
  if (chosen) {
    const picked = entries.find((e) => String(e.system_id) === String(chosen));
    if (picked?.cover_image_file && picked.cover_image_file !== "N/A") {
      return entryCover(picked);
    }
  }
  const allowedTypes = forType ? TYPE_TO_ENTRY_TYPES[forType] : null;
  const withCover = entries.filter(
    (e) =>
      e.cover_image_file &&
      e.cover_image_file !== "N/A" &&
      (!allowedTypes || !e._type || allowedTypes.includes(e._type)),
  );
  if (withCover.length === 0) return NO_COVER;
  withCover.sort((a, b) => getEntryYear(b) - getEntryYear(a));
  return entryCover(withCover[0]);
}

// ==========================================
// FAVOURITE GRIDS
// ==========================================
//
// A grid holds franchises, series, entries, studios or people (see
// config/favoriteGrids.js), and the tiers differ only in how a row is named,
// covered, linked and filtered. These four dispatch on grid.tier so the grid
// component and the admin editor can stay tier-blind.

const ENTITY_TIERS = ["studio", "person"];

/** Whether `grid` holds studios or people rather than media. */
export function isEntityGrid(grid) {
  return ENTITY_TIERS.includes(grid.tier);
}

// A studio's logo or a person's photo, as the library cards draw it: the
// server's display_* fallback first (a credited entry's cover), then the
// row's own image.
function entityCover(row, tier) {
  const [file, focus] =
    tier === "studio"
      ? [row.display_logo_file ?? row.logo_file, row.display_logo_focus ?? row.logo_focus]
      : [row.display_photo_file ?? row.photo_file, row.display_photo_focus ?? row.photo_focus];
  if (!file || file === "N/A") return NO_COVER;
  return { url: getCoverUrl(file), focus: focus || null };
}

// Whether an entity row belongs in an entity grid. `mediaTypes` reads the
// types a studio is credited on; `roles` reads a person's role rows, each
// `{ role, scopes? }` matching that role in any of `scopes` (or in any scope
// when it names none); `gender` narrows a person to 男 or 女.
function entityMatches(row, grid) {
  if (grid.mediaTypes && !(row.media_types || []).some((t) => grid.mediaTypes.includes(t))) {
    return false;
  }
  if (grid.roles) {
    const held = row.roles || [];
    const holds = grid.roles.some(({ role, scopes }) =>
      held.some((r) => r.role === role && (!scopes || scopes.includes(r.scope))),
    );
    if (!holds) return false;
  }
  if (grid.gender && row.gender !== grid.gender) return false;
  return true;
}

// The slot a row holds in `grid`, or null. A slot outside 1..9 is treated as
// absent rather than clamped: it cannot be drawn, and silently moving it
// would overwrite whatever legitimately sits where it landed.
export function slotIn(row, grid) {
  const slot = row?.type_slots?.[grid.key];
  return slot >= 1 && slot <= 9 ? slot : null;
}

export function favoriteName(row, grid) {
  if (isEntityGrid(grid)) return row.display_name || "—";
  if (grid.tier === "franchise") return getDisplayName(row);
  if (grid.tier === "series") return getEntityName(row, "series");
  return getEntityName(row, grid.entryType);
}

export function favoritePath(row, grid) {
  // Every tier but "entry" is also the entity's own path type.
  return entityPath(grid.tier === "entry" ? grid.entryType : grid.tier, row);
}

export function favoriteCover(row, grid, { byFranchise, bySeries }) {
  if (isEntityGrid(grid)) return entityCover(row, grid.tier);
  if (grid.tier === "franchise") {
    return getCoverForSlot(row, byFranchise, grid.forType);
  }
  if (grid.tier === "series") {
    return getSeriesCoverForSlot(row, bySeries, grid.forType);
  }
  return entryCover(row);
}

// Everything a grid may hold. Franchises are filtered on the type they
// declare - any of the grid's franchiseTypes, else its key; a series on whether it actually holds an entry of the grid's type,
// because a series declares no type of its own; an entry list arrives already
// narrowed to its type.
export function favoritePool(grid, { franchises, series, bySeries, entries, studios, people }) {
  if (grid.tier === "studio") return (studios || []).filter((s) => entityMatches(s, grid));
  if (grid.tier === "person") return (people || []).filter((p) => entityMatches(p, grid));
  if (grid.tier === "franchise") {
    const wanted = grid.franchiseTypes || [grid.key];
    return (franchises || []).filter((f) =>
      parseTypes(f.franchise_type).some((t) => wanted.includes(t)),
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
// purpose: the name columns are spelled `<prefix>_name_<lang>` on a
// franchise, a series and every entry table, and bare `name_<lang>` on a
// studio and a person, so nothing here has to know which it has.
export function favoriteSearchNames(row) {
  return Object.entries(row)
    .filter(
      ([key, value]) =>
        /(^|_)name_(en|cn|roman|jp|alt)$/.test(key) && typeof value === "string",
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
