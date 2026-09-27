// Frontend: the random picker. /random draws from every visible media type
// with the filters all types share; /random/<type> draws from one type with
// that type's own library filters. The filters and the draw are
// lib/randomPicker.js; this file fetches, holds the pick and renders.
import { useCallback, useMemo, useState } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useParams } from "react-router-dom";

import MediaCard from "../../components/cards/MediaCard";
import FilterPanel from "../../components/layout/FilterPanel";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Button, Eyebrow } from "../../components/ui/primitives";
import { MEDIA_CONFIG } from "../../config/mediaRegistry";
import { useAuth } from "../../contexts/AuthContext";
import { useFilterState } from "../../hooks/useFilterState";
import { LIST_OPTIONS, mediaListQueryKey } from "../../hooks/useMediaList";
import { buildUrl, fetchJson } from "../../hooks/queryUtils";
import { visibleMediaTypes } from "../../lib/gatedTypes";
import { applyFilterDefs } from "../../lib/libraryFilters";
import {
  PICKER_TYPES,
  entryKey,
  generalFilterDefs,
  pickRandom,
  pickerTypeLabel,
  toEntries,
  typeFilterDefs,
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

      <ModeStrip current={type} types={visibleTypes} />

      {/* Keyed on the mode: each mode has its own defs, so switching starts
          with fresh filters and no pick rather than carrying either over. */}
      <PickerBody
        key={type ?? "all"}
        type={type}
        typesKey={type ?? visibleTypes.join(",")}
      />
    </div>
  );
}

// "All" and one link per visible type.
function ModeStrip({ current, types }) {
  const modes = [{ to: "/random", label: "All", active: !current }].concat(
    types.map((t) => ({ to: `/random/${t}`, label: pickerTypeLabel(t), active: current === t })),
  );
  return (
    <nav aria-label="Picker mode" className="flex flex-wrap gap-1.5 border-b border-border pb-4">
      {modes.map((m) => (
        <Link
          key={m.to}
          to={m.to}
          aria-current={m.active ? "page" : undefined}
          className={`px-2.5 py-1 border font-mono text-[11px] uppercase tracking-[0.12em] transition-colors ${
            m.active
              ? "bg-brand text-on-brand border-brand"
              : "bg-surface text-text-muted border-border-strong hover:border-text hover:text-text"
          }`}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

// Lists fetched for a mode, merged into one result. Module-level so its
// identity is stable, which lets useQueries keep the merged result between
// renders until a list actually changes.
function combineLists(results) {
  return {
    lists: results.map((r) => r.data),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error?.message ?? null,
  };
}

// `typesKey` is the comma-joined list of types this mode draws from: a
// string, so the memos below see a change of types and not a new array.
function PickerBody({ type, typesKey }) {
  const queryClient = useQueryClient();
  const types = useMemo(() => typesKey.split(",").filter(Boolean), [typesKey]);

  // The same cache entries the library pages fill, so a library visit makes
  // the picker instant and the reverse.
  const { lists, isLoading, error } = useQueries({
    queries: types.map((t) => ({
      queryKey: mediaListQueryKey(t, LIST_OPTIONS.params),
      queryFn: () => fetchJson(buildUrl(`${MEDIA_CONFIG[t].apiEndpoint}/`, LIST_OPTIONS.params)),
      staleTime: 30_000,
    })),
    combine: combineLists,
  });

  const entries = useMemo(
    () => types.flatMap((t, i) => toEntries(t, lists[i])),
    [types, lists],
  );

  const filterDefs = useMemo(
    () => (type ? typeFilterDefs(type) : generalFilterDefs(types)),
    [type, types],
  );

  const { filters, toggleFilter, clearFilters, activeFilterCount, dynamicFilterOptions } =
    useFilterState(filterDefs, entries);

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

  // Every filter off and the pick gone: back to the page as it opened.
  const clearAll = useCallback(() => {
    clearFilters();
    setPickedKey(null);
  }, [clearFilters]);

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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button kind="primary" onClick={draw} disabled={pool.length === 0}>
              <i className="fas fa-dice" aria-hidden="true" />
              {picked ? "Pick again" : "Pick"}
            </Button>
            <Button onClick={clearAll} disabled={activeFilterCount === 0 && !picked}>
              Clear all
            </Button>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            {pool.length} in the pool
          </span>
        </div>

        {pool.length === 0 ? (
          <div className="border border-dashed border-border-strong px-4 py-12 text-center">
            <Eyebrow className="text-text-muted mb-1">Empty pool</Eyebrow>
            <p className="text-sm text-text-faint">
              Nothing matches the current filters. Clear a filter to widen the pool.
            </p>
          </div>
        ) : picked ? (
          <div className="max-w-[16rem]">
            {!type && <Eyebrow className="mb-1.5">{pickerTypeLabel(picked.type)}</Eyebrow>}
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
