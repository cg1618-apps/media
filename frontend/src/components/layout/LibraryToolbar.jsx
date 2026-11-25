// Frontend: the one toolbar row every library draws - the twelve media
// libraries (LibraryLayout), the group libraries (collection, franchise,
// series) and the entity libraries (studio, publisher, person, character).
//
// Left to right: the search field, which takes all the width the other
// controls leave; the sort (SortControl: a "Sort" caption, the select and the
// direction button); the Filters toggle, for a library that has filters; the
// grid / table view toggle, for a library that has both views; and
// `trailing`, which a library may use for its result count.
import { FilterToggleButton } from "./FilterPanel";
import SortControl from "./SortControl";

/** The grid / table switch. "table" is the list view on every library. */
export function ViewToggle({ value, onChange }) {
  const option = (key, label, icon) => (
    <button
      type="button"
      onClick={() => onChange(key)}
      aria-label={label}
      aria-pressed={value === key}
      title={label}
      className={`px-3 py-1.5 text-sm transition-colors ${
        value === key
          ? "bg-brand text-on-brand"
          : "bg-surface text-text-faint hover:text-text-muted"
      }`}
    >
      <i className={`fas ${icon}`} aria-hidden="true"></i>
    </button>
  );
  return (
    <div className="flex border border-border-strong">
      {option("grid", "Grid view", "fa-th-large")}
      {option("table", "Table view", "fa-list")}
    </div>
  );
}

/**
 * search:  { value, onChange(value), placeholder }
 * sort:    SortControl's props - { options, value, onChange, reversed, onReversedChange }
 * filters: { open, onToggle, activeFilterCount }, or absent for a library
 *          with no filters
 * view:    { value: "grid" | "table", onChange }, or absent for a library
 *          with one view
 * trailing: drawn after everything else
 */
export default function LibraryToolbar({ search, sort, filters, view, trailing = null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-48">
        <i
          className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-text-faint text-xs pointer-events-none"
          aria-hidden="true"
        ></i>
        <input
          type="search"
          placeholder={search.placeholder ?? "Search..."}
          value={search.value}
          onChange={(e) => search.onChange(e.target.value)}
          className="w-full pl-8 pr-8 py-1.5 bg-surface border border-border-strong text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand transition search-own-clear"
        />
        {search.value && (
          <button
            type="button"
            onClick={() => search.onChange("")}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
          >
            <i className="fas fa-times text-xs" aria-hidden="true"></i>
          </button>
        )}
      </div>

      <SortControl {...sort} />

      {filters && (
        <FilterToggleButton
          className="py-1.5"
          open={filters.open}
          onToggle={filters.onToggle}
          activeFilterCount={filters.activeFilterCount}
        />
      )}

      {view && <ViewToggle value={view.value} onChange={view.onChange} />}

      {trailing}
    </div>
  );
}
