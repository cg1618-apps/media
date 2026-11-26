// Frontend: statistics page file for StatsFavoriteGrids.
//
// A favourites section of the statistics page: its heading, then one 3x3
// block per grid it is given, two to a row (one on a phone), each block as
// wide as its column. Generic over the grids, so every favourites section -
// a list of grids from config/favoriteGrids.js - is drawn by this one file.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, focusStyle, thumbUrl } from "../../lib/covers";
import {
  favoriteCover,
  favoriteName,
  favoritePool,
  favoritePath,
  slotIn,
} from "../../utils/statsUtils";
import { FAVORITE_GRIDS, visibleFavoriteGrids } from "../../config/favoriteGrids";
import { useAuth } from "../../contexts/AuthContext";
import { RatingStamp, Slip } from "../../components/ui/primitives";
import LazyImage from "../../components/ui/LazyImage";
import StatsSectionHeader from "./StatsSectionHeader";

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function FavoriteGrid({ grid, rows, covers }) {
  const slotMap = {};
  rows.forEach((row) => {
    const slot = slotIn(row, grid);
    if (slot !== null) slotMap[slot] = row;
  });

  return (
    // Two blocks to a row, each filling its column: three to a row left the
    // covers too small to read.
    <Slip id={grid.id} title={grid.title} className="w-full min-w-0 scroll-mt-24">
      <div className="grid grid-cols-3 gap-3">
        {SLOTS.map((slot) => {
          const row = slotMap[slot];
          if (row) {
            // Empty when the row carries no public_id: the tile still renders,
            // just not as a link to nowhere.
            const path = favoritePath(row, grid);
            const Wrapper = path ? Link : "div";
            const wrapperProps = path ? { to: path } : {};
            const name = favoriteName(row, grid);
            const cover = favoriteCover(row, grid, covers);
            return (
              <Wrapper
                key={slot}
                {...wrapperProps}
                className="group relative overflow-hidden border border-border hover:border-text transition-colors"
              >
                <div className="aspect-[3/4] overflow-hidden bg-surface-2">
                  <LazyImage
                    src={thumbUrl(cover.url)}
                    alt={name}
                    className="w-full h-full object-cover"
                    style={focusStyle(cover.focus)}
                    onError={(e) => {
                      e.target.src = FALLBACK_SVG;
                    }}
                  />
                </div>
                <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1.5">
                  <p className="text-white text-xs font-display leading-tight truncate">
                    {name}
                  </p>
                </div>
                <span className="absolute top-1.5 left-1.5 bg-ink text-ink-text font-mono text-[10px] px-1.5 py-0.5 leading-none">
                  {slot}
                </span>
                <RatingStamp
                  rating={row.my_rating}
                  className="absolute top-1.5 right-1.5"
                />
              </Wrapper>
            );
          }
          return (
            <div
              key={slot}
              className="aspect-[3/4] border border-dashed border-border-strong flex flex-col items-center justify-center"
            >
              <span className="font-display text-2xl text-text-faint">{slot}</span>
              <span className="font-mono text-[10px] text-text-faint mt-1">
                Empty
              </span>
            </div>
          );
        })}
      </div>
    </Slip>
  );
}

export default function StatsFavoriteGrids({
  grids: allGrids = FAVORITE_GRIDS,
  franchises,
  series,
  entriesByType = {},
  studios,
  people,
  allEntriesByFranchise,
  allEntriesBySeries,
}) {
  const covers = {
    byFranchise: allEntriesByFranchise,
    bySeries: allEntriesBySeries,
  };
  // A gated grid (the two h-game ones) only for a session that can see it.
  const grids = visibleFavoriteGrids(useAuth(), allGrids);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {grids.map((grid) => (
        <FavoriteGrid
          key={grid.id}
          grid={grid}
          rows={favoritePool(grid, {
            franchises,
            series,
            bySeries: allEntriesBySeries,
            entries: entriesByType[grid.entryType],
            studios,
            people,
          })}
          covers={covers}
        />
      ))}
    </div>
  );
}

/**
 * One favourites section: `section` is an entry of STATS_SECTIONS made by
 * favoriteSection (sections.js) - its id, its label as the heading, and its
 * grids. The rest of the props are the rows the grids draw from.
 */
export function StatsFavoriteSection({ section, ...data }) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <StatsSectionHeader title={section.label} />
      <StatsFavoriteGrids grids={section.grids} {...data} />
    </section>
  );
}
