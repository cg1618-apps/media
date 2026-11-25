// Frontend: page component file for CollectionLibrary.
//
// Collections are the optional umbrella tier above Franchise. Unlike the
// Franchise library there is no type filter, because a collection has no type.
import { useState, useEffect, useMemo } from "react";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import { useViewScope } from "../../hooks/useViewScope";
import { getSortName, cleanString } from "../../utils/media";
import { compareTitles } from "../../lib/naming";
import { compareGroups, groupSortOptions } from "../../lib/groupSort";
import { directed } from "../../lib/sortDirection";
import { useSortState } from "../../hooks/useSortState";
import LibraryToolbar from "../../components/layout/LibraryToolbar";
import { getCollectionCover, withMediaType } from "../../lib/covers";
import CollectionCard from "../../components/cards/CollectionCard";
import { Eyebrow } from "../../components/ui/primitives";

export default function CollectionLibrary() {
  const [allCollections, setAllCollections] = useState([]);
  const [franchisesByCollection, setFranchisesByCollection] = useState({});
  const [allEntriesDict, setAllEntriesDict] = useState({});
  const [allEntriesByFranchise, setAllEntriesByFranchise] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const {
    sort: currentSort,
    setSort: setCurrentSort,
    reversed,
    setReversed,
  } = useSortState("my_rating");
  // A collection's rating and expectation are the viewer's own (self.list).
  // Without the key neither sort is offered and the library sorts by title -
  // the chosen sort, my rating by default, would order by values the server
  // never sends.
  const { ownData: showPersonal } = useViewScope();
  const sort = showPersonal ? currentSort : "title";

  useEffect(() => {
    async function load() {
      try {
        const responses = await Promise.all([
          fetch("/api/collection/?limit=2000", { credentials: "include" }),
          fetch("/api/franchise/?limit=2000", { credentials: "include" }),
          fetch("/api/anime/?limit=2000", { credentials: "include" }),
          fetch("/api/anime-movie/?limit=2000", { credentials: "include" }),
          fetch("/api/movies/?limit=2000", { credentials: "include" }),
          fetch("/api/tv-shows/?limit=2000", { credentials: "include" }),
          fetch("/api/cartoon/?limit=2000", { credentials: "include" }),
          fetch("/api/manga/?limit=2000", { credentials: "include" }),
          fetch("/api/book/?limit=2000", { credentials: "include" }),
          fetch("/api/comic/?limit=2000", { credentials: "include" }),
        ]);
        if (responses.some((r) => !r.ok)) throw new Error("Failed to load data");

        const [
          collections,
          franchises,
          anime,
          animeMovies,
          movies,
          tvShows,
          cartoons,
          mangas,
          books,
          comics,
        ] = await Promise.all(responses.map((r) => r.json()));

        // Tagged with the media type each list was fetched as: covers live
        // in owner-typed folders, so the cover fallback needs it.
        const allEntries = [
          ...withMediaType(anime, "anime"),
          ...withMediaType(animeMovies, "anime-movie"),
          ...withMediaType(movies, "movie"),
          ...withMediaType(tvShows, "tv-show"),
          ...withMediaType(cartoons, "cartoon"),
          ...withMediaType(mangas, "manga"),
          ...withMediaType(books, "book"),
          ...withMediaType(comics, "comic"),
        ];

        setAllCollections(collections);
        setAllEntriesDict(
          Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
        );

        const byFranchise = {};
        for (const e of allEntries) {
          if (!e.franchise_id) continue;
          if (!byFranchise[e.franchise_id]) byFranchise[e.franchise_id] = [];
          byFranchise[e.franchise_id].push(e);
        }
        setAllEntriesByFranchise(byFranchise);

        // Member franchises per collection, name-sorted so cover fallback and
        // the member count are stable between renders.
        const byCollection = {};
        for (const f of franchises) {
          if (!f.collection_id) continue;
          if (!byCollection[f.collection_id]) byCollection[f.collection_id] = [];
          byCollection[f.collection_id].push(f);
        }
        for (const list of Object.values(byCollection)) {
          list.sort((a, b) =>
            compareTitles(getSortName(a, "franchise"), getSortName(b, "franchise")),
          );
        }
        setFranchisesByCollection(byCollection);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredAndSorted = useMemo(() => {
    const qClean = cleanString(searchQuery);

    const result = allCollections.filter((c) => {
      if (!qClean) return true;
      return [
        c.collection_name_cn,
        c.collection_name_en,
        c.collection_name_roman,
        c.collection_name_jp,
        c.collection_name_alt,
      ].some((n) => n && cleanString(n).includes(qClean));
    });

    result.sort(directed((a, b) => compareGroups(a, b, sort, "collection"), reversed));

    return result;
  }, [allCollections, searchQuery, sort, reversed]);

  // Search, filter and sort see every item; the grid draws them a batch at a
  // time, so a long library does not mount every card - and its cover - at once.
  const { visible, hasMore, sentinelRef } = useIncrementalList(filteredAndSorted);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-2xl mb-3"></i>
          <p className="text-text-faint">Loading collections...</p>
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
          <div className="mb-3">
            <h1 className="font-display text-3xl font-semibold text-text leading-none">
              Collections
            </h1>
            <p className="font-mono text-[11px] text-text-faint mt-1.5">
              {filteredAndSorted.length} collection
              {filteredAndSorted.length !== 1 ? "s" : ""}
              {searchQuery && ` matching "${searchQuery}"`}
            </p>
          </div>

          {/* A collection has no type, so there is no filter. */}
          <LibraryToolbar
            search={{
              value: searchQuery,
              onChange: setSearchQuery,
              placeholder: "Search collections...",
            }}
            sort={{
              options: groupSortOptions(showPersonal),
              value: sort,
              onChange: setCurrentSort,
              reversed,
              onReversedChange: setReversed,
            }}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {filteredAndSorted.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border-strong">
            <Eyebrow className="mb-1">Empty</Eyebrow>
            <p className="text-text-muted text-sm">No collections found</p>
            <p className="text-sm text-text-faint mt-1">
              {searchQuery ? (
                <>
                  Try a different search or{" "}
                  <button
                    onClick={() => setSearchQuery("")}
                    className="text-brand hover:underline"
                  >
                    reset
                  </button>
                </>
              ) : (
                "Collections group related franchises, like Marvel or Type-Moon."
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visible.map((collection) => {
                const members = franchisesByCollection[collection.system_id] || [];
                return (
                  <CollectionCard
                    key={collection.system_id}
                    collection={collection}
                    memberCount={members.length}
                    cover={getCollectionCover(
                      collection,
                      members,
                      allEntriesDict,
                      allEntriesByFranchise,
                    )}
                  />
                );
              })}
            </div>
            {hasMore && <div ref={sentinelRef} aria-hidden="true" />}
          </>
        )}
      </div>
    </div>
  );
}
