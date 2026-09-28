// Frontend: mutation hooks for the Resources tree (/resources).
//
// Every write refetches the one tree query, the way the media hooks in
// useMediaMutation.js invalidate their list. Reorder is also applied to the
// cache first, so a dragged row does not snap back while the request is in
// flight; a failure rolls it back and the refetch settles it either way.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { applyReorder } from "../../lib/resourceTree";

export const RESOURCES_QUERY_KEY = ["resources"];

function useTreeMutation(mutationFn, extra = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    ...extra,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: RESOURCES_QUERY_KEY }),
  });
}

/** `{ kind, parent_id?, title?, content? }` → the created node. */
export function useCreateResource() {
  return useTreeMutation((body) =>
    fetchJson(endpoints.resources.create(), { method: "POST", ...jsonBody(body) }),
  );
}

/** `{ id, data: { title?, content? } }` → the updated node. */
export function usePatchResource() {
  return useTreeMutation(({ id, data }) =>
    fetchJson(endpoints.resources.patch(id), { method: "PATCH", ...jsonBody(data) }),
  );
}

/** `id` → deletes the node and everything below it. */
export function useDeleteResource() {
  return useTreeMutation((id) =>
    fetchJson(endpoints.resources.remove(id), { method: "DELETE" }),
  );
}

/** `{ parent_id, ordered_ids }` - the COMPLETE new child list of one parent. */
export function useReorderResources() {
  const queryClient = useQueryClient();
  return useTreeMutation(
    (body) =>
      fetchJson(endpoints.resources.reorder(), { method: "PATCH", ...jsonBody(body) }),
    {
      onMutate: async (body) => {
        await queryClient.cancelQueries({ queryKey: RESOURCES_QUERY_KEY });
        const previous = queryClient.getQueryData(RESOURCES_QUERY_KEY);
        if (previous) {
          queryClient.setQueryData(RESOURCES_QUERY_KEY, applyReorder(previous, body));
        }
        return { previous };
      },
      onError: (_err, _body, context) => {
        if (context?.previous) {
          queryClient.setQueryData(RESOURCES_QUERY_KEY, context.previous);
        }
      },
    },
  );
}
