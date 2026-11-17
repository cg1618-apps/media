// Frontend: the one rule every progress stepper's − / + follows.
//
// Every progress count and total is a float (2.5 episodes, 17.5 chapters),
// so a step does not add or subtract one: it goes to the next integer in
// that direction. + is floor(x) + 1 and − is ceil(x) − 1, so 1.2 + → 2,
// 1.2 − → 1, 2.5 + → 3, 2.5 − → 2, and an integer steps by one as it always
// has. A value within STEP_TOLERANCE of an integer counts as that integer, so
// float noise (2.0000000001, 0.1 + 0.2) never makes a step skip or stall.
//
// − stops at 0. + stops at the total and never passes it, including a
// fractional one: 2 + with a total of 2.5 → 2.5. A value already over its
// total is left where it is rather than pulled down by a +.

export const STEP_TOLERANCE = 1e-9;

// The fields whose inputs take a fraction: every progress count and total.
// Not vol_fin_page (a page), runtime_min or achievements_total.
export const FLOAT_PROGRESS_FIELDS = new Set([
  "ep_fin",
  "ep_total",
  "ep_previous",
  "issue_fin",
  "issue_total",
  "page_fin",
  "page_total",
  "ch_fin",
  "ch_total",
  "vol_fin",
  "vol_total",
]);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A total as a number, or null when there is none: null, blank, "?" and
 * anything unparseable all mean "unknown".
 */
export function parseProgressTotal(value) {
  if (value == null || value === "" || value === "?") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The next integer above `value`, unclamped. */
export function nextIntegerAbove(value) {
  return Math.floor(toNumber(value) + STEP_TOLERANCE) + 1;
}

/** The next integer below `value`, unclamped - it can be negative. */
export function nextIntegerBelow(value) {
  return Math.ceil(toNumber(value) - STEP_TOLERANCE) - 1;
}

/**
 * `steps` integer steps from `value`, unclamped: the first goes to the next
 * integer in that direction and each further one adds one. 0 steps leaves
 * the value as it is. For a cursor that does its own carrying (arcStep).
 */
export function stepBy(value, steps) {
  if (steps > 0) return nextIntegerAbove(value) + (steps - 1);
  if (steps < 0) return nextIntegerBelow(value) + (steps + 1);
  return toNumber(value);
}

/** What + makes of `value`, stopping at `total` when there is one. */
export function stepUp(value, total) {
  const current = toNumber(value);
  const next = nextIntegerAbove(current);
  const cap = parseProgressTotal(total);
  if (cap === null || next <= cap) return next;
  return Math.max(current, cap);
}

/** What − makes of `value`, stopping at 0. */
export function stepDown(value) {
  return Math.max(0, nextIntegerBelow(value));
}

/**
 * A progress number as it is shown: whole values without `.0`, and a sum's
 * float noise rounded away (0.1 + 0.2 shows as 0.3). Anything that is not a
 * number - a "?" placeholder, null - passes through unchanged.
 */
export function formatProgress(value) {
  if (value == null || value === "") return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded === 0 ? 0 : rounded);
}
