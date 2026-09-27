// Frontend: the chip panel that renders a list of FilterDefs (the shape is
// documented in hooks/useLibraryState.js). Used by LibraryLayout and the
// random picker.
import { Eyebrow } from "../ui/primitives";

// ---------------------------------------------------------------------------
// FilterTag — chip-shaped button for toggling a set-type filter value
// ---------------------------------------------------------------------------
function FilterTag({ filters, toggleFilter, group, value, label }) {
  const activeSet = filters[group];
  const active = activeSet instanceof Set && activeSet.has(value);
  return (
    <button
      onClick={() => toggleFilter(group, value)}
      aria-pressed={active}
      className={`px-2 py-0.5 border font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${
        active
          ? "bg-brand text-on-brand border-brand"
          : "bg-surface text-text-muted border-border-strong hover:border-text hover:text-text"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterPanel — renders all FilterDef groups for the current config
// ---------------------------------------------------------------------------
export default function FilterPanel({
  filterDefs,
  filters,
  toggleFilter,
  clearFilters,
  activeFilterCount,
  dynamicFilterOptions,
}) {
  return (
    <div className="border-y border-border py-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow as="h3" className="text-text-muted">Filters</Eyebrow>
        {/* A caller with its own clear control leaves clearFilters out. */}
        {clearFilters && activeFilterCount > 0 && (
          <button
            onClick={clearFilters}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint hover:text-danger transition"
          >
            Clear all
          </button>
        )}
      </div>

      {filterDefs.map((fd) => {
        if (fd.type === "boolean") {
          return (
            <label key={fd.key} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters[fd.key]}
                onChange={() => toggleFilter(fd.key, null)}
                className="accent-brand"
              />
              <span className="text-xs text-text-muted">{fd.label}</span>
            </label>
          );
        }

        // Resolve options list
        const options =
          fd.type === "set-dynamic"
            ? (dynamicFilterOptions[fd.key] ?? [])
            : fd.type === "set-grouped"
              ? fd.groupOptions
              : fd.options;

        // Hide dynamic filters that have no data yet
        if ((fd.type === "set-dynamic") && options.length === 0) return null;

        return (
          <div key={fd.key}>
            <Eyebrow className="mb-1.5">{fd.label}</Eyebrow>
            <div className="flex flex-wrap gap-1.5">
              {options.map((v) => (
                <FilterTag
                  key={v}
                  filters={filters}
                  toggleFilter={toggleFilter}
                  group={fd.key}
                  value={v}
                  label={fd.optionLabel ? fd.optionLabel(v) : v}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
