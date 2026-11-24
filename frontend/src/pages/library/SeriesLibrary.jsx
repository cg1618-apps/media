// Frontend: page component file for SeriesLibrary. Laid out as
// FranchiseLibrary is, one tier down: a series names its parent franchise,
// and its type filter is the media types it holds, since a series carries
// no type of its own.
import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDisplayName, cleanString } from "../../utils/media";
import { getSeriesCover, withMediaType } from "../../lib/covers";
import { entityPath } from "../../lib/entityPath";
import { compareGroups, expectationTone } from "../../lib/groupSort";
import SeriesCard from "../../components/cards/SeriesCard";
import { ClearAllButton, Chip, Eyebrow } from "../../components/ui/primitives";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { withoutPersonal } from "../../lib/libraryScope";

// Every entry table a series can hold, with the label its type filter and
// Types column show, in the order both draw them. anime_movies has no
// series_id, so it is absent.
// getSeriesCover() needs the full set - a series whose chosen cover entry is
// of a type left out falls back to the placeholder silently - and the
// Entries column counts whatever is listed here.
const ENTRY_SOURCES = [
  ["anime", "/api/anime/", "Anime"],
  ["manga", "/api/manga/", "Manga"],
  ["book", "/api/book/", "Book"],
  ["movie", "/api/movies/", "Movie"],
  ["tv-show", "/api/tv-shows/", "TV"],
  ["cartoon", "/api/cartoon/", "Cartoon"],
  ["comic", "/api/comic/", "Comic"],
  ["game", "/api/game/", "Game"],
  // Gated: each fetched only for a session that can see its type.
  ["h-comic", "/api/h-comic/", "H-Comic"],
  ["h-game", "/api/h-game/", "H-Game"],
  ["hentai", "/api/hentai/", "Hentai"],
];
const TYPE_LABEL = Object.fromEntries(ENTRY_SOURCES.map(([type, , label]) => [type, label]));

/** The labels of the media types a series' entries are, in ENTRY_SOURCES order. */
function typesHeld(entries = []) {
  const held = new Set(entries.map((e) => e.media_type));
  return ENTRY_SOURCES.filter(([type]) => held.has(type)).map(([, , label]) => label);
}

// The type chip for a series holding no entry of any type the session sees.
export const OTHER_TYPE = "Other";

/** The type chips a series matches: the types it holds, else Other. */
function typeCategories(entries) {
  const held = typesHeld(entries);
  return held.length > 0 ? held : [OTHER_TYPE];
}

const EMPTY_FILTERS = { mediaType: new Set() };

// Breakpoints below which a column collapses, matching libraryColumns.jsx.
const HIDDEN = {
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
};

const TABLE_COLUMNS = [
  {
    key: "series",
    header: "Series",
    tdClass: "text-sm font-medium text-text",
    render: (s) => {
      const name = getDisplayName(s, "series");
      const path = entityPath("series", s);
      return path ? (
        <Link to={path} className="hover:text-brand transition-colors" title={name}>
          {name}
        </Link>
      ) : (
        name
      );
    },
  },
  {
    key: "franchise",
    header: "Franchise",
    thClass: HIDDEN.md,
    tdClass: `text-xs text-text-muted truncate max-w-[12rem] ${HIDDEN.md}`,
    render: (s, { franchiseDict }) => {
      const f = franchiseDict[s.franchise_id];
      return f ? (
        getDisplayName(f, "franchise") || "Unknown"
      ) : (
        <span className="text-text-faint/60 italic">None</span>
      );
    },
  },
  {
    key: "types",
    header: "Types",
    thClass: HIDDEN.lg,
    tdClass: `text-center ${HIDDEN.lg}`,
    render: (s, { entriesBySeries }) => {
      const types = typesHeld(entriesBySeries[s.system_id]);
      if (types.length === 0) return "-";
      return (
        <span className="inline-flex flex-wrap gap-1 justify-center">
          {types.map((t) => (
            <Chip key={t} className="text-[9px]">
              {t}
            </Chip>
          ))}
        </span>
      );
    },
  },
  {
    key: "entries",
    header: "Entries",
    tdClass: "text-center font-mono text-xs text-text tabular-nums",
    render: (s, { entriesBySeries }) => entriesBySeries[s.system_id]?.length ?? 0,
  },
  // Expectation and My are the viewer's own judgements, not shown to a viewer
  // without self.list (`personal: true`), who has none.
  {
    key: "expectation",
    personal: true,
    header: "Expectation",
    thClass: HIDDEN.lg,
    tdClass: `text-center ${HIDDEN.lg}`,
    render: (s) =>
      s.series_expectation ? (
        <Chip tone={expectationTone(s.series_expectation)} className="text-[9px]">
          {s.series_expectation}
        </Chip>
      ) : "-",
  },
  {
    key: "my",
    personal: true,
    header: "My",
    tdClass: "text-center",
    render: (s) =>
      s.my_rating ? (
        <span className="inline-flex items-center justify-center w-6 h-6 border border-brand text-brand font-display font-bold text-sm leading-none">
          {s.my_rating}
        </span>
      ) : (
        "-"
      ),
  },
];

