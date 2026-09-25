// The statistics page's own table of contents.
//
// One list, read by the sidebar and by the page: a section's `id` is the
// anchor the sidebar scrolls to AND the `id` the block renders with, so a
// renamed section cannot leave the sidebar pointing at nothing.
import { FAVORITE_GRIDS } from "../../config/favoriteGrids";

export const STATS_SECTIONS = [
  {
    id: "favourites",
    label: "Favourites",
    // Nine grids is too many to find by scrolling, so each one is its own
    // sidebar target. A gated grid's link carries its type, and the sidebar
    // drops it for a session that cannot see the type.
    children: FAVORITE_GRIDS.map((grid) => ({
      id: grid.id,
      label: grid.short,
      gatedType: grid.gatedType,
    })),
  },
  { id: "rating-distribution", label: "Rating distribution" },
  { id: "anime-seasonal", label: "Anime seasonal" },
  { id: "game-spend", label: "Game spend" },
];

// Flattened, parents included, in the order they appear down the page. What
// the scroll spy watches.
export const STATS_SECTION_IDS = STATS_SECTIONS.flatMap((section) => [
  section.id,
  ...(section.children || []).map((child) => child.id),
]);
