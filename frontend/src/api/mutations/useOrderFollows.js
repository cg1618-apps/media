// Frontend: the query and mutation hooks for following orders.
//
// A member follows at most one order per group. Every read here is the
// caller's own and needs `self.list`, so each hook takes `enabled` and the
// caller passes has("self.list") - a guest or an admin account would only
// collect 401s. Every write invalidates the one shared key prefix, so the
// dashboard section, the toggles and the entry panel all refetch together.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

/** The prefix every follow query shares; invalidating it refreshes them all. */
export const FOLLOWS_KEY = ["order-follows"];

/** Every order the caller follows, each with done / total, now and up next. */
export function useOrderFollows(enabled = true) {
  return useApiQuery(FOLLOWS_KEY, endpoints.order.follows(), { enabled });
}

/** The followed orders that step through one entry, for its detail page. */
export function useEntryFollows(entryId, enabled = true) {
  return useApiQuery(
    [...FOLLOWS_KEY, "entry", entryId],
    endpoints.order.followsForEntry(entryId),
    { enabled: Boolean(entryId) && enabled },
  );
}

/**
 * `{ listId, following, importance }` → follows the order at `importance`
 * when `following` is false, unfollows it when true.
 */
export function useToggleFollow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, following, importance }) =>
      following
        ? fetchJson(endpoints.order.follow(listId), { method: "DELETE" })
        : fetchJson(endpoints.order.follow(listId), {
            method: "PUT",
            ...jsonBody({ importance: importance || "Normal" }),
          }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FOLLOWS_KEY }),
  });
}

/** `{ listId, importance }` → changes a followed order's importance. */
export function useSetFollowImportance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, importance }) =>
      fetchJson(endpoints.order.follow(listId), {
        method: "PUT",
        ...jsonBody({ importance }),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FOLLOWS_KEY }),
  });
}

/**
 * `{ listId, stepId, skipped }` → marks the step to skip when `skipped` is
 * false, clears the mark when true.
 */
export function useToggleSkip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, stepId, skipped }) =>
      fetchJson(endpoints.order.followSkip(listId, stepId), {
        method: skipped ? "DELETE" : "PUT",
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FOLLOWS_KEY }),
  });
}
