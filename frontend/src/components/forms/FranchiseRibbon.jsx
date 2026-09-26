// Frontend: "Other entries in this franchise" - the ribbon at the top of a
// Modify editor listing the entry's siblings, grouped by series, each a chip
// that opens that entry's editor.
//
// Used by the game, h-comic, h-game and hentai editors. The seven older types
// build the same ribbon inline in Modify.jsx; the markup here matches theirs,
// so the two read as one control.
import { getDisplayName } from "../../utils/media";

export default function FranchiseRibbon({
  entries,
  type,
  franchiseId,
  excludeId,
  allSeries = [],
  badge,
  onOpen,
}) {
  if (!franchiseId) return null;
  const siblings = (entries || []).filter(
    (e) => e.franchise_id === franchiseId && e.system_id !== excludeId,
  );
  if (!siblings.length) return null;

  const name = (e) => getDisplayName(e, type) || "Unknown";
  const byName = (x, y) => name(x).localeCompare(name(y));
  const bySeries = {};
  const noSeries = [];
  for (const e of siblings) {
    if (e.series_id) (bySeries[e.series_id] ||= []).push(e);
    else noSeries.push(e);
  }
  Object.values(bySeries).forEach((arr) => arr.sort(byName));
  noSeries.sort(byName);

  const renderChip = (e) => {
    const tag = badge?.(e);
    return (
      <button
        key={e.system_id}
        type="button"
        onClick={() => onOpen(e)}
        className="flex items-center gap-1.5 px-3 py-1 bg-surface border border-border rounded-full text-xs font-bold text-text-muted hover:border-brand hover:text-brand transition"
      >
        {tag && (
          <span className="text-[9px] font-black text-text-faint shrink-0">
            {tag}
          </span>
        )}
        {name(e)}
      </button>
    );
  };

  return (
    <div className="mb-5 bg-surface-2 border border-border rounded-xl px-4 py-3 space-y-3 max-h-64 overflow-y-auto">
      <p className="sticky top-0 z-10 -mx-4 -mt-3 bg-canvas px-4 pt-3 pb-1 text-[10px] font-black text-text-faint uppercase tracking-widest">
        Other entries in this franchise
      </p>
      {Object.entries(bySeries).map(([sid, group]) => {
        const s = allSeries.find((x) => x.system_id === sid);
        return (
          <div key={sid}>
            <p className="text-[9px] font-black text-brand/60 uppercase tracking-widest mb-1.5">
              {s ? getDisplayName(s, "series") : "Series"}
            </p>
            <div className="flex gap-2 flex-wrap">{group.map(renderChip)}</div>
          </div>
        );
      })}
      {noSeries.length > 0 && (
        <div>
          {Object.keys(bySeries).length > 0 && (
            <p className="text-[9px] font-black text-text-faint uppercase tracking-widest mb-1.5">
              No Series
            </p>
          )}
          <div className="flex gap-2 flex-wrap">{noSeries.map(renderChip)}</div>
        </div>
      )}
    </div>
  );
}
