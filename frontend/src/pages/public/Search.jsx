// Frontend: page component file for Search.
import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import CharacterCard from "../../components/cards/CharacterCard";
import MediaCard from "../../components/cards/MediaCard";
import {
  PersonCard,
  PublisherCard,
  StudioCard,
} from "../../components/cards/StaffCard";
import { HubTabs } from "../../components/hub/HubChrome";
import CollapsibleCardGrid from "../../components/layout/CollapsibleCardGrid";
import ContentsBar from "../../components/layout/ContentsBar";
import { TocSection } from "../../components/layout/DetailContents";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { canSearchScope } from "../../components/layout/NavSearch";
import TableOfContents from "../../components/layout/TableOfContents";
import { Chip, Eyebrow } from "../../components/ui/primitives";
import { useApiQuery } from "../../hooks/useApiQuery";
import { navOffset, useScrollSpy } from "../../hooks/useScrollSpy";
import { characterCards } from "../../lib/characterCards";
import { useEntityHref } from "../../lib/entityPath";

// The scopes the page can be narrowed to, in the order NavSearch offers them.
// NavSearch offers only the scopes the viewer may see (canSearchScope); this
// table only labels the chip. Exported so a test can assert the page and the
// API agree on the bucket keys without rendering the whole page.
export const SCOPE_LABELS = {
  all: "All",
  collection: "Collection",
  franchise: "Franchise",
  series: "Series",
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  book: "Book",
  comic: "Comic",
  game: "Game",
  "h-comic": "H-Comic",
  "h-game": "H-Game",
  hentai: "Hentai",
  seasonal: "Seasonal",
  person: "Person",
  studio: "Studio",
  publisher: "Publisher",
};

// The page's three tabs, in order. `key` is the `?tab=` value; the label is
// what the tab bar shows. Media is first, so it is the default whenever it
// has results; a tab with nothing in it is not drawn, as on the hub pages.
export const SEARCH_TABS = [
  { key: "media", label: "Media" },
  { key: "people", label: "People & companies" },
  { key: "characters", label: "Characters" },
];

// Every section the page can draw, in page order: the response bucket it
// reads (`key`), the tab it sits on, its heading - which is also its row in
// the table of contents - the word the count line uses, and how its rows are
// drawn. The count line, the tab counts, the sections and the contents are
// all built from this one list, so they cannot disagree.
const SECTIONS = [
  { key: "collection", tab: "media", heading: "Collections", summary: "collections", kind: "tier" },
  { key: "seasonal", tab: "media", heading: "Seasonal", summary: "seasonal", kind: "seasonal" },
  { key: "franchise", tab: "media", heading: "Franchises", summary: "franchises", kind: "tier" },
  { key: "series", tab: "media", heading: "Series", summary: "series", kind: "tier" },
  { key: "anime", tab: "media", heading: "Anime", summary: "anime", kind: "anime" },
  { key: "anime-movie", tab: "media", heading: "Anime movies", summary: "anime movies", kind: "media" },
  { key: "movie", tab: "media", heading: "Movies", summary: "movies", kind: "media" },
  { key: "tv-show", tab: "media", heading: "TV shows", summary: "TV shows", kind: "media" },
  { key: "cartoon", tab: "media", heading: "Cartoons", summary: "cartoons", kind: "media" },
  { key: "manga", tab: "media", heading: "Manga", summary: "manga", kind: "media" },
  { key: "book", tab: "media", heading: "Book", summary: "book", kind: "media" },
  { key: "comic", tab: "media", heading: "Comic", summary: "comics", kind: "media" },
  { key: "game", tab: "media", heading: "Game", summary: "games", kind: "media" },
  { key: "h-comic", tab: "media", heading: "H-Comic", summary: "h-comics", kind: "media" },
  { key: "h-game", tab: "media", heading: "H-Game", summary: "h-games", kind: "media" },
  { key: "hentai", tab: "media", heading: "Hentai", summary: "hentai", kind: "media" },
  { key: "person", tab: "people", heading: "People", summary: "people", kind: "person" },
  { key: "studio", tab: "people", heading: "Studios", summary: "studios", kind: "studio" },
  { key: "publisher", tab: "people", heading: "Publishers", summary: "publishers", kind: "publisher" },
  // The server fills this bucket at scope "all" only, so no scope names it.
  { key: "character", tab: "characters", heading: "Characters", summary: "characters", kind: "character", anyScope: true },
];

