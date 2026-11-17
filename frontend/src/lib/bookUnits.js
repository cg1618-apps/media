// Frontend mirror of app/services/domain/book_units.py. The editor previews
// a generated key before anything is saved, so the fallback cannot live only
// on the server. src/config/bookUnitKinds.test.js pins the two together.
import { stepBy } from "./progressStep";

const KEY_PREFIX = {
  volume: "Vol",
  arc: "Arc",
  story: "Story",
  chapter: "Ch",
};

// 輕小說 (light novel) and 小說 (novel) are volume-only; 網路小說 (web novel)
// is read in arcs and chapters; 短篇集, 指南/設定集 and 其他 take any of the
// flat kinds.
export const BOOK_UNIT_KINDS_BY_TYPE = {
  輕小說: ["volume"],
  小說: ["volume"],
  網路小說: ["arc"],
  短篇集: ["volume", "story", "chapter"],
  "指南/設定集": ["volume", "story", "chapter"],
  其他: ["volume", "story", "chapter"],
};

// The web-novel type: chapters inside arcs, and no volume counter.
export const BOOK_WEB_TYPE = "網路小說";

// The types that follow 其他's rules: a volume, story or chapter row each, and
// a progress display derived from which kind the rows are.
const FLAT_KIND_TYPES = ["短篇集", "指南/設定集", "其他"];

export function unitDisplayKey(kind, position, unitKey) {
  if (unitKey && String(unitKey).trim()) return String(unitKey).trim();
  const prefix = KEY_PREFIX[kind] || "Unit";
  const pos = Number(position) || 0;
  return `${prefix} ${pos}`;
}

export function kindsForType(bookType) {
  return BOOK_UNIT_KINDS_BY_TYPE[bookType] || ["volume"];
}

// Mirror of BOOK_VOLUME_ONLY_TYPES in app/utils/constants.py, derived the
// same way: a type that may only hold volume rows counts volumes and nothing
// else. Its chapter and arc columns are not empty, they are meaningless, so
// derive_book_progress() clears them server-side and nothing renders or
// edits them here.
export const BOOK_VOLUME_ONLY_TYPES = Object.entries(BOOK_UNIT_KINDS_BY_TYPE)
  .filter(([, kinds]) => kinds.length === 1 && kinds[0] === "volume")
  .map(([type]) => type);

/**
 * Whether this book counts chapters (and, for 網路小說, arcs) at all.
 *
 * An unrecognised or unset type counts them, matching the server: only the
 * two named volume-only types are cleared, so anything else keeps its pair.
 */
export function countsChapters(book) {
  return !BOOK_VOLUME_ONLY_TYPES.includes(book?.type);
}

/**
 * Whether this book shows a volume counter.
 *
 * Only 網路小說 says no. A web novel is read in chapters, and a volume number on
 * one is at best the print run it later got — so the columns are kept (a
 * type change brings them straight back) but nothing renders or edits them.
 * That asymmetry with countsChapters() is deliberate: chapters on a light
 * novel are meaningless and get cleared server-side, volumes on a web novel
 * are merely not the counter in use.
 */
export function countsVolumes(book) {
  return book?.type !== BOOK_WEB_TYPE;
}

function hasArcRows(book) {
  return (book?.units || []).some((u) => u.unit_kind === "arc");
}

const PROGRESS_DISPLAY_LABEL = {
  vol_original: "VOL JP/KR (Original Volumes)",
  vol_tw: "VOL TW (Taiwan Volumes)",
  ch: "CH (Chapters)",
  arc: "ARC (Arcs)",
  arc_ch: "ARC + CH (Arc and chapter)",
};

/**
 * The progress_display values this book may be set to, as {value, label}.
 *
 * Built from what the entry actually has rather than from a flat list: a
 * volume counter only where volumes are counted, a chapter counter only
 * where chapters are, and the two arc counters only once arc rows exist —
 * picking "arc" on a book with no arcs could render nothing but "?".
 *
 * The blank first option is the stored NULL, labelled with whatever
 * effectiveProgressDisplay() derives for this entry, so the admin can see
 * what "default" currently means before overriding it.
 */
export function progressDisplayOptions(book) {
  const values = [];
  if (countsVolumes(book)) values.push("vol_original", "vol_tw");
  if (countsChapters(book)) values.push("ch");
  if (countsChapters(book) && hasArcRows(book)) values.push("arc", "arc_ch");

  const derived = PROGRESS_DISPLAY_LABEL[derivedProgressDisplay(book)] || "";
  return [
    { value: "", label: `— Default (${derived}) —` },
    ...values.map((value) => ({ value, label: PROGRESS_DISPLAY_LABEL[value] })),
  ];
}

/**
 * Decision G: the type (plus, for 網路小說, whether arc rows exist) determines
 * which progress pair a book renders. `progress_display` narrows to a pure
 * override — when it is set, it wins outright and existing rows keep
 * rendering exactly as they did before this table existed (that is what
 * `withLegacyProgressDisplay` protects on the select side). When it is
 * unset, the mode is derived here so every consumer agrees:
 *
 * | book.type                                   | Effective mode       |
 * |---------------------------------------------|----------------------|
 * | 網路小說, with arc rows                       | "arc_ch" (two-stage) |
 * | 網路小說, no arc rows                         | "ch"                 |
 * | 輕小說 / 小說                                 | "vol_original"       |
 * | 短篇集 / 指南/設定集 / 其他, volume (or none)  | "vol_original"       |
 * | 短篇集 / 指南/設定集 / 其他, story or chapter  | "ch"                 |
 *
 * Consumers: getBookProgress (lib/formatters.js), MediaCard, and
 * BookDashboardCard / BookTrackerBlock all read this instead of the raw
 * `progress_display` column, so a web novel with arcs cannot show a volume
 * counter in one place and a two-stage row in another.
 */
