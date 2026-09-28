// Frontend: admin page for the random picker's default filters - what each
// picker mode ("All" and every type) opens with, for every viewer.
//
// The filters are the picker's own (usePickerData), drawn with the same
// FilterPanel, so what is saved here is exactly what the picker shows. Stored
// defaults are SPARSE: only filters that are on are saved, and a mode with
// none saved opens with every filter empty. Each mode also saves whether it
// draws weighted (lib/pickerWeights.js), on unless saved off.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { endpoints } from "../../api/endpoints";
import FilterPanel from "../../components/layout/FilterPanel";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import ModeStrip from "../../components/picker/ModeStrip";
import { Button } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { fetchJson } from "../../hooks/queryUtils";
import { useFilterState } from "../../hooks/useFilterState";
import { pickerDefaultsQueryKey, usePickerData } from "../../hooks/usePickerData";
import { useToast } from "../../hooks/useToast";
import { visibleMediaTypes } from "../../lib/gatedTypes";
import { applyFilterDefs, countActiveFilters } from "../../lib/libraryFilters";
import { PICKER_TYPES, pickerTypeLabel, toStoredFilters } from "../../lib/randomPicker";

const ALL_TYPES = PICKER_TYPES.map((t) => t.type);

const modeLabel = (mode) => (mode === "all" ? "All" : pickerTypeLabel(mode));

export default function PickerDefaults() {
  const visibleTypes = visibleMediaTypes(useAuth(), ALL_TYPES);
  const [mode, setMode] = useState("all");
  const [dirty, setDirty] = useState(false);

  // One mode is edited at a time; leaving one with unsaved edits asks first.
  function selectMode(next) {
    if (next === mode) return;
    if (dirty && !window.confirm(`Discard unsaved defaults for ${modeLabel(mode)}?`)) return;
    setDirty(false);
    setMode(next);
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-text flex items-center gap-3">
          <i className="fas fa-dice text-brand"></i> Picker Defaults
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Choose the filters each Random Picker mode opens with, and whether it
          draws weighted. They apply to everyone who opens the picker; anyone
          can still change them there.
        </p>
      </div>

      <ModeStrip
        current={mode}
        types={visibleTypes}
        onSelect={selectMode}
        marked={dirty ? [mode] : []}
      />

      <ModeEditor
        key={mode}
        mode={mode}
        typesKey={mode === "all" ? visibleTypes.join(",") : mode}
        onDirtyChange={setDirty}
      />
    </div>
  );
}

function ModeEditor({ mode, typesKey, onDirtyChange }) {
  const { entries, filterDefs, defaultFilters, defaultWeighted, isLoading, error } =
    usePickerData(mode, typesKey);

  if (isLoading || error) {
    return (
      <MediaLoadingState
        isLoading={isLoading}
        error={error}
        loadingText="Loading..."
        errorTitle="Database Error"
      />
    );
  }

  // Mounted only once the saved defaults are in, so the panel opens on them.
  return (
    <DefaultsForm
      mode={mode}
      entries={entries}
      filterDefs={filterDefs}
      defaultFilters={defaultFilters}
      defaultWeighted={defaultWeighted}
      onDirtyChange={onDirtyChange}
    />
  );
}

function DefaultsForm({
  mode,
  entries,
  filterDefs,
  defaultFilters,
  defaultWeighted,
  onDirtyChange,
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const {
    filters,
    toggleFilter,
    clearFilters,
    activeFilterCount,
    dynamicFilterOptions,
  } = useFilterState(filterDefs, entries, defaultFilters);

  const draft = useMemo(() => toStoredFilters(filters), [filters]);
  const saved = useMemo(() => toStoredFilters(defaultFilters), [defaultFilters]);
  const [weighted, setWeighted] = useState(defaultWeighted);
  const isDirty =
    JSON.stringify(draft) !== JSON.stringify(saved) || weighted !== defaultWeighted;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const matching = useMemo(
    () => applyFilterDefs(entries, filterDefs, filters).length,
    [entries, filterDefs, filters],
  );

  // The picker reads the same key, so it opens on the new defaults at once.
  const storeLocally = useCallback(
    (stored, storedWeighted) =>
      queryClient.setQueryData(pickerDefaultsQueryKey(mode), {
        mode,
        version: 1,
        filters: stored,
        weighted: storedWeighted,
      }),
    [queryClient, mode],
  );

  async function handleSave() {
    setSaving(true);
    try {
      await fetchJson(endpoints.randomPickerDefaults.update(mode), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: 1, filters: draft, weighted }),
      });
      storeLocally(draft, weighted);
      showToast("success", `Picker defaults for ${modeLabel(mode)} saved.`);
    } catch (err) {
      showToast("error", err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    if (!window.confirm(`Remove every saved default for ${modeLabel(mode)}? It will open with no filters, weighted.`)) return;
    setSaving(true);
    try {
      await fetchJson(endpoints.randomPickerDefaults.reset(mode), { method: "DELETE" });
      clearFilters();
      setWeighted(true);
      storeLocally({}, true);
      showToast("success", `${modeLabel(mode)} opens with no filters.`);
    } catch (err) {
      showToast("error", err.message || "Reset failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <FilterPanel
        filterDefs={filterDefs}
        filters={filters}
        toggleFilter={toggleFilter}
        clearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
        dynamicFilterOptions={dynamicFilterOptions}
      />

      <div className="sticky bottom-4 flex flex-wrap items-center gap-3 bg-surface/95 backdrop-blur border border-border px-4 py-3">
        <label className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={weighted}
            onChange={(e) => setWeighted(e.target.checked)}
            className="accent-brand"
          />
          Weighted
        </label>
        <span className="text-xs font-bold text-text-faint">
          {activeFilterCount} chip{activeFilterCount === 1 ? "" : "s"} on · {matching} matching
          now
        </span>
        {isDirty && (
          <span className="text-xs font-bold text-warning">
            <i className="fas fa-circle text-[6px] mr-1 align-middle"></i>
            Unsaved changes
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            onClick={handleReset}
            disabled={saving || (countActiveFilters(defaultFilters) === 0 && defaultWeighted)}
          >
            Reset to none
          </Button>
          <Button kind="primary" onClick={handleSave} disabled={saving || !isDirty}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </>
  );
}
