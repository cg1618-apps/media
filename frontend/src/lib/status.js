// Watch/read status button/style config and status-cycle helpers.

import { isFilmType } from "../config/fieldOptions";
import { COMPLETED_STATUSES } from "../config/statusGroups";

// Each type's finished counts on the list row - LIST_FIELDS in
// app/services/domain/user_list.py. Films and games keep none.
export const FINISHED_COUNT_FIELDS = {
  anime: ["ep_fin"],
  "tv-show": ["ep_fin"],
  cartoon: ["ep_fin"],
  hentai: ["ep_fin"],
  manga: ["vol_fin", "vol_fin_page", "ch_fin"],
  book: ["vol_fin", "arc_fin", "ch_fin", "ch_fin_in_arc"],
  comic: ["issue_fin"],
  "h-comic": ["page_fin", "ch_fin"],
};

/**
 * What the status toggle (the card's and the library table's status button)
 * writes to the viewer's list row: the new status, and - when it moves a row
 * off Completed - every finished count set back to 0, so the row does not keep
 * the progress of a reading it no longer claims to have finished.
 */
export function statusToggleFields(type, statusField, current, target) {
  const fields = { [statusField]: target };
  if (COMPLETED_STATUSES.includes(current) && !COMPLETED_STATUSES.includes(target)) {
    for (const field of FINISHED_COUNT_FIELDS[type] || []) fields[field] = 0;
  }
  return fields;
}

// Watching status cycle: same order as base.js. A film cycles through Watch
// When Released where the airing types cycle through Watch When Airs.
const STATUS_CYCLE = [
  "Might Watch",
  "Plan to Watch",
  "Watch When Airs",
  "Active Watching",
  "Passive Watching",
  "Paused",
  "Completed",
  "Completed (解說)",
  "Temp Dropped",
  "Won't Watch",
  "Dropped",
];

const FILM_STATUS_CYCLE = STATUS_CYCLE.map((s) =>
  s === "Watch When Airs" ? "Watch When Released" : s,
);

const STATUS_STYLES = {
  "Active Watching": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-play",
  },
  "Passive Watching": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-headphones",
  },
  Paused: {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-pause",
  },
  Completed: {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-check",
  },
  "Completed (解說)": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-comment-dots",
  },
  "Plan to Watch": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-bookmark",
  },
  "Watch When Airs": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-clock",
  },
  "Watch When Released": {
    cls: "bg-surface text-text-muted border-border-strong",
    icon: "fa-clock",
  },
  "Temp Dropped": {
    cls: "bg-surface text-text-faint border-border-strong",
    icon: "fa-pause-circle",
  },
  Dropped: {
    cls: "bg-surface text-text-faint border-border-strong",
    icon: "fa-times-circle",
  },
  "Won't Watch": {
    cls: "bg-surface-2 text-text-faint border-border",
    icon: "fa-ban",
  },
  "Might Watch": {
    cls: "bg-surface-2 text-text-faint border-border",
    icon: "fa-question",
  },
};

const STATUS_BUTTON_CONFIG = {
  "Might Watch": {
    symbol: "+",
    cls: "bg-surface-2 text-text-faint border-border",
    target: "Plan to Watch",
  },
  "Plan to Watch": {
    symbol: "…",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Watch When Airs": {
    symbol: "…",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Watch When Released": {
    symbol: "…",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Active Watching": {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Passive Watching": {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  Paused: {
    symbol: "~",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  Completed: {
    symbol: "✓",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Completed (解說)": {
    symbol: "✓",
    cls: "bg-surface text-text-muted border-border-strong",
    target: "Might Watch",
  },
  "Temp Dropped": {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
    target: "Might Watch",
  },
  Dropped: {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
    target: "Might Watch",
  },
  "Won't Watch": {
    symbol: "✕",
    cls: "bg-surface text-text-faint border-border-strong",
    target: "Might Watch",
  },
};

export function getStatusButtonConfig(status) {
  return STATUS_BUTTON_CONFIG[status] || STATUS_BUTTON_CONFIG["Might Watch"];
}

export function getStatusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES["Might Watch"];
}

// `type` is the hyphenated media-type key; a film's cycle has Watch When
// Released in Watch When Airs' place.
export function getNextStatus(current, type) {
  const cycle = isFilmType(type) ? FILM_STATUS_CYCLE : STATUS_CYCLE;
  const idx = cycle.indexOf(current);
  if (idx === -1) return "Might Watch";
  return cycle[(idx + 1) % cycle.length];
}

const READING_BUTTON_CONFIG = {
  "Might Read": { symbol: "+", cls: "bg-surface-2 text-text-faint border-border", target: "Plan to Read" },
  "Plan to Read": { symbol: "…", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Active Reading": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Passive Reading": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  Paused: { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  Completed: { symbol: "✓", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Completed (解說)": { symbol: "✓", cls: "bg-surface text-text-muted border-border-strong", target: "Might Read" },
  "Temp Dropped": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
  Dropped: { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
  "Won't Read": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Read" },
};

export function getReadingButtonConfig(status) {
  return READING_BUTTON_CONFIG[status] || READING_BUTTON_CONFIG["Might Read"];
}

const PLAYING_BUTTON_CONFIG = {
  "Might Play": { symbol: "+", cls: "bg-surface-2 text-text-faint border-border", target: "Plan to Play" },
  "Plan to Play": { symbol: "…", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  "Play When Released": { symbol: "…", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  "Active Playing": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  "Passive Playing": { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  "Play Anytime": { symbol: "∞", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  Paused: { symbol: "~", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  Completed: { symbol: "✓", cls: "bg-surface text-text-muted border-border-strong", target: "Might Play" },
  "Temp Dropped": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Play" },
  Dropped: { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Play" },
  "Won't Play": { symbol: "✕", cls: "bg-surface text-text-faint border-border-strong", target: "Might Play" },
};

export function getPlayingButtonConfig(status) {
  return PLAYING_BUTTON_CONFIG[status] || PLAYING_BUTTON_CONFIG["Might Play"];
}

// The three status axes, as sets rather than a chain of ||: a ninth media
// type should be one entry here, not another arm on a ternary.
const READ_TYPES = new Set(["manga", "book", "comic", "h-comic"]);
const PLAY_TYPES = new Set(["game", "h-game"]);

export function getCardStatusConfig(type, status) {
  if (PLAY_TYPES.has(type)) return getPlayingButtonConfig(status);
  if (READ_TYPES.has(type)) return getReadingButtonConfig(status);
  return getStatusButtonConfig(status);
}
