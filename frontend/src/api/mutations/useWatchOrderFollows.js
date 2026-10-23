// Frontend: the query and mutation hooks for following watch orders.
//
// A member follows at most one order per group. Every read here is the
// caller's own and needs `self.list`, so each hook takes `enabled` and the
// caller passes has("self.list") - a guest or an admin account would only
// collect 401s. Every write invalidates the one shared key prefix, so the
// dashboard section, the toggles and the entry panel all refetch together.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

/** The prefix every follow query shares; invalidating it refreshes them all. */
export const FOLLOWS_KEY = ["watch-order-follows"];

/** Every order the caller follows, each with done / total, now and up next. */
export function useWatchOrderFollows(enabled = true) {
  return useApiQuery(FOLLOWS_KEY, endpoints.watchOrder.follows(), { enabled });
}

/** The followed orders that step through one entry, for its detail page. */
export function useEntryFollows(entryId, enabled = true) {
  return useApiQuery(
    [...FOLLOWS_KEY, "entry", entryId],
    endpoints.watchOrder.followsForEntry(entryId),
    { enabled: Boolean(entryId) && enabled },
  );
}

/**
 * `{ listId, following }` → follows the order when `following` is false,
 * unfollows it when true.
 */
export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, following }) =>
      fetchJson(endpoints.watchOrder.follow(listId), {
        method: following ? "DELETE" : "PUT",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FOLLOWS_KEY }),
  });
}
