// Frontend: the random picker's weighted draw, kept free of React so it can be
// tested directly. Every weight lives in the tables below, and the picker's
// Weights tab renders these same tables, so what it shows is what is used.
//
// The draw has two stages:
//   1. a status group, chosen by GROUP_WEIGHTS among the groups the pool
//      actually holds - so a group's share does not grow with its size
//   2. one entry inside that group, chosen by the product of its entry
//      factors: rating (Completed only), plan mark, release decade, and in a
//      one-type mode that type's serialization status
import { MEDIA_CONFIG } from "../config/mediaRegistry";
import { UNRATED, decadeOf, entryKey, statusGroupOf } from "./randomPicker";

// Stage 1. A group missing from the pool is skipped, and the rest share the
// draw in these proportions.
export const GROUP_WEIGHTS = [
  { group: "In Progress", weight: 1.5 },
  { group: "Planned", weight: 1.3 },
  { group: "Might", weight: 1.1 },
  { group: "Completed", weight: 1.0 },
  { group: "Dropped", weight: 0.3 },
];

// Where the weighting groups a status differently from the Status filter: a
// temporary drop is a pause, and a plan that waits on a release is no more
// drawable than a "might".
export const GROUP_OVERRIDES = {
  "Temp Dropped": "In Progress",
  "Watch When Airs": "Might",
  "Play When Released": "Might",
};

// Stage 2, Completed only: my rating, in tiers.
export const RATING_TIERS = [
  { ratings: ["S", "A+", "A"], weight: 1.0 },
  { ratings: ["B", "C"], weight: 0.75 },
  { ratings: ["D", "E", "F", UNRATED], weight: 0.5 },
];

// Stage 2, Completed only: a completion through a summary counts for less.
export const COMPLETED_STATUS_WEIGHTS = [
  { status: "Completed", weight: 1.0 },
  { status: "Completed (解說)", weight: 0.8 },
];

// Stage 2: my plan marks. An entry carrying both takes the larger.
export const PLAN_WEIGHTS = [
  { mark: "Plan next", weight: 1.5 },
  { mark: "To rewatch", weight: 1.2 },
  { mark: "Neither", weight: 1.0 },
];

// Stage 2: release decade. An undated entry counts as before.
export const DECADE_FROM = 2000;
export const DECADE_WEIGHTS = [
  { decades: `${DECADE_FROM}s and later`, weight: 1.5 },
  { decades: "Earlier, or no release date", weight: 1.0 },
];

// Stage 2, one-type modes only: serialization status. A status not listed,
// or none, weighs 1.
const MANGA_SERIALIZATION = { 完結: 1.5, 連載中: 1.3, 停更: 1.0, 腰斬: 0.3 };
export const SERIALIZATION_WEIGHTS = {
  manga: MANGA_SERIALIZATION,
  "h-comic": { 完結: 1.2, 連載中: 1.0, 停更: 1.0, 腰斬: 0.3 },
  novel: {
    ...MANGA_SERIALIZATION,
    "連載中 (不穩定)": 0.7,
    "連載中 (有生之年)": 0.3,
    可能更多: 1.3,
    未出: 0.3,
  },
};

const GROUP_WEIGHT = Object.fromEntries(GROUP_WEIGHTS.map((g) => [g.group, g.weight]));
const RATING_WEIGHT = Object.fromEntries(
  RATING_TIERS.flatMap((t) => t.ratings.map((r) => [r, t.weight]))
);
const COMPLETED_STATUS_WEIGHT = Object.fromEntries(
  COMPLETED_STATUS_WEIGHTS.map((s) => [s.status, s.weight])
);
const [NEXT_WEIGHT, REWATCH_WEIGHT] = PLAN_WEIGHTS.map((p) => p.weight);

function rawStatus(type, item) {
  return item[MEDIA_CONFIG[type]?.statusField];
}

/** The status group an entry is weighted under. */
export function weightGroupOf(type, item) {
  return GROUP_OVERRIDES[rawStatus(type, item)] ?? statusGroupOf(type, item);
}

