// Frontend: info component file for CompanyCredits.
//
// The entries a studio or publisher is credited on, grouped by media type as
// its GET /api/{studio,publisher}/{id}/entries returns them, each drawn as the
// type's library card without the tracker (MediaCard's `credit` variant). One
// sort, above the groups, orders every group alike (lib/creditSorts.js).
import MediaCard from "../cards/MediaCard";
import SortControl from "../layout/SortControl";
import { Eyebrow } from "../ui/primitives";
import { useCreditSort } from "../../hooks/useCreditSort";

/** The credit sort's control, for the state useCreditSort holds. */
export function CreditSortControl({ creditSort }) {
  return (
    <SortControl
      options={creditSort.options}
      value={creditSort.sort}
      onChange={creditSort.setSort}
      reversed={creditSort.reversed}
      onReversedChange={creditSort.setReversed}
      className="justify-end"
    />
  );
}

export default function CompanyCredits({ groups }) {
  const creditSort = useCreditSort();

  if (groups.length === 0) {
    return (
      <section className="border border-dashed border-border-strong px-4 py-10 text-center">
        <Eyebrow className="mb-1">Empty</Eyebrow>
        <p className="text-sm text-text-muted">No credited entries</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <CreditSortControl creditSort={creditSort} />
      {groups.map((group) => (
        <section key={group.media_type}>
          <h2 className="flex items-center gap-3 mb-3 font-mono text-[11px] text-text-muted">
            {group.label}
            <span className="text-text-faint">{group.entries.length}</span>
            <span className="flex-1 border-t border-dotted border-border-strong/60" />
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {creditSort.sorted(group.entries, group.media_type).map((entry) => (
              <MediaCard
                key={entry.system_id}
                type={group.media_type}
                variant="credit"
                data={entry}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