function derivedProgressDisplay(book) {
  const units = book?.units || [];
  const type = book?.type;

  if (type === BOOK_WEB_TYPE) {
    return hasArcRows(book) ? "arc_ch" : "ch";
  }
  if (FLAT_KIND_TYPES.includes(type)) {
    return units.some((u) => u.unit_kind === "story" || u.unit_kind === "chapter")
      ? "ch"
      : "vol_original";
  }
  // 輕小說, 小說, and any unrecognised type default to volumes.
  return "vol_original";
}

export function effectiveProgressDisplay(book) {
  const pd = book?.progress_display;
  // The override only wins if the type still supports it. Pull and Fill write
  // this column, and a type change leaves an old value behind, so a web novel
  // can hold "vol_tw" — honouring it would render a volume row the type does
  // not have. An unsupported value falls back to the derived mode; the select
  // still shows it (withLegacyProgressDisplay) so it is visible, not silently
  // swapped.
  if (pd && progressDisplayOptions(book).some((o) => o.value === pd)) return pd;

  return derivedProgressDisplay(book);
}

/**
 * One whole-arc step for the "arc" display: finish (or unfinish) an entire
 * arc and reset the in-arc cursor, so ch_fin stays exactly the sum of the
 * finished arcs. Clamped at both ends — unlike arcStep, which deliberately
 * runs past the last recorded arc for an ongoing book, a whole-arc step has
 * no arc to move into.
 */
export function wholeArcStep(arcs, arcFin, chInArc, direction) {
  const total = (arcs || []).length;
  const next = Math.min(total, Math.max(0, stepBy(Math.max(0, Number(arcFin) || 0), direction)));
  return { arc_fin: next, ch_fin_in_arc: 0 };
}

/**
 * One chapter step for a web novel with arcs, folded into the right arc.
 * Mirrors normalize_arc_progress: carrying stops at the last recorded arc,
 * because an ongoing book is read into an arc nobody has entered yet.
 */
export function arcStep(arcs, arcFin, chInArc, direction) {
  const counts = (arcs || []).map((a) => Number(a.ch_count) || 0);
  let fin = Math.max(0, Math.floor(Number(arcFin) || 0));
  // A step goes to the next whole chapter in its direction (progressStep.js).
  let ch = stepBy(chInArc, direction);

  while (ch < 0 && fin > 0) {
    fin -= 1;
    ch += counts[fin];
  }
  if (ch < 0) ch = 0;

  while (fin < counts.length) {
    const width = counts[fin];
    if (width <= 0 || ch < width) break;
    ch -= width;
    fin += 1;
  }

  return { arc_fin: fin, ch_fin_in_arc: ch };
}

/**
 * What a web novel's arc cursor reads as on screen: the arc being read
 * (`arcNumber`, one-based), the chapters read inside it, and its arc row.
 * The stored cursor counts FINISHED arcs (`arc_fin`), so the arc being read
 * is arc_fin + 1, with two cases at the end:
 *
 * - every recorded arc finished and nothing read past them shows as the last
 *   arc, complete ("arc 2 · 40/40"), not as an arc 3 nobody has entered;
 * - chapters read past the last recorded arc (an ongoing book, see arcStep)
 *   show as that next arc, `arc` null because it has no row yet.
 *
 * Every arc + chapter display reads this - the detail page's tracker, the
 * dashboard card and getBookProgress - so they all name the same arc.
 */
export function arcProgressView(arcs, arcFin, chInArc) {
  const rows = arcs || [];
  const fin = Math.max(0, Math.floor(Number(arcFin) || 0));
  const ch = Math.max(0, Number(chInArc) || 0);
  if (rows.length > 0 && fin >= rows.length && ch === 0) {
    const last = rows[rows.length - 1];
    return { arcNumber: rows.length, chInArc: Number(last.ch_count) || 0, arc: last };
  }
  return { arcNumber: fin + 1, chInArc: ch, arc: rows[fin] ?? null };
}

/**
 * The stored cursor for an arc and chapter typed as arcProgressView shows
 * them. The arc is clamped to 1..(arc count + 1); chapters past the arc's
 * end carry into the next one, exactly as stepping does (arcStep).
 */
export function arcCursorFromView(arcs, arcNumber, chInArc) {
  const total = (arcs || []).length;
  const n = Math.min(total + 1, Math.max(1, Math.floor(Number(arcNumber) || 0)));
  return arcStep(arcs, n - 1, Math.max(0, Math.floor(Number(chInArc) || 0)), 0);
}

/**
 * The stored cursor for a total number of chapters read, folded into the
 * arcs from the first one - what typing into a flat chapter counter means on
 * a book whose ch_fin is derived from its arcs.
 */
export function arcCursorForChapters(arcs, chFin) {
  return arcStep(arcs, 0, Math.max(0, Math.floor(Number(chFin) || 0)), 0);
}