/**
 * The plan marks that reach entries through their series or franchise, as a
 * Set of "<kind>:<media_type>:<target_id>" keys, from /api/plan-next rows.
 * Entry-scope marks are on the entries themselves (watch_next, to_rewatch...).
 */
export function groupPlanMarks(rows) {
  return new Set(
    (rows ?? [])
      .filter((r) => r.scope === "series" || r.scope === "franchise")
      .map((r) => `${r.kind}:${r.media_type}:${r.target_id}`)
  );
}

function hasMark(entry, kind, planMarks) {
  const { type, item } = entry;
  const onEntry =
    kind === "next"
      ? item.watch_next || item.read_next || item.play_next
      : item.to_rewatch || item.to_reread || item.to_replay;
  if (onEntry) return true;
  return [item.series_id, item.franchise_id].some(
    (id) => id && planMarks?.has(`${kind}:${type}:${id}`)
  );
}

/**
 * Each stage-2 factor of one entry, by name. `mode` is "all" or the type;
 * `planMarks` is groupPlanMarks' Set, or empty for a guest.
 */
export function entryFactors(entry, { mode = "all", planMarks } = {}) {
  const { type, item } = entry;
  const completed = weightGroupOf(type, item) === "Completed";
  const year = parseInt(decadeOf(type, item), 10);
  const plan = hasMark(entry, "next", planMarks)
    ? NEXT_WEIGHT
    : hasMark(entry, "rewatch", planMarks)
      ? REWATCH_WEIGHT
      : 1;
  return {
    rating: completed
      ? (RATING_WEIGHT[item.my_rating || UNRATED] ?? RATING_WEIGHT[UNRATED]) *
        (COMPLETED_STATUS_WEIGHT[rawStatus(type, item)] ?? 1)
      : 1,
    plan,
    decade: year >= DECADE_FROM ? DECADE_WEIGHTS[0].weight : DECADE_WEIGHTS[1].weight,
    serialization:
      mode === "all" ? 1 : (SERIALIZATION_WEIGHTS[type]?.[item.serialization_status] ?? 1),
  };
}

/** The stage-2 weight of one entry: its factors multiplied. */
export function entryWeight(entry, context) {
  return Object.values(entryFactors(entry, context)).reduce((a, b) => a * b, 1);
}

/**
 * Every entry's chance of being drawn from `pool`, as a Map keyed by
 * entryKey. Unweighted, every entry has the same chance.
 */
export function drawChances(pool, context, weighted = true) {
  const chances = new Map();
  if (!weighted) {
    for (const e of pool) chances.set(entryKey(e), 1 / pool.length);
    return chances;
  }
  const groups = new Map();
  for (const e of pool) {
    const g = weightGroupOf(e.type, e.item);
    const w = entryWeight(e, context);
    if (!groups.has(g)) groups.set(g, { total: 0, entries: [] });
    const bucket = groups.get(g);
    bucket.total += w;
    bucket.entries.push([e, w]);
  }
  const groupTotal = [...groups.keys()].reduce((sum, g) => sum + (GROUP_WEIGHT[g] ?? 1), 0);
  for (const [g, { total, entries }] of groups) {
    const share = (GROUP_WEIGHT[g] ?? 1) / groupTotal;
    for (const [e, w] of entries) chances.set(entryKey(e), (share * w) / total);
  }
  return chances;
}

/**
 * One entry drawn from `pool` with its chance, or null when it is empty. As
 * pickRandom, `previous` is not drawn again when there is anything else.
 */
export function pickWeighted(pool, previous, context, weighted = true, random = Math.random) {
  const candidates =
    previous && pool.length > 1 ? pool.filter((e) => entryKey(e) !== entryKey(previous)) : pool;
  if (candidates.length === 0) return null;
  const chances = drawChances(candidates, context, weighted);
  const roll = random();
  let cumulative = 0;
  for (const entry of candidates) {
    const chance = chances.get(entryKey(entry));
    cumulative += chance;
    if (roll < cumulative) return { entry, chance };
  }
  // Float rounding can leave the sum a hair under 1.
  const last = candidates[candidates.length - 1];
  return { entry: last, chance: chances.get(entryKey(last)) };
}
