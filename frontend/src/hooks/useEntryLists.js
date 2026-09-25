// The entry lists the admin Add, Modify and Delete pages fill their pickers,
// search boxes, auto-fill typeaheads and ribbons from.
//
// All three pages used to fetch all twelve lists up front and hold a spinner
// over the page until the last one landed - around 4MB to render one tab. A
// tab reads its own list and, for the grouping tiers, a handful of others; the
// rest are for tabs nobody is looking at. So lists are fetched on demand, per
// type, and a type already fetched is never fetched again.
//
// `collection`, `franchise` and `series` are the exception and load eagerly:
// every tab's franchise/series pickers read them, and buildAutofillPatch
// resolves names through them, so there is no tab that does not want them.
import { useCallback, useRef, useState } from "react";

import { endpoints } from "../api/endpoints";

export const MEDIA_LIST_TYPES = [
  "anime",
  "anime-movie",
  "movie",
  "tv-show",
  "cartoon",
  "manga",
  "novel",
  "comic",
  "game",
  // Gated. Only fetched by a tab that reads them - the type's own tab, and
  // fav3x3 for h-game; for a session that cannot see the type the server
  // answers [] anyway.
  "h-comic",
  "h-game",
  "hentai",
];

// Loaded on mount by every page: read across all tabs, not owned by one.
export const GROUP_LIST_TYPES = ["collection", "franchise", "series"];

export const ALL_LIST_TYPES = [...GROUP_LIST_TYPES, ...MEDIA_LIST_TYPES];

// One frozen array shared by every unloaded key. Callers only ever read it,
// and a shared identity keeps an unloaded list from looking like a new value
// on each render.
const EMPTY = Object.freeze([]);

function blankLists() {
  return Object.fromEntries(ALL_LIST_TYPES.map((type) => [type, EMPTY]));
}

/**
 * Lazily-fetched entry lists, keyed by media type.
 *
 * Returns:
 *   lists      - { [type]: rows }, every key present, EMPTY until fetched.
 *   ensure     - ensure(types) fetches any of `types` not yet fetched and
 *                resolves to { [type]: rows } for the types asked for.
 *                Safe to call every render:
 *                a type already loaded or already in flight is not refetched.
 *   ensureAll  - ensure(ALL_LIST_TYPES); for the paths that genuinely need
 *                every list, such as a cascade delete counting its children.
 *   reloadLoaded - refetch the lists already fetched, after a mutation.
 *   setList    - replace one list, for tabs that edit rows in place.
 *   isLoading  - isLoading(type) for the one spinner a tab still shows.
 *   failed     - true once any fetch rejected, so a page can say so.
 */
export function useEntryLists() {
  const [lists, setLists] = useState(blankLists);
  const [loadingTypes, setLoadingTypes] = useState(() => new Set());
  const [failed, setFailed] = useState(false);
  // Refs, not state: `ensure` must see the current value on the call that
  // starts a fetch, and state set in the same tick would still read stale.
  const inFlight = useRef(new Map());
  const loaded = useRef(new Set());
  // The rows as well as the keys: `ensure` resolves with them, so a caller
  // that needs a list immediately (a deep link resolving ?id=) does not have
  // to wait for a re-render to read it out of state.
  const rows = useRef(blankLists());

  const fetchOne = useCallback(async (type) => {
    const res = await fetch(`${endpoints.resource(type).list()}?limit=2000`, {
      credentials: "include",
    });
    if (!res.ok) throw new Error(`${type}: ${res.status}`);
    return res.json();
  }, []);

  const ensure = useCallback(
    (types) => {
      const wanted = (Array.isArray(types) ? types : [types]).filter(Boolean);
      const missing = wanted.filter(
        (type) => !loaded.current.has(type) && !inFlight.current.has(type),
      );

      for (const type of missing) {
        const promise = fetchOne(type)
          .then((fetched) => {
            loaded.current.add(type);
            rows.current = { ...rows.current, [type]: fetched };
            setLists((prev) => ({ ...prev, [type]: fetched }));
            return fetched;
          })
          .catch((err) => {
            // Left unloaded deliberately: a later ensure() for the same tab
            // retries rather than showing an empty list as though it were a
            // complete one.
            setFailed(true);
            throw err;
          })
          .finally(() => {
            inFlight.current.delete(type);
            setLoadingTypes((prev) => {
              const next = new Set(prev);
              next.delete(type);
              return next;
            });
          });
        inFlight.current.set(type, promise);
      }

      if (missing.length) {
        setLoadingTypes((prev) => new Set([...prev, ...missing]));
      }

      // Await everything wanted, including types another caller started, so
      // two tabs asking for one list both wait for the same fetch. allSettled,
      // not all: one list failing must not strand the others.
      return Promise.allSettled(
        wanted.map((type) => inFlight.current.get(type)).filter(Boolean),
      ).then(() =>
        Object.fromEntries(wanted.map((type) => [type, rows.current[type]])),
      );
    },
    [fetchOne],
  );

  const ensureAll = useCallback(() => ensure(ALL_LIST_TYPES), [ensure]);

  // Refetch everything already fetched. This is what a page calls after a
  // mutation: ensure() deliberately never refetches, so without this a list
  // would still show a row that has just been deleted.
  const reloadLoaded = useCallback(() => {
    const stale = [...loaded.current];
    loaded.current = new Set();
    return ensure(stale);
  }, [ensure]);

  const setList = useCallback((type, value) => {
    setLists((prev) => {
      const next = typeof value === "function" ? value(prev[type]) : value;
      rows.current = { ...rows.current, [type]: next };
      return { ...prev, [type]: next };
    });
  }, []);

  const isLoading = useCallback(
    (type) => loadingTypes.has(type),
    [loadingTypes],
  );

  return {
    lists,
    ensure,
    ensureAll,
    reloadLoaded,
    setList,
    isLoading,
    failed,
  };
}
