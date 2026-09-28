// Frontend: the random picker. /random draws from every visible media type
// with the filters all types share; /random/<type> draws from one type with
// that type's own library filters. Each mode opens with the default filters
// saved on the Picker Defaults page. The filters are lib/randomPicker.js, the
// weighted draw lib/pickerWeights.js, the data hooks/usePickerData.js; this
// file holds the pick and renders. A Weights tab (?tab=weights) lists every
// weight the draw uses.
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useParams, useSearchParams } from "react-router-dom";

import MediaCard from "../../components/cards/MediaCard";
import OptionSubTabBar from "../../components/forms/OptionSubTabBar";
import FilterPanel from "../../components/layout/FilterPanel";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ModeStrip from "../../components/picker/ModeStrip";
import PickerWeights from "../../components/picker/PickerWeights";
import { Button, Eyebrow } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { fetchJson } from "../../hooks/queryUtils";
import { useFilterState } from "../../hooks/useFilterState";
import { usePickerData } from "../../hooks/usePickerData";
import { visibleMediaTypes } from "../../lib/gatedTypes";
import { applyFilterDefs, countActiveFilters } from "../../lib/libraryFilters";
import { groupPlanMarks, pickWeighted } from "../../lib/pickerWeights";
import { PICKER_TYPES, entryKey, pickerTypeLabel } from "../../lib/randomPicker";

const ALL_TYPES = PICKER_TYPES.map((t) => t.type);

const TABS = [
  { key: "pick", label: "Picker", icon: "fa-dice" },
  { key: "weights", label: "Weights", icon: "fa-balance-scale" },
];

// `type` comes from the route, or as a prop from the gated routes App.jsx
// declares on their own behind <ProtectedRoute gatedType>.
export default function RandomPicker({ type: typeProp }) {
  const params = useParams();
  const type = typeProp ?? params.type ?? null;
  const auth = useAuth();
  const visibleTypes = visibleMediaTypes(auth, ALL_TYPES);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "weights" ? "weights" : "pick";

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

      <OptionSubTabBar
        tabs={TABS}
        active={tab}
        onSelect={(key) => setSearchParams(key === "weights" ? { tab: key } : {})}
      />

      {tab === "weights" ? (
        <PickerWeights />
      ) : (
        <>
          <ModeStrip
            current={mode}
            types={visibleTypes}
            linkTo={(m) => (m === "all" ? "/random" : `/random/${m}`)}
          />

          {/* Keyed on the mode: each mode has its own defs and defaults, so
              switching starts from that mode's defaults with no pick. */}
          <PickerBody
            key={mode}
            mode={mode}
            typesKey={type ?? visibleTypes.join(",")}
            signedIn={Boolean(auth.username)}
          />
        </>
      )}
    </div>
  );
}

function PickerBody({ mode, typesKey, signedIn }) {
  const { entries, filterDefs, defaultFilters, defaultWeighted, isLoading, error } =
    usePickerData(mode, typesKey);

  // Series and franchise plan marks, for the plan weight; entry marks ride on
  // the entries. A plan is private, so a guest has none to ask for. The Plan
  // page reads the same key.
  const planNextQuery = useQuery({
    queryKey: ["plan-next"],
    queryFn: () => fetchJson("/api/plan-next/"),
    staleTime: 30_000,
    enabled: signedIn,
  });
  const planMarks = useMemo(() => groupPlanMarks(planNextQuery.data), [planNextQuery.data]);

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
      defaultWeighted={defaultWeighted}
      planMarks={planMarks}
    />
  );
}

function PickerPool({ mode, entries, filterDefs, defaultFilters, defaultWeighted, planMarks }) {
  const queryClient = useQueryClient();
  const {
    filters,
    toggleFilter,
    clearFilters,
    resetFilters,
    activeFilterCount,
    dynamicFilterOptions,
  } = useFilterState(filterDefs, entries, defaultFilters);

  const hasDefaults = countActiveFilters(defaultFilters) > 0 || !defaultWeighted;

  const pool = useMemo(
    () => applyFilterDefs(entries, filterDefs, filters),
    [entries, filterDefs, filters],
  );

  // The pick is held by key and read back from `entries`, so a status change
  // made on its card shows up once the list cache is patched.
  const [pickedKey, setPickedKey] = useState(null);
  const [pickedChance, setPickedChance] = useState(null);
  const picked = useMemo(
    () => (pickedKey ? entries.find((e) => entryKey(e) === pickedKey) ?? null : null),
    [entries, pickedKey],
  );

  const [weighted, setWeighted] = useState(defaultWeighted);

  const draw = useCallback(() => {
    const next = pickWeighted(pool, picked, { mode, planMarks }, weighted);
    setPickedKey(next ? entryKey(next.entry) : null);
    setPickedChance(next ? next.chance : null);
  }, [pool, picked, mode, planMarks, weighted]);

  // Every filter off and the pick gone.
  const clearAll = useCallback(() => {
    clearFilters();
    setPickedKey(null);
  }, [clearFilters]);

  // Back to the mode's saved defaults, with the pick gone.
  const restoreDefaults = useCallback(() => {
    resetFilters();
    setWeighted(defaultWeighted);
    setPickedKey(null);
  }, [resetFilters, defaultWeighted]);

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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
            {pool.length} in the pool
          </p>
          <label className="inline-flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={weighted}
              onChange={(e) => setWeighted(e.target.checked)}
              className="accent-brand"
            />
            Weighted
          </label>
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
            {mode === "all" && (
              <Eyebrow className="mb-1.5">{pickerTypeLabel(picked.type)}</Eyebrow>
            )}
            <MediaCard
              type={picked.type}
              data={picked.item}
              onUpdated={handleUpdated(picked.type)}
            />
            {pickedChance !== null && (
              <p className="mt-1.5 font-mono text-[11px] text-text-faint">
                {formatChance(pickedChance)} chance
              </p>
            )}
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

// "1 in 37 (2.7%)" - the odds the pick had when it was drawn.
function formatChance(chance) {
  const percent = chance * 100;
  return `1 in ${Math.round(1 / chance)} (${percent < 1 ? percent.toFixed(2) : percent.toFixed(1)}%)`;
}
