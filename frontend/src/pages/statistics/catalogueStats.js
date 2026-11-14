// Frontend: statistics page file for catalogueStats.
//
// The arithmetic behind the catalogue sections, as pure functions over what
// GET /api/statistics/catalogue returns, so it can be tested without
// rendering the page.
import { MEDIA_TYPE_LABELS } from "../../config/mediaRegistry";

// The registry's order, so the table reads the way the Library tab does; a
// type the registry does not name goes last.
const TYPE_ORDER = Object.keys(MEDIA_TYPE_LABELS);
const typeRank = (t) => (TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : TYPE_ORDER.length);

/** `by_type` rows in registry order. */
export function sortTypeRows(byType) {
  return [...(byType || [])].sort((a, b) => typeRank(a.media_type) - typeRank(b.media_type));
}

/** How many seasons the page shows before "Show all". */
export const SEASONS_SHOWN = 12;

// The two published scores. `top` is the top bucket's lower bound: a perfect
// score is counted in it (the server folds 10 into 9 and 100 into 90), so its
// label reaches the end of the scale.
export const SCORE_SCALES = {
  mal: { width: 1, top: 9, max: 10 },
  anilist: { width: 10, top: 90, max: 100 },
};

// One hue, stepped by opacity, high scores strongest - the ladder the
// personal rating cards use. Literal class names, so Tailwind sees them.
const BUCKET_COLORS = [
  "bg-brand",
  "bg-brand/90",
  "bg-brand/80",
  "bg-brand/70",
  "bg-brand/60",
  "bg-brand/50",
  "bg-brand/40",
  "bg-brand/30",
  "bg-brand/20",
  "bg-border-strong",
];

// MAL's are decimals, so a bucket reads up to the next whole point ("8–9");
// AniList's are integers, so up to the last one in it ("80–89"). The top
// bucket reaches the end of the scale either way.
function bucketLabel(scale, lower) {
  if (lower === scale.top) return `${lower}–${scale.max}`;
  const upper = scale.width > 1 ? lower + scale.width - 1 : lower + 1;
  return `${lower}–${upper}`;
}

/** The media types present in one score's rows, in registry order. */
export function scoredTypes(rows) {
  return [...new Set((rows || []).map((r) => r.media_type))].sort(
    (a, b) => typeRank(a) - typeRank(b),
  );
}

/**
 * Every bucket of one score, highest first, pooled over every media type -
 * or over `mediaType` alone when one is named. A bucket nothing falls in is
 * kept at zero, so the chart's shape is the same whatever is selected.
 * Returns the RatingDistributionCard rows and the pooled total.
 */
export function scoreBuckets(rows, scaleKey, mediaType = null) {
  const scale = SCORE_SCALES[scaleKey];
  const counts = {};
  for (const row of rows || []) {
    if (mediaType && row.media_type !== mediaType) continue;
    counts[row.bucket] = (counts[row.bucket] || 0) + row.entry_count;
  }
  const lowers = [];
  for (let lower = scale.top; lower >= 0; lower -= scale.width) lowers.push(lower);
  const out = lowers.map((lower, i) => ({
    label: bucketLabel(scale, lower),
    color: BUCKET_COLORS[i] || BUCKET_COLORS[BUCKET_COLORS.length - 1],
    count: counts[lower] || 0,
    dim: false,
  }));
  return { rows: out, total: out.reduce((sum, r) => sum + r.count, 0) };
}
