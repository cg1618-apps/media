// Frontend: the universal search field that sits in the nav's ink row.
//
// Split out of Nav so the nav shell stays about navigation. One debounced
// request to /api/search returns a bucket per media type; this file decides how
// many rows of each to show. Enter opens the full results page.
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { cleanString, getDisplayName } from "../../utils/media";
import { Chip } from "../ui/primitives";
import { typeHue } from "../../config/scopeColors";
import { entityPath } from "../../lib/entityPath";
import { useAuth } from "../../contexts/AuthContext";
import { visibleByType } from "../../lib/gatedTypes";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "collection", label: "Collection" },
  { key: "franchise", label: "Franchise" },
  { key: "series", label: "Series" },
  { key: "anime", label: "Anime" },
  { key: "anime-movie", label: "Anime Movie" },
  { key: "movie", label: "Movie" },
  { key: "tv-show", label: "TV Show" },
  { key: "cartoon", label: "Cartoon" },
  { key: "manga", label: "Manga" },
  { key: "novel", label: "Novel" },
  { key: "comic", label: "Comic" },
  { key: "game", label: "Game" },
  // Gated: offered only through visibleByType. The server leaves a gated
  // type's bucket out for a session that cannot see it, and a missing bucket
  // reads as empty below.
  { key: "h-comic", label: "H-Comic" },
  { key: "h-game", label: "H-Game" },
  { key: "hentai", label: "Hentai" },
  { key: "seasonal", label: "Seasonal" },
  { key: "person", label: "Person" },
  { key: "studio", label: "Studio" },
  { key: "publisher", label: "Publisher" },
];

// Short mono labels for the result rows. The text names the type; the badge's
// hue (typeHue, config/scopeColors.js) is an index on top of it, so a reader
// scanning eight mixed rows finds the type they meant before reading.
const TYPE_LABEL = {
  collection: "COLLECT",
  franchise: "FRAN",
  series: "SERIES",
  anime: "ANIME",
  "anime-movie": "A.MOVIE",
  movie: "MOVIE",
  "tv-show": "TV",
  cartoon: "CARTOON",
  manga: "MANGA",
  novel: "NOVEL",
  comic: "COMIC",
  game: "GAME",
  "h-comic": "H-COMIC",
  "h-game": "H-GAME",
  hentai: "HENTAI",
  seasonal: "SEASON",
  person: "PERSON",
  studio: "STUDIO",
  publisher: "PUBLISH",
};

// Result types that open a detail page. The bucket key is the route segment,
// so the click handler needs no translation table; a row of any other type
// falls back to anime, as it always has.
const DETAIL_TYPES = new Set([
  "collection",
  "franchise",
  "series",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  "h-comic",
  "h-game",
  "hentai",
  "anime-movie",
  "movie",
  "tv-show",
  "person",
  "studio",
  "publisher",
]);

// Types whose display name is data rather than a fixed fallback chain: the row
// arrives with display_name already resolved server-side from
// display_name_field, so there is nothing to choose here.
const SELF_NAMED = new Set(["person", "studio", "publisher"]);

// What lib/naming.js returns when every name column is empty. The dropdown
// shows a dash instead: the rows are one line tall and a placeholder sentence
// reads as a title.
const PLACEHOLDERS = new Set(["Unknown Title", "Unknown Series"]);

/**
 * The label one result row shows.
 *
 * Media and grouping tiers go through the app-wide fallback chain in
 * lib/naming.js. The dropdown used to carry its own per-type copy of that
 * chain, which is how `game` ended up with no branch at all and every game
 * result rendered as a dash.
 */
export function getResultName(item) {
  if (item.type === "seasonal") return item.seasonal || "—";
  if (SELF_NAMED.has(item.type)) return item.display_name || "—";
  const name = getDisplayName(item, item.type);
  return PLACEHOLDERS.has(name) ? "—" : name;
}

// Every type a suggestion row can be, in TYPE_LABEL's order.
export const RESULT_TYPES = Object.keys(TYPE_LABEL);

// Rows one query may put in the dropdown, and the per-bucket `limit` the
// request sends: no bucket can contribute more rows than the dropdown shows.
// The dropdown is a shortcut to the likely row, not the result list - Enter
// opens /search for everything.
export const MAX_RESULTS = 8;

// [bucket key, guaranteed slots when scope === "all"], in the order the first
// pass visits them. One each: eight rows cannot hold a quota per type, so the
// first pass is about variety - each matching type shows its best row before
// any type shows a second - and the round-robin hands out what is left.
// Person, studio and publisher come last with no floor: a query is usually
// about a title, so staff rows only take the slots the titles left behind.
const TYPE_QUOTAS = [
  ["collection", 1],
  ["franchise", 1],
  ["series", 1],
  ["anime", 1],
  ["anime-movie", 1],
  ["movie", 1],
  ["tv-show", 1],
  ["cartoon", 1],
  ["manga", 1],
  ["novel", 1],
  ["comic", 1],
  ["game", 1],
  ["h-comic", 1],
  ["h-game", 1],
  ["hentai", 1],
  ["seasonal", 1],
  ["person", 0],
  ["studio", 0],
  ["publisher", 0],
];