// The media libraries' grid (LibraryLayout), and the entity libraries' grid
// (StudioLibrary, PublisherLibrary, PersonLibrary, CharacterLibrary).
const MEDIA_GRID_CLS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3";
const ENTITY_GRID_CLS =
  "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4";

const PILL_OFF = "bg-surface text-text-muted border-border-strong hover:border-text";
const PILL_CLS = "shrink-0 px-3 py-1 border font-mono text-[11px] transition-colors";

function distinctTitles(raw, fallback) {
  const valid = [...new Set(raw.filter((t) => t && t.trim() !== ""))];
  return { main: valid[0] || fallback, sub: valid[1] || "" };
}

// The eyebrow and title pair each grouping tier's card shows.
const TIER_CARD = {
  collection: (c) => ({
    label: "Collection",
    titles: distinctTitles(
      [
        c.collection_name_cn,
        c.collection_name_en,
        c.collection_name_alt,
        c.collection_name_roman,
        c.collection_name_jp,
      ],
      "Unknown Collection",
    ),
  }),
  franchise: (f) => ({
    label: f.franchise_type ? `${f.franchise_type} Franchise` : "Franchise",
    titles: distinctTitles(
      [
        f.franchise_name_cn,
        f.franchise_name_en,
        f.franchise_name_alt,
        f.franchise_name_roman,
        f.franchise_name_jp,
      ],
      "Unknown Franchise",
    ),
  }),
  series: (s) => ({
    label: "Series",
    titles: distinctTitles(
      [s.series_name_cn, s.series_name_en, s.series_name_alt],
      "Unknown Series",
    ),
  }),
};

// The anime section's sub-groups, by airing_type.
const ANIME_GROUPS = [
  { label: "TV / ONA", test: (a) => a.airing_type === "TV" || a.airing_type === "ONA" },
  { label: "Movies", test: (a) => a.airing_type === "Movie" },
  { label: "Other", test: (a) => !["TV", "ONA", "Movie"].includes(a.airing_type) },
];

/**
 * The plain text card the collection, franchise, and series sections share.
 * Entry types get MediaCard instead; these tiers have no cover of their own.
 */
function TierCard({ label, titles, onClick }) {
  return (
    <div
      onClick={onClick}
      className="bg-surface border border-border p-4 cursor-pointer hover:border-text transition-colors flex flex-col justify-between"
    >
      <div>
        <Eyebrow className="mb-1.5">{label}</Eyebrow>
        <h3
          className="font-display text-lg font-semibold text-text leading-tight mb-1 line-clamp-2"
          title={titles.main}
        >
          {titles.main}
        </h3>
        {titles.sub && (
          <h4 className="text-xs text-text-faint truncate" title={titles.sub}>
            {titles.sub}
          </h4>
        )}
      </div>
    </div>
  );
}

// A media or entity section's heading: pinned under the page's own sticky
// header, with the section's result count on the right.
function SectionHeader({ heading, count, top }) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 mb-6 pb-2 border-b border-border-strong sticky z-20 bg-canvas"
      style={{ top }}
    >
      <h2 className="font-display text-2xl font-semibold text-text leading-none">
        {heading}
      </h2>
      <span className="font-mono text-[11px] text-text-faint">{count} results</span>
    </div>
  );
}

