// Frontend: the query and mutation hooks for 待補充 Needs Work.
//
// Three reads - the page's grouped list, the notes in use (the note field's
// suggestions) and one owner's mark - all under the one `["needs-work"]`
// prefix, so every write refetches all three: clearing a mark on the page
// and the badge on that entry's detail page agree in the same session.
//
// Every route is manage.requests; a caller without it gets 401, so the
// components that read here ask `has("manage.requests")` first.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

export const NEEDS_WORK_QUERY_KEY = ["needs-work"];
export const needsWorkMarkQueryKey = (ownerType, ownerId) => [
  "needs-work",
  "mark",
  ownerType,
  ownerId,
];

/** Every mark, as `[{ note, items: [...] }]`; the unnoted group last. */
export function useNeedsWorkList({ enabled = true } = {}) {
  return useApiQuery([...NEEDS_WORK_QUERY_KEY, "list"], endpoints.needsWork.list(), {
    enabled,
  });
}

/** The notes in use, most used first, as `[{ note, count }]`. */
export function useNeedsWorkNotes({ enabled = true } = {}) {
  return useApiQuery([...NEEDS_WORK_QUERY_KEY, "notes"], endpoints.needsWork.notes(), {
    enabled,
  });
}

/** One owner's mark: `{ owner_type, owner_id, flagged, note, ... }`. */
export function useNeedsWorkMark(ownerType, ownerId, { enabled = true } = {}) {
  return useApiQuery(
    needsWorkMarkQueryKey(ownerType, ownerId),
    endpoints.needsWork.mark(ownerType, ownerId),
    { enabled: enabled && Boolean(ownerType && ownerId) },
  );
}

function useNeedsWorkMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: NEEDS_WORK_QUERY_KEY }),
  });
}

/** `{ ownerType, ownerId, note }` → the mark. Marks, or changes the note. */
export function useSetNeedsWork() {
  return useNeedsWorkMutation(({ ownerType, ownerId, note }) =>
    fetchJson(endpoints.needsWork.mark(ownerType, ownerId), {
      method: "PUT",
      ...jsonBody({ note: note?.trim() || null }),
    }),
  );
}

/** `{ ownerType, ownerId }` → clears the mark. */
export function useClearNeedsWork() {
  return useNeedsWorkMutation(({ ownerType, ownerId }) =>
    fetchJson(endpoints.needsWork.mark(ownerType, ownerId), { method: "DELETE" }),
  );
}
