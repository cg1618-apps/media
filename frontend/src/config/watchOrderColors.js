// Frontend: the colours the watch order page gives a step's status and
// importance.
//
// The third sanctioned exception to design rule 5 ("colour never encodes a
// category") - see docs/frontend/design-system.md. It is scoped to the
// standalone /watch-order/:publicId page (WatchOrderGuide's `colourCoded`
// prop); the guide inside a franchise or collection tab keeps ink chips.
//
// Every chip keeps its text, so colour is an index and never the only signal.
// The fills are the fixed state hues tinted with opacity; the text is the
// theme-aware --c-state-* token, measured at WCAG AA 4.5:1 against the tinted
// fill in all three palettes (index.css).

const STATE_CHIPS = {
  success: "border-success/40 bg-success/12 text-state-success",
  warning: "border-warning/40 bg-warning/12 text-state-warning",
  info: "border-info/40 bg-info/12 text-state-info",
  danger: "border-danger/40 bg-danger/12 text-state-danger",
  // Muted grey. text-muted rather than the Chip `muted` tone's text-faint,
  // which is under 3:1 on surface and so fails AA at 10px.
  muted: "border-border bg-surface-2/40 text-text-muted",
};

/**
 * Every watching, reading and playing status, by the tone it is drawn in.
 *
 * - success: finished, the summary-video variant included.
 * - warning: in progress, actively or passively ("Play Anytime" is a game
 *   being played whenever, so it is in progress too).
 * - info: on hold - "Paused" is the one on-hold value every vocabulary has.
 * - danger: stopped - "Temp Dropped" with the dropped and won't statuses, as
 *   the library filters group it (WATCHING_STATUS_GROUP) and as the follow
 *   progress counts it.
 * - muted: not started - planned, waiting for a release, or might.
 */
const STATUS_TONE_LISTS = {
  success: ["Completed", "Completed (解說)"],
  warning: [
    "Active Watching",
    "Passive Watching",
    "Active Reading",
    "Passive Reading",
    "Active Playing",
    "Passive Playing",
    "Play Anytime",
  ],
  info: ["Paused"],
  danger: [
    "Temp Dropped",
    "Dropped",
    "Won't Watch",
    "Won't Read",
    "Won't Play",
  ],
  muted: [
    "Plan to Watch",
    "Plan to Read",
    "Plan to Play",
    "Watch When Airs",
    "Play When Released",
    "Might Watch",
    "Might Read",
    "Might Play",
  ],
};

export const STATUS_TONES = Object.fromEntries(
  Object.entries(STATUS_TONE_LISTS).flatMap(([tone, statuses]) =>
    statuses.map((status) => [status, tone])
  )
);

/**
 * The chip classes for a status, or null for one this build does not know -
 * /api/constants can serve a newer value - which then keeps the ink chip
 * rather than vanishing.
 */
export function statusChip(status) {
  const tone = STATUS_TONES[status];
  return tone ? STATE_CHIPS[tone] : null;
}

/**
 * Importance: Essential is the strong brand fill, Recommended the brand tint,
 * Optional muted grey. Normal has no chip at all.
 */
export const IMPORTANCE_CHIPS = {
  Essential: "border-brand bg-brand text-on-brand",
  Recommended: "border-brand/40 bg-brand-soft text-brand",
  Optional: STATE_CHIPS.muted,
};
