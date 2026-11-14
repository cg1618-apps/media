// Frontend: the newest entries of each media type the viewer may see, one
// section per type, from `GET /api/dashboard/recent`. The server narrows the
// rows to the viewer's types and mode, as on every catalogue read, and cuts
// them per type; a type with nothing visible sends no rows, so it has no
// section. Nothing here filters.
//
// Anime shows two rows of cards, every other type one. A row is as many cards
// as the grid has columns at that width - 2, then 3 from sm, 4 from lg, 6 from
// xl - so a section is always whole rows, never a row with a gap at its end.
// The server sends enough for the widest grid (ROWS x 6) and the narrower
// widths hide the cards past their last full row.
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { MEDIA_TYPES } from "../../config/fieldOptions";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { useApiQuery } from "../../hooks/useApiQuery";
import { entityPath } from "../../lib/entityPath";
import { focusStyle, getCoverUrl, thumbUrl } from "../../lib/covers";
import LazyImage from "../ui/LazyImage";
import { Eyebrow } from "../ui/primitives";

/** Columns per breakpoint, smallest first; the grid classes below match. */
export const GRID_COLUMNS = { base: 2, sm: 3, lg: 4, xl: 6 };
const GRID_CLASSES = "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4";

/** Rows of cards per type: anime two, every other type one. */
export function rowsFor(type) {
  return type === "anime" ? 2 : 1;
}

/** The most any type is sent: anime's rows at the widest grid. */
export const RECENT_PER_TYPE = rowsFor("anime") * GRID_COLUMNS.xl;

/**
 * The classes that show the `index`-th card of a section only while it falls
 * inside that section's `rows` full rows at the current width. Written out in
 * full so Tailwind sees every class.
 */
export function cardVisibility(index, rows) {
  const within = (columns) => index < rows * columns;
  return [
    within(GRID_COLUMNS.base) ? "" : "hidden",
    within(GRID_COLUMNS.sm) ? "sm:block" : "sm:hidden",
    within(GRID_COLUMNS.lg) ? "lg:block" : "lg:hidden",
    within(GRID_COLUMNS.xl) ? "xl:block" : "xl:hidden",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * The rows grouped by type, in the registry's type order, each cut to what
 * its rows can show at the widest grid. A type the server sent nothing for
 * is absent.
 */
export function sectionsOf(entries) {
  const byType = new Map();
  for (const entry of entries) {
    if (!byType.has(entry.media_type)) byType.set(entry.media_type, []);
    byType.get(entry.media_type).push(entry);
  }
  const known = MEDIA_TYPES.filter((t) => byType.has(t));
  // A type this build does not list still gets a section, after the rest.
  const unknown = [...byType.keys()].filter((t) => !MEDIA_TYPES.includes(t));
  return [...known, ...unknown].map((type) => ({
    type,
    rows: rowsFor(type),
    entries: byType.get(type).slice(0, rowsFor(type) * GRID_COLUMNS.xl),
  }));
}

export default function RecentlyAdded() {
  const query = useApiQuery(["dashboard", "recent"], endpoints.dashboard.recent(), {
    params: { per_type: RECENT_PER_TYPE },
  });

  if (query.isLoading) {
    return <p className="pt-6 text-sm text-text-faint">Loading…</p>;
  }
  if (query.isError) {
    return <p className="pt-6 text-sm text-danger">{query.error.message}</p>;
  }
  const sections = sectionsOf(query.data ?? []);
  if (sections.length === 0) {
    return (
      <div className="mt-6 py-8 px-4 border border-dashed border-border-strong text-center">
        <p className="text-sm text-text-faint">Nothing has been added yet.</p>
      </div>
    );
  }

  return (
    <div data-testid="recently-added" className="pt-6 space-y-8">
      {sections.map((section) => (
        <section
          key={section.type}
          aria-label={mediaTypeLabel(section.type)}
          data-testid={`recent-${section.type}`}
        >
          <Eyebrow as="h3" className="mb-3">
            {mediaTypeLabel(section.type)}
          </Eyebrow>
          <ul className={GRID_CLASSES}>
            {section.entries.map((entry, index) => (
              <li key={entry.system_id} className={cardVisibility(index, section.rows)}>
                <Link
                  to={entityPath(entry.media_type, entry)}
                  className="block bg-surface border border-border hover:border-border-strong transition-colors"
                >
                  <LazyImage
                    src={thumbUrl(getCoverUrl(entry.cover_image_file))}
                    alt=""
                    className="w-full aspect-[2/3] object-cover"
                    style={focusStyle(entry.cover_image_focus)}
                  />
                  <p className="p-2 font-display text-sm text-text leading-tight line-clamp-2">
                    {entry.display_name}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
