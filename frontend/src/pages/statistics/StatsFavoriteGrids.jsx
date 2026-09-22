// Frontend: statistics page file for StatsFavoriteGrids.
import { Link } from "react-router-dom";
import { FALLBACK_SVG } from "../../utils/media";
import {
  favoriteCover,
  favoriteName,
  favoritePool,
  favoritePath,
  slotIn,
} from "../../utils/statsUtils";
import { FAVORITE_GRIDS } from "../../config/favoriteGrids";
import { RatingStamp, Slip } from "../../components/ui/primitives";

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function FavoriteGrid({ grid, rows, covers }) {
  const slotMap = {};
  rows.forEach((row) => {
    const slot = slotIn(row, grid);
    if (slot !== null) slotMap[slot] = row;
  });

  return (
    // The block is sized to its nine covers rather than stretched across the
    // column: a 3x3 of portrait covers has a natural width, and a wider card
    // only adds whitespace beside it.
    <Slip
      id={grid.id}
      title={grid.title}
      className="w-full sm:w-[19rem] shrink-0 scroll-mt-24"
    >
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
            return (
              <Wrapper
                key={slot}
                {...wrapperProps}
                className="group relative overflow-hidden border border-border hover:border-text transition-colors"
              >
                <div className="aspect-[3/4] bg-surface-2">
                  <img
                    src={favoriteCover(row, grid, covers)}
                    alt={name}
                    className="w-full h-full object-cover"
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
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint mt-1">
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
  franchises,
  series,
  entriesByType,
  allEntriesByFranchise,
  allEntriesBySeries,
}) {
  const covers = {
    byFranchise: allEntriesByFranchise,
    bySeries: allEntriesBySeries,
  };
  return (
    <div className="flex flex-wrap gap-6">
      {FAVORITE_GRIDS.map((grid) => (
        <FavoriteGrid
          key={grid.id}
          grid={grid}
          rows={favoritePool(grid, {
            franchises,
            series,
            bySeries: allEntriesBySeries,
            entries: entriesByType[grid.entryType],
          })}
          covers={covers}
        />
      ))}
    </div>
  );
}