// Markup and class names mirror FranchiseLibrary's table.
function SeriesTable({ series, columnCtx, showPersonal }) {
  const navigate = useNavigate();
  const columns = showPersonal ? TABLE_COLUMNS : withoutPersonal(TABLE_COLUMNS);
  return (
    <div className="bg-surface border border-border overflow-auto max-h-[75vh]">
      <table className="w-full text-left">
        <thead className="bg-surface border-b border-border sticky top-0 z-10">
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.key}
                className={`px-4 py-2.5 font-mono text-[10px] font-normal text-text-faint text-center ${
                  i < columns.length - 1 ? "border-r border-border" : ""
                } ${col.thClass ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {series.map((s) => {
            const path = entityPath("series", s);
            return (
              <tr
                key={s.system_id}
                onClick={path ? () => navigate(path) : undefined}
                className={`transition-colors ${path ? "hover:bg-surface-2 cursor-pointer" : ""}`}
              >
                {columns.map((col, i) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2 ${
                      i < columns.length - 1 ? "border-r border-border" : ""
                    } ${col.tdClass ?? ""}`}
                  >
                    {col.render(s, columnCtx)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function fetchList(path) {
  const res = await fetch(`${path}?limit=2000`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load data");
  return res.json();
}

export default function SeriesLibrary() {
  const auth = useAuth();
  const { ownData: showPersonal } = useViewScope();
  const authLoading = Boolean(auth?.loading);
  const canSeeHComic = canSeeGatedType(auth, "h-comic");
  const canSeeHGame = canSeeGatedType(auth, "h-game");
  const canSeeHentai = canSeeGatedType(auth, "hentai");
  const [allSeries, setAllSeries] = useState([]);
  const [entriesBySeries, setEntriesBySeries] = useState({});
  const [franchiseDict, setFranchiseDict] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentSort, setCurrentSort] = useState("title");
  const [currentView, setCurrentView] = useState("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const visibleTypes = useMemo(() => {
    const gated = { "h-comic": canSeeHComic, "h-game": canSeeHGame, hentai: canSeeHentai };
    return ENTRY_SOURCES.filter(([type]) => gated[type] ?? true);
  }, [canSeeHComic, canSeeHGame, canSeeHentai]);

  useEffect(() => {
    // Wait for /api/auth/me: which entry lists to fetch depends on which
    // gated types this session may see.
    if (authLoading) return;
    async function load() {
      try {
        const [series, franchises, ...entryLists] = await Promise.all([
          fetchList("/api/series/"),
          fetchList("/api/franchise/"),
          ...visibleTypes.map(([, path]) => fetchList(path)),
        ]);
        const allEntries = visibleTypes.flatMap(([type], i) =>
          withMediaType(entryLists[i], type),
        );
        const bySeries = {};
        for (const e of allEntries) {
          if (!e.series_id) continue;
          (bySeries[e.series_id] ??= []).push(e);
        }
        setAllSeries(series);
        setFranchiseDict(Object.fromEntries(franchises.map((f) => [f.system_id, f])));
        setEntriesBySeries(bySeries);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [authLoading, visibleTypes]);

  function toggleFilter(value) {
    setFilters((prev) => {
      const next = new Set(prev.mediaType);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { mediaType: next };
    });
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
  }

  const activeFilterCount = filters.mediaType.size;

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    const result = allSeries.filter((s) => {
      if (qClean) {
        const match = [
          s.series_name_cn,
          s.series_name_en,
          s.series_name_roman,
          s.series_name_jp,
          s.series_name_alt,
        ].some((n) => n && cleanString(n).includes(qClean));
        if (!match) return false;
      }
      if (filters.mediaType.size > 0) {
        const cats = typeCategories(entriesBySeries[s.system_id]);
        if (!cats.some((t) => filters.mediaType.has(t))) return false;
      }
      return true;
    });

    // A personal sort left selected by a viewer who cannot see the values
    // would order by nothing; it reads as Title instead.
    const sort = showPersonal ? currentSort : "title";
    result.sort((a, b) => compareGroups(a, b, sort, "series"));
    return result;
  }, [allSeries, entriesBySeries, searchQuery, currentSort, showPersonal, filters]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading series...</p>
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

  const PILL_ON = "bg-brand text-on-brand border-brand";
  const PILL_OFF =
    "bg-surface border-border-strong text-text-muted hover:border-text hover:text-text";

  return (
    <div className="min-h-screen">
      {/* Filter strip: flat on the canvas */}
      <div className="border-b border-border sticky top-[var(--nav-h)] z-30 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-3xl font-semibold text-text leading-none">
                Series
              </h1>
              <p className="font-mono text-[11px] text-text-faint mt-1.5">
                {filteredAndSorted.length} series
                {searchQuery && ` matching "${searchQuery}"`}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search series..."
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

              {/* Sort */}
              <label className="flex items-center gap-2">
                <Eyebrow>Sort</Eyebrow>
                <select
                  value={showPersonal ? currentSort : "title"}
                  onChange={(e) => setCurrentSort(e.target.value)}
                  className="bg-surface border border-border-strong px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-brand transition"
                >
                  <option value="title">Title</option>
                  {showPersonal && (
                    <>
                      <option value="my_rating">My rating</option>
                      <option value="expectation">Expectation</option>
                    </>
                  )}
                </select>
              </label>

              {/* Filters button */}
              <button
                onClick={() => setShowFilters((o) => !o)}
                className={`px-3 py-1.5 border text-sm font-medium transition-colors ${showFilters ? PILL_ON : PILL_OFF}`}
              >
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 font-mono text-[10px] tabular-nums">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* View toggle */}
              <div className="flex gap-1">
                <button
                  onClick={() => setCurrentView("grid")}
                  title="Grid view"
                  aria-label="Grid view"
                  className={`px-3 py-1.5 border text-sm transition-colors ${currentView === "grid" ? PILL_ON : PILL_OFF}`}
                >
                  <i className="fas fa-th-large"></i>
                </button>
                <button
                  onClick={() => setCurrentView("table")}
                  title="Table view"
                  aria-label="Table view"
                  className={`px-3 py-1.5 border text-sm transition-colors ${currentView === "table" ? PILL_ON : PILL_OFF}`}
                >
                  <i className="fas fa-list"></i>
                </button>
              </div>
            </div>
          </div>

          {/* Filter panel: the media types the session can see */}
          {showFilters && (
            <div className="border-t border-border mt-3 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Eyebrow className="shrink-0">Holds</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {[...visibleTypes.map(([type]) => TYPE_LABEL[type]), OTHER_TYPE].map(
                  (label) => {
                    const active = filters.mediaType.has(label);
                    return (
                      <button
                        key={label}
                        onClick={() => toggleFilter(label)}
                        className={`px-3 py-1 border text-xs font-medium transition-colors ${active ? PILL_ON : PILL_OFF}`}
                      >
                        {label}
                      </button>
                    );
                  },
                )}
              </div>
              <ClearAllButton
                active={activeFilterCount > 0}
                onClick={clearFilters}
                className="ml-auto"
              />
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No series found</p>
            <p className="text-sm text-text-faint mt-1">
              {activeFilterCount > 0 || searchQuery ? (
                <>
                  Try adjusting your filters or{" "}
                  <button
                    onClick={() => {
                      clearFilters();
                      setSearchQuery("");
                    }}
                    className="text-brand hover:underline"
                  >
                    reset all
                  </button>
                </>
              ) : (
                "No series in the database yet."
              )}
            </p>
          </div>
        ) : currentView === "table" ? (
          <SeriesTable
            series={filteredAndSorted}
            showPersonal={showPersonal}
            columnCtx={{ franchiseDict, entriesBySeries }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filteredAndSorted.map((s) => (
              <SeriesCard
                key={s.system_id}
                series={s}
                cover={getSeriesCover(s, entriesBySeries[s.system_id] ?? [])}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
