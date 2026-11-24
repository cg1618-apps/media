// Frontend: the chip panel that renders a list of FilterDefs (the shape is
// documented in hooks/useLibraryState.js). Used by LibraryLayout, the random
// picker and the entity libraries (character, person, studio, publisher).
import { useState } from "react";

import { ClearAllButton, Eyebrow } from "../ui/primitives";
import {
  countActiveFilters,
  isParentActive,
  toggleParentValues,
} from "../../lib/libraryFilters";

// ---------------------------------------------------------------------------
// FilterTag — chip-shaped button for toggling a set-type filter value
// ---------------------------------------------------------------------------
function Chip({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      className={`px-2 py-0.5 border font-mono text-[10px] transition-colors ${
        active
          ? "bg-brand text-on-brand border-brand"
          : "bg-surface text-text-muted border-border-strong hover:border-text hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function FilterTag({ filters, toggleFilter, group, value, label, hint }) {
  const activeSet = filters[group];
  const active = activeSet instanceof Set && activeSet.has(value);
  return (
    <Chip active={active} onClick={() => toggleFilter(group, value)} title={hint}>
      {label}
    </Chip>
  );
}

// ---------------------------------------------------------------------------
// ParentTag — a def's `parent` chip and its children, boxed together
// ---------------------------------------------------------------------------
// The parent reads as on only while every child is on; clicking it applies
// toggleParentValues. It goes through toggleFilter, one call per child whose
// state changes, so every caller's existing toggleFilter serves it unchanged.
function ParentTag({ filters, toggleFilter, fd }) {
  const { label, children } = fd.parent;
  if (!children || children.length === 0) return null;
  const activeSet = filters[fd.key];
  const onParentClick = () => {
    const next = toggleParentValues(activeSet, children);
    for (const child of children) {
      const wasOn = activeSet instanceof Set && activeSet.has(child);
      if (wasOn !== next.has(child)) toggleFilter(fd.key, child);
    }
  };
  return (
    <span
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1.5 border border-dashed border-border-strong px-1.5 py-1"
    >
      <Chip active={isParentActive(activeSet, children)} onClick={onParentClick}>
        {label}
      </Chip>
      {children.map((v) => (
        <FilterTag
          key={v}
          filters={filters}
          toggleFilter={toggleFilter}
          group={fd.key}
          value={v}
          label={fd.optionLabel ? fd.optionLabel(v) : v}
        />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// FilterToggleButton — the "Filters" button that shows and hides the panel,
// with the count of chips currently on
// ---------------------------------------------------------------------------
export function FilterToggleButton({ open, onToggle, activeFilterCount, className = "py-2" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex items-center gap-2 px-3 border text-sm transition-colors ${className} ${
        open
          ? "bg-surface-2 border-border-strong text-text"
          : "bg-surface border-border-strong text-text hover:border-text"
      }`}
    >
      Filters
      {activeFilterCount > 0 && (
        <span className="bg-brand text-on-brand font-mono text-[10px] px-1.5 py-0.5 leading-none">
          {activeFilterCount}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// FilterGroup — one def: a checkbox for a boolean, else a labelled chip row
// ---------------------------------------------------------------------------
function FilterGroup({ fd, filters, toggleFilter, dynamicFilterOptions }) {
  if (fd.type === "boolean") {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
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
  if (fd.type === "set-dynamic" && options.length === 0) return null;

  return (
    <div>
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
            hint={fd.optionHint ? fd.optionHint(v) : undefined}
          />
        ))}
        {fd.parent && (
          <ParentTag filters={filters} toggleFilter={toggleFilter} fd={fd} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AdvancedFilters — the defs flagged `advanced`, behind a toggle
// ---------------------------------------------------------------------------
// Collapsed whenever the panel mounts, so every visit opens on the ordinary
// filters. The toggle counts the chips on inside, so a narrowing the viewer
// cannot see while it is collapsed is never a silent one.
function AdvancedFilters({ defs, filters, groupProps }) {
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFilters(
    Object.fromEntries(defs.map((fd) => [fd.key, filters[fd.key]])),
  );
  return (
    <div className="space-y-3 border-t border-dashed border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 font-mono text-[11px] text-text-muted hover:text-brand transition"
      >
        <i className={`fas ${open ? "fa-chevron-down" : "fa-chevron-right"} text-[9px]`} aria-hidden="true" />
        Advanced filters
        {activeCount > 0 && (
          <span className="bg-brand text-on-brand font-mono text-[10px] px-1.5 py-0.5 leading-none">
            {activeCount}
          </span>
        )}
      </button>
      {open && defs.map((fd) => <FilterGroup key={fd.key} fd={fd} {...groupProps} />)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterPanel — renders all FilterDef groups for the current config
// ---------------------------------------------------------------------------
// `resetFilters` is optional: a caller that opens on a default other than
// empty (the entity libraries) passes it while the state is off that default,
// and the panel draws Reset beside Clear all. Clear all still empties every
// group.
export default function FilterPanel({
  filterDefs,
  filters,
  toggleFilter,
  clearFilters,
  resetFilters,
  activeFilterCount,
  dynamicFilterOptions,
}) {
  const groupProps = { filters, toggleFilter, dynamicFilterOptions };
  // An advanced def with no chips to draw (a dynamic one over a library
  // nobody has tagged) is left out, and with none left there is no toggle.
  const advancedDefs = filterDefs.filter(
    (fd) =>
      fd.advanced &&
      (fd.type !== "set-dynamic" || (dynamicFilterOptions[fd.key] ?? []).length > 0),
  );
  return (
    <div className="border-y border-border py-4 mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <Eyebrow as="h3" className="text-text-muted">Filters</Eyebrow>
        <div className="flex items-center gap-4">
          {resetFilters && (
            <button
              onClick={resetFilters}
              className="font-mono text-[10px] text-text-faint hover:text-brand transition"
            >
              Reset
            </button>
          )}
          {/* A caller with its own clear control leaves clearFilters out. */}
          {clearFilters && (
            <ClearAllButton
              active={activeFilterCount > 0}
              onClick={clearFilters}
            />
          )}
        </div>
      </div>

      {filterDefs.filter((fd) => !fd.advanced).map((fd) => (
        <FilterGroup key={fd.key} fd={fd} {...groupProps} />
      ))}

      {advancedDefs.length > 0 && (
        <AdvancedFilters
          defs={advancedDefs}
          filters={filters}
          groupProps={groupProps}
        />
      )}
    </div>
  );
}
