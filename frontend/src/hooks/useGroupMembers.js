// Frontend: what one collection, franchise or series holds, read from the
// server.
//
// The admin Delete page shows these members before deleting the group and,
// for a cascade, deletes exactly them. They are read per type from the list
// endpoints filtered by the group's id, not from the page's entry lists: those
// are loaded per tab (useEntryLists), so on a group tab most of them were
// never fetched and read as empty - an undercount that looked like a complete
// answer.
import { useQueries } from "@tanstack/react-query";

import { endpoints } from "../api/endpoints";
import { buildUrl, fetchJson } from "../api/client";
import { MEDIA_LIST_TYPES } from "./useEntryLists";

// The column each tier's members point at it with.
const PARENT_FIELD = {
  collection: "collection_id",
  franchise: "franchise_id",
  series: "series_id",
};

// The lists asked, per tier. anime-movie is left out of a series: anime_movies
// has no series_id, and a list endpoint ignores a filter it does not declare,
// so ?series_id= there would answer with every anime movie in the database.
export function memberTypesOf(tier) {
  if (tier === "collection") return ["franchise"];
  if (tier === "franchise") return ["series", ...MEDIA_LIST_TYPES];
  if (tier === "series")
    return MEDIA_LIST_TYPES.filter((type) => type !== "anime-movie");
  return [];
}

/**
 * The members of the `tier` row `id` (nothing while `id` is empty).
 *
 * Returns:
 *   franchises - a collection's member franchises.
 *   series     - a franchise's series.
 *   entries    - [{ type, rows }] per media type holding any, in
 *                MEDIA_LIST_TYPES order.
 *   entryCount - the media entries across every type.
 *   isLoading  - true until every list has answered.
 *   isError    - true when any list failed; the set is then incomplete.
 */
export function useGroupMembers(tier, id) {
  const field = PARENT_FIELD[tier];
  const types = id && field ? memberTypesOf(tier) : [];

  return useQueries({
    queries: types.map((type) => ({
      queryKey: ["group-members", tier, String(id), type],
      queryFn: () =>
        fetchJson(
          buildUrl(endpoints.resource(type).list(), {
            [field]: id,
            limit: 2000,
          }),
        ),
      // Always fresh: this is what a cascade is about to delete.
      staleTime: 0,
    })),
    combine: (results) => {
      const byType = {};
      results.forEach((result, i) => {
        // The server filters; this re-checks, so a filter the endpoint did not
        // honour can never put an unrelated row into a cascade.
        byType[types[i]] = (result.data || []).filter(
          (row) => String(row[field]) === String(id),
        );
      });
      const entries = MEDIA_LIST_TYPES.filter(
        (type) => byType[type]?.length,
      ).map((type) => ({ type, rows: byType[type] }));
      return {
        franchises: byType.franchise || [],
        series: byType.series || [],
        entries,
        entryCount: entries.reduce((n, group) => n + group.rows.length, 0),
        isLoading: results.some((result) => result.isPending),
        isError: results.some((result) => result.isError),
      };
    },
  });
}
