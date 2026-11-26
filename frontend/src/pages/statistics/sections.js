// The statistics page's own table of contents.
//
// One list, read by the contents column and by the page: a section's `id` is
// the anchor the contents scroll to AND the `id` the block renders with, so a
// renamed section cannot leave the contents pointing at nothing.
import { FAVORITE_ENTITY_GRIDS, FAVORITE_GRIDS } from "../../config/favoriteGrids";
import { visibleByType } from "../../lib/gatedTypes";

// A favourites section: its heading, and one sub-row per grid - there are too
// many grids to find by scrolling. A gated grid's row carries its type, and
// statsTocItems drops it for a session that cannot see the type.
function favoriteSection(id, label, grids) {
  return {
    id,
    label,
    grids,
    children: grids.map((grid) => ({
      id: grid.id,
      label: grid.short,
      gatedType: grid.gatedType,
    })),
  };
}

export const FAVORITE_MEDIA_SECTION = favoriteSection(
  "favourites",
  "Favourite Media",
  FAVORITE_GRIDS,
);

// Studios and people. Drawn, and listed in the contents, only for a viewer
// who may read both (view.studio and view.person): statsTocItems is given
// the sections the page actually renders.
export const FAVORITE_ENTITY_SECTION = favoriteSection(
  "favourite-entities",
  "Favourite Entity",
  FAVORITE_ENTITY_GRIDS,
);

export const STATS_SECTIONS = [
  FAVORITE_MEDIA_SECTION,
  FAVORITE_ENTITY_SECTION,
  { id: "rating-distribution", label: "Rating distribution" },
  { id: "anime-seasonal", label: "Anime seasonal" },
  { id: "game-spend", label: "Game spend" },
  // The catalogue sections (StatsCatalogue.jsx), below the personal ones.
  { id: "catalogue-types", label: "Entries by type" },
  { id: "catalogue-seasons", label: "Anime by season" },
  { id: "catalogue-ratings", label: "Catalogue ratings" },
];

/**
 * The TableOfContents rows for this session, in page order: each section at
 * level 1, its children at level 2, a gated child only when its type is
 * visible.
 */
export function statsTocItems(auth, sections = STATS_SECTIONS) {
  return sections.flatMap((section) => [
    { id: section.id, label: section.label, level: 1 },
    ...visibleByType(auth, section.children || [], (c) => c.gatedType).map((child) => ({
      id: child.id,
      label: child.label,
      level: 2,
    })),
  ]);
}