/**
 * Flattens the per-type result buckets into at most MAX_RESULTS rows.
 *
 * Exact matches go first, from every bucket, so a whole-title hit in a late
 * bucket is never cut by the cap. Each type then draws up to its quota, which
 * stops a big table from burying the small ones. The slots left over are
 * filled round-robin from the buckets that still have rows, so quota no type
 * claimed is not wasted — a query matching only movies gets eight movies.
 */
export function mergeBuckets(buckets, quotas, isExact) {
  // The server already sorts each bucket exact-first; partitioning again
  // keeps this pass right if the two definitions of "exact" ever differ.
  const ordered = buckets.map((bucket) => [
    ...bucket.filter(isExact),
    ...bucket.filter((row) => !isExact(row)),
  ]);
  const cursors = ordered.map(() => 0);
  const out = [];
  ordered.forEach((bucket, i) => {
    while (
      out.length < MAX_RESULTS &&
      cursors[i] < bucket.length &&
      isExact(bucket[cursors[i]])
    ) {
      out.push(bucket[cursors[i]++]);
    }
  });
  ordered.forEach((bucket, i) => {
    const take = Math.max(
      0,
      Math.min(
        quotas[i] - cursors[i],
        bucket.length - cursors[i],
        MAX_RESULTS - out.length,
      ),
    );
    out.push(...bucket.slice(cursors[i], cursors[i] + take));
    cursors[i] += take;
  });
  let progressed = true;
  while (out.length < MAX_RESULTS && progressed) {
    progressed = false;
    for (let i = 0; i < ordered.length && out.length < MAX_RESULTS; i++) {
      if (cursors[i] < ordered[i].length) {
        out.push(ordered[i][cursors[i]++]);
        progressed = true;
      }
    }
  }
  return out;
}

