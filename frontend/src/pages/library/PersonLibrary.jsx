// Frontend: page component file for PersonLibrary.
//
// People are a public entity, not a media type — this sits at /library/person
// as a standalone component, outside LIBRARY_CONFIGS, mirroring
// StudioLibrary.jsx.
//
// Search, filters and sort all run client-side over the one /api/person/
// response: a per-filter request would refetch on each click. The filters are
// ordinary FilterDefs (lib/entityFilters.js) drawn by the FilterPanel the
// media libraries use - the person type (the admin sub-tabs' vocabulary,
// matched against the `roles` each person carries), entry type, rating and
// gender. The panel opens on defaultEntityFilters: every non-restricted
// entry type and No entries on, the restricted ones off.
import { useState, useEffect, useMemo } from "react";

import { PersonCard } from "../../components/cards/StaffCard";
import { cleanString, getRatingWeight } from "../../utils/media";
import { endpoints } from "../../api/endpoints";
import { PERSON_NAME_FIELDS } from "../../lib/naming";
import { Eyebrow } from "../../components/ui/primitives";
import FilterPanel, { FilterToggleButton } from "../../components/layout/FilterPanel";
import { useAuth } from "../../contexts/AuthContext";
import { useEntityFilterState } from "../../hooks/useFilterState";
import { applyFilterDefs } from "../../lib/libraryFilters";
import { personFilterDefs } from "../../lib/entityFilters";

// What the page calls its rows: People, or the role's own noun when the
// library is narrowed to one.
const ROLE_NOUNS = {
  seiyuu: { title: "Seiyuu", one: "seiyuu", many: "seiyuu" },
};
const PEOPLE_NOUN = { title: "People", one: "person", many: "people" };

// `role` is optional: when set (e.g. "seiyuu" for /library/seiyuu), the
// request filters server-side to people holding that role via
// GET /api/person/?role=<role>, the page names itself after the role, and
// the Type filter group is dropped - every row already holds it. Left
// unset, /library/person lists everyone. A person holding the role but
// never yet cast still comes back from that filter and is listed by
// default under No entries - person_role exists so they can appear in a
// cast dropdown before their first casting.
export default function PersonLibrary({ role } = {}) {
  const [allPeople, setAllPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("name");
  const [showFilters, setShowFilters] = useState(true);
  const noun = (role && ROLE_NOUNS[role]) || PEOPLE_NOUN;

  const auth = useAuth();
  const filterDefs = useMemo(() => personFilterDefs(auth, role), [auth, role]);
  const {
    filters,
    toggleFilter,
    clearFilters,
    resetFilters,
    isDefault,
    activeFilterCount,
    dynamicFilterOptions,
  } = useEntityFilterState(filterDefs, allPeople);

  useEffect(() => {
    async function load() {
      try {
        const qs = role ? `role=${encodeURIComponent(role)}` : "";
        const res = await fetch(endpoints.person.list(qs), {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to load data");
        setAllPeople(await res.json());
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [role]);

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    const searched = allPeople.filter((p) => {
      if (!qClean) return true;
      // Searches all four name fields, not just the displayed one: someone
      // looking a person up by their Japanese name must find them even when
      // English is the configured display name.
      return PERSON_NAME_FIELDS.some(
        ({ field }) => p[field] && cleanString(p[field]).includes(qClean),
      );
    });
    const result = applyFilterDefs(searched, filterDefs, filters);

    result.sort((a, b) => {
      if (currentSort === "credit_count") {
        const diff = (b.credit_count ?? 0) - (a.credit_count ?? 0);
        if (diff !== 0) return diff;
      } else if (currentSort === "my_rating") {
        const diff = getRatingWeight(a.my_rating) - getRatingWeight(b.my_rating);
        if (diff !== 0) return diff;
      }
      return (a.display_name || "").localeCompare(b.display_name || "");
    });

    return result;
  }, [allPeople, searchQuery, currentSort, filterDefs, filters]);

  const narrowed = searchQuery !== "" || activeFilterCount > 0;
  // The empty state's way out: no search and no filter, not the default -
  // the default may be exactly what left nothing to show.
  function showEverything() {
    setSearchQuery("");
    clearFilters();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading {noun.many}...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center border border-danger bg-danger/10 px-6 py-4 text-danger">
          <p className="font-bold">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <Eyebrow className="mb-1">Library</Eyebrow>
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                {noun.title}
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length}{" "}
                {filteredAndSorted.length === 1 ? noun.one : noun.many}
                {searchQuery && ` matching "${searchQuery}"`}
                {activeFilterCount > 0 && " (filtered)"}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <input
                  type="search"
                  placeholder={`Search ${noun.many}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-3 pr-8 py-1.5 bg-surface border border-border-strong text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-brand transition w-44 sm:w-56"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-muted"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                )}
              </div>

              <label className="flex items-center gap-2">
                <Eyebrow>Sort</Eyebrow>
                <select
                  value={currentSort}
                  onChange={(e) => setCurrentSort(e.target.value)}
                  className="bg-surface border border-border-strong px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="name">Name</option>
                  <option value="credit_count">Credits</option>
                  <option value="my_rating">My rating</option>
                </select>
              </label>

              <FilterToggleButton
                className="py-1.5"
                open={showFilters}
                onToggle={() => setShowFilters((o) => !o)}
                activeFilterCount={activeFilterCount}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {showFilters && (
          <FilterPanel
            filterDefs={filterDefs}
            filters={filters}
            toggleFilter={toggleFilter}
            clearFilters={clearFilters}
            resetFilters={isDefault ? undefined : resetFilters}
            activeFilterCount={activeFilterCount}
            dynamicFilterOptions={dynamicFilterOptions}
          />
        )}
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No {noun.many} found</p>
            <p className="text-sm text-text-faint mt-1">
              {narrowed ? (
                <>
                  Try a different search or filter, or{" "}
                  <button
                    onClick={showEverything}
                    className="text-brand hover:underline"
                  >
                    show everything
                  </button>
                </>
              ) : (
                `No ${noun.many} in the database yet.`
              )}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((person) => (
              <PersonCard key={person.system_id} person={person} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
