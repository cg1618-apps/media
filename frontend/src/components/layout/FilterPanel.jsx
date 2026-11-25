// Frontend: the chip panel that renders a list of FilterDefs (the shape is
// documented in hooks/useLibraryState.js). Used by LibraryLayout, the random
// picker and the entity libraries (character, person, studio, publisher).
import { useId, useState } from "react";

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
// OptionsHelp — the circled "?" after a hinted def's label
// ---------------------------------------------------------------------------
// Hovering or focusing it lists every option with its hint, so what each chip
// stands for can be read at once rather than one chip title at a time.
function OptionsHelp({ label, options, optionLabel, optionHint }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={`What the ${label} options mean`}
        aria-describedby={open ? tipId : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-text-faint hover:text-text focus-visible:outline-none focus-visible:text-text"
      >
        <i className="fas fa-circle-question text-[11px]" aria-hidden="true"></i>
      </button>
      {open && (
        <div
          role="tooltip"
          id={tipId}
          className="absolute left-0 top-full mt-1 z-20 w-72 border border-border-strong bg-surface px-3 py-2 shadow-lg font-sans"
        >
          <dl className="space-y-1.5 text-xs">
            {options.map((v) => (
              <div key={v}>
                <dt className="font-medium text-text">{optionLabel ? optionLabel(v) : v}</dt>
                <dd className="text-text-muted">{optionHint(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// RangeGroup — a range def: a minimum and a maximum, either one enough
// ---------------------------------------------------------------------------
// The whole { min, max } goes through toggleFilter, which sets a range rather
// than toggling it (hooks/useFilterState.js).
const RANGE_INPUT_CLS =
  "w-20 px-2 py-0.5 border border-border-strong bg-surface text-text font-mono text-[11px] focus:outline-none focus:ring-2 focus:ring-brand";

function RangeGroup({ fd, value, toggleFilter }) {
  const range = value || { min: "", max: "" };
  const set = (bound) => (e) => toggleFilter(fd.key, { ...range, [bound]: e.target.value });
  return (
    <div>
      <Eyebrow className="mb-1.5">{fd.label}</Eyebrow>
      <div className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
        <input
          type="number"
          min="0"
          inputMode="decimal"
          aria-label={`${fd.label} minimum`}
          placeholder="Min"
          value={range.min}
          onChange={set("min")}
          className={RANGE_INPUT_CLS}
        />
        <span aria-hidden="true">–</span>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          aria-label={`${fd.label} maximum`}
          placeholder="Max"
          value={range.max}
          onChange={set("max")}
          className={RANGE_INPUT_CLS}
        />
        {fd.unit && <span>{fd.unit}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FilterGroup — one def: a checkbox for a boolean, else a labelled chip row
// ---------------------------------------------------------------------------
function FilterGroup({ fd, filters, toggleFilter, dynamicFilterOptions }) {
  if (fd.type === "range") {
    return <RangeGroup fd={fd} value={filters[fd.key]} toggleFilter={toggleFilter} />;
  }
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
      <Eyebrow className="mb-1.5 flex items-center gap-1.5">
        {fd.label}
        {fd.optionHint && (
          <OptionsHelp
            label={fd.label}
            options={options}
            optionLabel={fd.optionLabel}
            optionHint={fd.optionHint}
          />
        )}
      </Eyebrow>
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
// FilterRows — the ordinary defs, consecutive defs sharing a `row` side by side
// ---------------------------------------------------------------------------
function FilterRows({ defs, groupProps }) {
  const rows = [];
  for (const fd of defs) {
    const last = rows[rows.length - 1];
    if (fd.row && last?.row === fd.row) last.defs.push(fd);
    else rows.push({ row: fd.row, defs: [fd] });
  }
  return rows.map(({ row, defs: rowDefs }) =>
    rowDefs.length === 1 ? (
      <FilterGroup key={rowDefs[0].key} fd={rowDefs[0]} {...groupProps} />
    ) : (
      <div key={row} className="flex flex-wrap items-start gap-x-10 gap-y-3">
        {rowDefs.map((fd) => (
          <FilterGroup key={fd.key} fd={fd} {...groupProps} />
        ))}
      </div>
    ),
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

      <FilterRows defs={filterDefs.filter((fd) => !fd.advanced)} groupProps={groupProps} />

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