// One media type's results as its library draws them: LibraryLayout's grid
// of MediaCard, with the card's own defaults.
function MediaGrid({ type, rows, onUpdated }) {
  return (
    <div className={MEDIA_GRID_CLS}>
      {rows.map((row) => (
        <MediaCard
          key={row.system_id}
          type={type}
          data={row}
          onUpdated={(updated) => onUpdated(type, updated)}
        />
      ))}
    </div>
  );
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const scope = searchParams.get("scope") || "all";
  const requestedTab = searchParams.get("tab");
  const navigate = useNavigate();
  const auth = useAuth();
  const entityHref = useEntityHref();

  const hasQuery = !!query.trim();

  // One request. The backend runs the search - normalising case, whitespace
  // and punctuation in SQL - and returns one bucket per type.
  // `characters: true` adds the character bucket, which only this page asks
  // for - the nav dropdown's answer has none.
  const searchQuery = useApiQuery(["api", "search"], "/api/search/", {
    params: { q: query, scope, characters: true },
    enabled: hasQuery,
  });
  const loading = hasQuery && searchQuery.isLoading;
  const error = searchQuery.error?.message || null;

  // The buckets are held in state, not read straight from the response,
  // because a card's inline editors hand back an updated row and expect it to
  // replace the one on screen without a refetch.
  const [buckets, setBuckets] = useState({});
  useEffect(() => {
    const results = searchQuery.data?.results;
    setBuckets(hasQuery && results ? results : {});
  }, [searchQuery.data, hasQuery]);

  // `?? []` on every bucket. The server leaves a bucket out - no key at all -
  // for every type the viewer cannot see: a media type the role does not
  // hold, a gated type the mode hides, an entity kind without its view.* key.
  // An absent bucket reads as empty, so it draws no section, no count, no
  // tab and no contents row.
  const rowsOf = (key) => buckets[key] ?? [];

  const handleUpdated = useCallback((key, updated) => {
    setBuckets((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((row) =>
        row.system_id === updated.system_id ? updated : row,
      ),
    }));
  }, []);

  const stickyBarRef = useRef(null);
  const [stickyBarHeight, setStickyBarHeight] = useState(0);

  // Re-attached whenever the header may have (re)mounted: it is not drawn
  // while the search loads, errors or has no term.
  useEffect(() => {
    const el = stickyBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStickyBarHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, hasQuery, error]);

  // What covers a section's anchor: the nav and the page's sticky header.
  const anchorOffset = useCallback(
    () => navOffset() + (stickyBarRef.current?.offsetHeight ?? 0),
    [],
  );

  // Only sections with at least one match are drawn, so the count line, the
  // tabs and the contents are built from the same non-empty list.
  const matched = SECTIONS.filter(
    (s) => (s.anyScope || scope === "all" || scope === s.key) && rowsOf(s.key).length > 0,
  );

  // Each tab counts the rows of the sections on it.
  const tabCounts = { media: 0, people: 0, characters: 0 };
  for (const s of matched) tabCounts[s.tab] += rowsOf(s.key).length;
  const visibleTabs = SEARCH_TABS.filter((t) => tabCounts[t.key] > 0);
  // The URL's tab when it has results; otherwise the first tab that does -
  // Media, unless it is empty. A scope naming one staff type leaves only the
  // People & companies tab with anything in it, so that is where it opens.
  const activeTab = visibleTabs.some((t) => t.key === requestedTab)
    ? requestedTab
    : (visibleTabs[0]?.key ?? "media");
  const tabByLabel = Object.fromEntries(SEARCH_TABS.map((t) => [t.label, t]));
  const selectTab = (label) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tabByLabel[label].key);
    setSearchParams(next);
  };

  // The active tab's sections, and their rows in the table of contents.
  const shown = matched.filter((s) => s.tab === activeTab);
  const tocItems = shown.map((s) => ({ id: `search-${s.key}`, label: s.heading }));
  const activeSection = useScrollSpy(
    tocItems.map(({ id }) => id),
    { offsetFor: anchorOffset, enabled: tocItems.length > 0 },
  );

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Searching..." />;
  }

  if (!hasQuery) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16">
        <div className="max-w-md mx-auto border border-dashed border-border-strong px-6 py-8 text-center">
          <Eyebrow className="mb-1">Search</Eyebrow>
          <p className="text-sm text-text-muted">
            No search term yet. Enter one in the search bar at the top.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return <MediaLoadingState error={error} errorTitle="Search error" />;
  }

  const sectionHeaderTop = `calc(var(--nav-h) + ${stickyBarHeight}px)`;

  function openPath(kind, row) {
    const path = entityHref(kind, row);
    if (path) navigate(path);
  }

  function renderSection(section) {
    const rows = rowsOf(section.key);
    const header = (
      <SectionHeader heading={section.heading} count={rows.length} top={sectionHeaderTop} />
    );
    switch (section.kind) {
      case "tier":
        return (
          <>
            <Eyebrow as="h2" className="mb-3">{section.heading}</Eyebrow>
            <CollapsibleCardGrid
              items={rows}
              renderItem={(row) => (
                <TierCard
                  key={row.system_id}
                  {...TIER_CARD[section.key](row)}
                  onClick={() => openPath(section.key, row)}
                />
              )}
            />
          </>
        );
      case "seasonal":
        return (
          <>
            <Eyebrow as="h2" className="mb-3">{section.heading}</Eyebrow>
            <div className="flex flex-wrap gap-2">
              {rows.map((s) => (
                <button
                  key={s.seasonal}
                  onClick={() => navigate(`/seasonal/${encodeURIComponent(s.seasonal)}`)}
                  className={`${PILL_CLS} ${PILL_OFF}`}
                >
                  {s.seasonal}
                </button>
              ))}
            </div>
          </>
        );
      case "anime":
        return (
          <>
            {header}
            <div className="space-y-8">
              {ANIME_GROUPS.map(({ label, test }) => {
                const items = rows.filter(test);
                if (items.length === 0) return null;
                return (
                  <div key={label}>
                    <div className="flex items-center gap-3 mb-4">
                      <Eyebrow as="h3">
                        {label} · {items.length}
                      </Eyebrow>
                      <div className="flex-1 border-t border-dotted border-border-strong/60"></div>
                    </div>
                    <MediaGrid type="anime" rows={items} onUpdated={handleUpdated} />
                  </div>
                );
              })}
            </div>
          </>
        );
      case "media":
        return (
          <>
            {header}
            <MediaGrid type={section.key} rows={rows} onUpdated={handleUpdated} />
          </>
        );
      case "person":
        return (
          <>
            {header}
            <div className={ENTITY_GRID_CLS}>
              {rows.map((p) => (
                <PersonCard key={p.system_id} person={p} />
              ))}
            </div>
          </>
        );
      case "studio":
        return (
          <>
            {header}
            <div className={ENTITY_GRID_CLS}>
              {rows.map((st) => (
                <StudioCard key={st.system_id} studio={st} />
              ))}
            </div>
          </>
        );
      case "publisher":
        return (
          <>
            {header}
            <div className={ENTITY_GRID_CLS}>
              {rows.map((pb) => (
                <PublisherCard key={pb.system_id} publisher={pb} />
              ))}
            </div>
          </>
        );
      case "character":
        // The character library's cards: each character, then a card for
        // each of its other identities. The count is of characters found.
        return (
          <>
            {header}
            <div className={ENTITY_GRID_CLS}>
              {characterCards(rows).map((c) => (
                <CharacterCard key={c.card_id} character={c} />
              ))}
            </div>
          </>
        );
      default:
        return null;
    }
  }

  return (
    <div className="max-w-7xl xl:max-w-[88rem] mx-auto px-4 sm:px-6 lg:px-8 py-8 xl:flex xl:gap-8">
      <div className="min-w-0 xl:flex-1">
        {/* Sticky header: title, count line, tabs and - below xl - the
            contents as chips. The chip bar is not pinned itself: the header
            it sits in is. */}
        <div
          ref={stickyBarRef}
          className="sticky top-[var(--nav-h)] z-30 bg-canvas pb-4 mb-8 border-b border-border"
        >
          <Eyebrow className="mb-1">Search results</Eyebrow>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none">
            “{query}”
          </h1>
          <p className="font-mono text-xs text-text-muted mt-2 flex items-center flex-wrap gap-x-1">
            {/* The chip names the type, so it follows NavSearch's scope rule:
                a hand-typed scope this viewer cannot search names nothing. */}
            {scope !== "all" && canSearchScope(auth, scope) && (
              <Chip className="mr-2">{SCOPE_LABELS[scope]}</Chip>
            )}
            {matched.length === 0 ? (
              <span>No results</span>
            ) : (
              matched.map((s, i) => (
                <span key={s.key}>
                  {i > 0 && " · "}
                  <span className="text-text">{rowsOf(s.key).length}</span> {s.summary}
                </span>
              ))
            )}
          </p>
          {visibleTabs.length > 0 && (
            <div className="mt-4">
              <HubTabs
                groups={[
                  {
                    label: "Results",
                    tabs: visibleTabs.map((t) => t.label),
                    counted: true,
                  },
                ]}
                activeTab={SEARCH_TABS.find((t) => t.key === activeTab)?.label}
                onSelect={selectTab}
                getCount={(label) => tabCounts[tabByLabel[label].key]}
              />
            </div>
          )}
          <ContentsBar
            items={tocItems}
            activeId={activeSection}
            offsetFor={anchorOffset}
            className="mt-2"
          />
        </div>

        <div className="space-y-8">
          {matched.length === 0 && (
            <div className="border border-dashed border-border-strong px-4 py-10 text-center">
              <Eyebrow className="mb-1">No results</Eyebrow>
              <p className="text-sm text-text-muted">
                Nothing matches “{query}”. Try a different term or scope.
              </p>
            </div>
          )}

          {shown.map((section) => (
            <TocSection key={section.key} id={`search-${section.key}`} label={section.heading}>
              {renderSection(section)}
            </TocSection>
          ))}
        </div>
      </div>

      {/* Contents column, on the right as on the detail pages - xl+ only. */}
      <aside className="hidden xl:block w-40 shrink-0">
        <TableOfContents items={tocItems} activeId={activeSection} offsetFor={anchorOffset} />
      </aside>
    </div>
  );
}
