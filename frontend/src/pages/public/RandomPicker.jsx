// Frontend: the random picker. /random draws from every visible media type
// with the filters all types share; /random/<type> draws from one type with
// that type's own library filters. Each mode opens with the default filters
// saved on the Picker Defaults page. The filters and the draw are
// lib/randomPicker.js, the data hooks/usePickerData.js; this file holds the
// pick and renders.
import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams } from "react-router-dom";

import MediaCard from "../../components/cards/MediaCard";
import FilterPanel from "../../components/layout/FilterPanel";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ModeStrip from "../../components/picker/ModeStrip";
import { Button, Eyebrow } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useFilterState } from "../../hooks/useFilterState";
import { usePickerData } from "../../hooks/usePickerData";
import { visibleMediaTypes } from "../../lib/gatedTypes";
import { applyFilterDefs, countActiveFilters } from "../../lib/libraryFilters";
import {
  PICKER_TYPES,
  entryKey,
  pickRandom,
  pickerTypeLabel,
} from "../../lib/randomPicker";

const ALL_TYPES = PICKER_TYPES.map((t) => t.type);

// `type` comes from the route, or as a prop from the gated routes App.jsx
// declares on their own behind <ProtectedRoute gatedType>.
export default function RandomPicker({ type: typeProp }) {
  const params = useParams();
  const type = typeProp ?? params.type ?? null;
  const auth = useAuth();
  const visibleTypes = visibleMediaTypes(auth, ALL_TYPES);

  if (type && !ALL_TYPES.includes(type)) return <Navigate to="/random" replace />;

  const mode = type ?? "all";
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <header>
        <Eyebrow className="mb-2">Track</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
          Random Picker
        </h1>
        <p className="text-sm text-text-muted">
          Narrow the pool with filters, then let chance choose what comes next
        </p>
      </header>

      <ModeStrip
        current={mode}
        types={visibleTypes}
        linkTo={(m) => (m === "all" ? "/random" : `/random/${m}`)}
      />

      {/* Keyed on the mode: each mode has its own defs and defaults, so
          switching starts from that mode's defaults with no pick. */}
      <PickerBody key={mode} mode={mode} typesKey={type ?? visibleTypes.join(",")} />
    </div>
  );
}

function PickerBody({ mode, typesKey }) {
  const { entries, filterDefs, defaultFilters, isLoading, error } = usePickerData(
    mode,
    typesKey,
  );

  if (isLoading || error) {
    return (
      <MediaLoadingState
        isLoading={isLoading}
        error={error}
        loadingText="Loading the pool..."
        errorTitle="Database Error"
      />
    );
  }

  // Mounted only once the defaults are in, so the filters open on them.
  return (
    <PickerPool
      mode={mode}
      entries={entries}
      filterDefs={filterDefs}
      defaultFilters={defaultFilters}
    />
  );
}

function PickerPool({ mode, entries, filterDefs, defaultFilters }) {
  const queryClient = useQueryClient();
  const {
    filters,
    toggleFilter,
    clearFilters,
    resetFilters,
    activeFilterCount,
    dynamicFilterOptions,
  } = useFilterState(filterDefs, entries, defaultFilters);

  const hasDefaults = countActiveFilters(defaultFilters) > 0;

  const pool = useMemo(
    () => applyFilterDefs(entries, filterDefs, filters),
    [entries, filterDefs, filters],
  );

  // The pick is held by key and read back from `entries`, so a status change
  // made on its card shows up once the list cache is patched.
  const [pickedKey, setPickedKey] = useState(null);
  const picked = useMemo(
    () => (pickedKey ? entries.find((e) => entryKey(e) === pickedKey) ?? null : null),
    [entries, pickedKey],
  );

  const draw = useCallback(() => {
    const next = pickRandom(pool, picked);
    setPickedKey(next ? entryKey(next) : null);
  }, [pool, picked]);

  // Every filter off and the pick gone.
  const clearAll = useCallback(() => {
    clearFilters();
    setPickedKey(null);
  }, [clearFilters]);

  // Back to the mode's saved defaults, with the pick gone.
  const restoreDefaults = useCallback(() => {
    resetFilters();
    setPickedKey(null);
  }, [resetFilters]);

  const handleUpdated = useCallback(
    (cardType) => (updatedItem) => {
      queryClient.setQueriesData({ queryKey: ["media-list", cardType] }, (old) =>
        Array.isArray(old)
          ? old.map((item) => (item.system_id === updatedItem.system_id ? updatedItem : item))
          : old,
      );
    },
    [queryClient],
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <FilterPanel
        filterDefs={filterDefs}
        filters={filters}
        toggleFilter={toggleFilter}
        activeFilterCount={activeFilterCount}
        dynamicFilterOptions={dynamicFilterOptions}
      />

      <section aria-label="Pick" className="space-y-3 lg:order-none order-first">
        <div className="flex flex-wrap items-center gap-2">
          <Button kind="primary" onClick={draw} disabled={pool.length === 0}>
            <i className="fas fa-dice" aria-hidden="true" />
            {picked ? "Pick again" : "Pick"}
          </Button>
          <Button onClick={clearAll} disabled={activeFilterCount === 0 && !picked}>
            Clear all
          </Button>
          {hasDefaults && (
            <Button kind="ghost" onClick={restoreDefaults}>
              Defaults
            </Button>
          )}
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          {pool.length} in the pool
        </p>

        {pool.length === 0 ? (
          <div className="border border-dashed border-border-strong px-4 py-12 text-center">
            <Eyebrow className="text-text-muted mb-1">Empty pool</Eyebrow>
            <p className="text-sm text-text-faint">
              Nothing matches the current filters. Clear a filter to widen the pool.
            </p>
          </div>
        ) : picked ? (
          <div className="max-w-[16rem]">
            {mode === "all" && (
              <Eyebrow className="mb-1.5">{pickerTypeLabel(picked.type)}</Eyebrow>
            )}
            <MediaCard
              type={picked.type}
              data={picked.item}
              onUpdated={handleUpdated(picked.type)}
            />
          </div>
        ) : (
          <div className="border border-dashed border-border-strong px-4 py-12 text-center">
            <p className="text-sm text-text-faint">Set any filters, then press Pick.</p>
          </div>
        )}
      </section>
    </div>
  );
}