// Two placements share this one component. `inline` (the default) is the slot
// in the ink row from md up. `sheet` is the full-width row a phone opens from
// the search button: it focuses itself, uses a 16px input so iOS does not zoom
// the page on focus, and calls `onDone` once a search has taken the reader
// somewhere, so the row can close behind them.
export default function NavSearch({ variant = "inline", onDone }) {
  const sheet = variant === "sheet";
  const navigate = useNavigate();
  const scopes = visibleByType(useAuth(), SCOPES);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchScope, setSearchScope] = useState("all");
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const searchReqIdRef = useRef(0);

  // Drops whatever search is pending: the debounce that has not fired yet,
  // and - by moving the request id on - any response still in flight, which
  // would otherwise land after the reader has left and reopen the dropdown
  // over the page they went to.
  function stopPendingSearch() {
    clearTimeout(searchDebounceRef.current);
    searchReqIdRef.current += 1;
  }

  // Leaving by a search or a row: nothing is pending and nothing is held.
  function cancelPendingSearch() {
    stopPendingSearch();
    setSearchResults([]);
    setShowResults(false);
  }

  // Universal search. The backend matches; this effect only decides how many
  // rows of each type reach the dropdown (see TYPE_QUOTAS and mergeBuckets).
  useEffect(() => {
    if (!searchQuery.trim()) {
      cancelPendingSearch();
      return;
    }
    clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      const reqId = ++searchReqIdRef.current;
      const q = searchQuery.trim();
      const qClean = cleanString(q);
      const scope = searchScope;

      let payload;
      try {
        const params = new URLSearchParams({ q, limit: String(MAX_RESULTS) });
        if (scope !== "all") params.set("scope", scope);
        const res = await fetch(`/api/search/?${params.toString()}`, {
          credentials: "include",
        });
        if (!res.ok) return;
        payload = await res.json();
      } catch {
        return; // ignore search errors
      }

      // A newer keystroke superseded this request while it was in flight, or
      // the reader searched or picked a row and the search was cancelled.
      if (reqId !== searchReqIdRef.current) return;

      // A scoped search has one bucket, and it may fill every row.
      const active = TYPE_QUOTAS.filter(
        ([type]) => scope === "all" || scope === type,
      );
      const buckets = active.map(([type]) =>
        (payload.results[type] || []).map((r) => ({ ...r, type })),
      );
      const quotas = active.map(([, quota]) =>
        scope === "all" ? quota : MAX_RESULTS,
      );

      // Each bucket already arrives with its own exact matches first, but the
      // merge interleaves the buckets, so the whole-title matches have to be
      // lifted again across types.
      // Every title column is named *_name_*, and seasonal's is the row's only
      // string, so the check needs no per-type table of name columns.
      const isExact = (item) =>
        Object.entries(item).some(
          ([field, value]) =>
            (field.includes("_name_") ||
              field.startsWith("name_") ||
              field === "seasonal") &&
            typeof value === "string" &&
            cleanString(value) === qClean,
        );

      setSearchResults(mergeBuckets(buckets, quotas, isExact));
      setShowResults(true);
    }, 250);
    // cancelPendingSearch touches only refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchScope]);

  // Close the results and scope menus on an outside click.
  useEffect(() => {
    function handler(e) {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        stopPendingSearch();
        setShowResults(false);
        setShowScopeMenu(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSearchKey(e) {
    if (e.key === "Escape") {
      // Dismissed, not left: the query and held results stay for a refocus.
      stopPendingSearch();
      setShowResults(false);
      setShowScopeMenu(false);
      return;
    }
    if (e.key === "Enter" && searchQuery.trim()) {
      const q = searchQuery.trim();
      cancelPendingSearch();
      setSearchQuery("");
      onDone?.();
      const params = new URLSearchParams({ q });
      if (searchScope !== "all") params.set("scope", searchScope);
      navigate(`/search?${params.toString()}`);
    }
  }

  function handleResultClick(item) {
    cancelPendingSearch();
    setSearchQuery("");
    // Seasonal is not an entity: it routes by the season string itself.
    if (item.type === "seasonal") {
      navigate(`/seasonal/${encodeURIComponent(item.seasonal)}`);
      onDone?.();
      return;
    }
    // Every other bucket key is already the route segment; anything unexpected
    // has always fallen back to anime.
    const type = DETAIL_TYPES.has(item.type) ? item.type : "anime";
    const path = entityPath(type, item);
    if (path) navigate(path);
    onDone?.();
  }

  const scopeLabel = scopes.find((s) => s.key === searchScope)?.label;

  return (
    // A slot recessed into the ink row: dark and inset at rest, lifting to
    // paper once focused.
    <div
      ref={searchRef}
      className={`group relative items-center ${
        sheet ? "flex w-full" : "hidden md:flex w-56 lg:w-80 xl:w-96"
      } bg-ink-text/[0.06] ring-1 ring-inset ring-ink-text/15 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand transition`}
    >
      {/* Scope selector */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setShowScopeMenu((s) => !s)}
          aria-haspopup="listbox"
          aria-expanded={showScopeMenu}
          className="flex items-center gap-1 pl-3 pr-1.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-text/60 hover:text-ink-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand transition whitespace-nowrap group-focus-within:text-text-muted"
        >
          {scopeLabel}
        </button>
        {showScopeMenu && (
          <div
            role="listbox"
            className="absolute left-0 top-full mt-2 bg-surface border border-border shadow-xl z-50 overflow-hidden min-w-[140px] py-1"
          >
            {scopes.map((s) => (
              <button
                key={s.key}
                type="button"
                role="option"
                aria-selected={searchScope === s.key}
                onClick={() => {
                  setSearchScope(s.key);
                  setShowScopeMenu(false);
                }}
                className={`w-full text-left px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition ${
                  searchScope === s.key
                    ? "text-brand bg-brand-soft"
                    : "text-text-muted hover:bg-surface-2 hover:text-text"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-3.5 bg-ink-text/20 group-focus-within:bg-border shrink-0 mx-0.5"></div>

      <i className="fas fa-search pl-2 pr-1 text-ink-text/50 group-focus-within:text-text-faint text-xs pointer-events-none shrink-0"></i>

      <input
        type="text"
        aria-label="Search the collection"
        placeholder={
          searchScope === "all" ? "Search…" : `Search ${scopeLabel}…`
        }
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onKeyDown={handleSearchKey}
        onFocus={() => searchResults.length > 0 && setShowResults(true)}
        autoFocus={sheet}
        className={`flex-1 min-w-0 bg-transparent pr-3 ${
          sheet ? "py-2 text-base" : "py-1.5 text-sm"
        } text-ink-text placeholder:text-ink-text/50 focus:outline-none focus:text-text focus:placeholder:text-text-faint`}
        autoComplete="off"
      />

      {/* Results */}
      {showResults && searchResults.length > 0 && (
        <div role="listbox" aria-label="Search suggestions" className="absolute top-full left-0 right-0 mt-2 bg-surface border border-border shadow-xl overflow-hidden max-h-[70dvh] overflow-y-auto overscroll-contain z-50">
          {searchResults.map((item, i) => {
            const secondary =
              item.type === "franchise"
                ? item.franchise_type
                : item.type === "anime"
                  ? item.airing_type
                  : item.type === "person" ||
                      item.type === "studio" ||
                      item.type === "publisher"
                    ? `${item.credit_count ?? 0} credit${
                        (item.credit_count ?? 0) === 1 ? "" : "s"
                      }`
                    : null;
            return (
              <button
                key={i}
                role="option"
                aria-selected={false}
                type="button"
                onClick={() => handleResultClick(item)}
                className="w-full text-left flex items-center px-3 py-2.5 hover:bg-surface-2 transition border-b border-border last:border-0"
              >
                <Chip hue={typeHue(item.type)} className="mr-2">
                  {TYPE_LABEL[item.type]}
                </Chip>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-text truncate">
                    {getResultName(item)}
                  </div>
                  {secondary && (
                    <div className="font-mono text-[10px] text-text-faint truncate">
                      {secondary}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
