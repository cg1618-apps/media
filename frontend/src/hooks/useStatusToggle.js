// Frontend: the caller's own status, progress and plan flags on one entry.
//
// Personal values are each account's own and are written under /api/me, not
// through the catalogue PATCH (which asks manage.catalog, so a `user` could
// not change its own list):
//
//   - a plan flag (watch_next, to_rewatch and each type's spelling of them)
//     goes to PUT /api/me/plan-flags/{id};
//   - every other personal key - the status, a progress counter, time_fin,
//     my_rating - goes to PUT /api/me/list/{id}, which keeps the tracker's
//     rules: reaching the total finishes the caller's row.
//
// `catalogue` is the one exception, for a control that edits the work as well
// as the viewer's row (MediaCard's bolt sets the airing status). It goes to
// the catalogue PATCH, and only an editor is offered such a control.
//
// The answer is the entry as the caller's caches hold it with every saved
// value folded in, so a caller that replaces its row with the result keeps
// the catalogue half it did not send.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchJson, jsonBody } from "../api/client";
import { endpoints } from "../api/endpoints";
import { putMyListRow } from "../api/myList";
import { MEDIA_CONFIG } from "../utils/media";
import { mediaItemQueryKey } from "./useMediaItem";

// Every type's plan-flag key names, as app/utils/plan_next_kinds.py's
// PLAN_FLAG_FIELDS spells them. The route refuses one a type does not have.
export const PLAN_FLAG_KEYS = new Set([
  "watch_next",
  "to_rewatch",
  "read_next",
  "to_reread",
  "play_next",
  "to_replay",
]);

/** `{list, planFlags}`: a personal payload split by the route that owns it. */
export function splitPersonal(personal) {
  const list = {};
  const planFlags = {};
  for (const [key, value] of Object.entries(personal)) {
    if (PLAN_FLAG_KEYS.has(key)) planFlags[key] = Boolean(value);
    else list[key] = value;
  }
  return { list, planFlags };
}

function cachedEntry(queryClient, type, id) {
  const item = queryClient.getQueryData(mediaItemQueryKey(type, id));
  if (item) return item;
  for (const [, data] of queryClient.getQueriesData({ queryKey: ["media-list", type] })) {
    const hit = Array.isArray(data) && data.find((row) => row.system_id === id);
    if (hit) return hit;
  }
  return { system_id: id };
}

export function useStatusToggle(type) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, value, field, fields, catalogue }) => {
      const { apiEndpoint, statusField } = MEDIA_CONFIG[type];
      const personal = fields || { [field || statusField]: value };
      const { list, planFlags } = splitPersonal(personal);

      let entry = cachedEntry(queryClient, type, id);
      if (catalogue && Object.keys(catalogue).length) {
        entry = await fetchJson(`${apiEndpoint}/${id}`, {
          method: "PATCH",
          ...jsonBody(catalogue),
        });
      }
      const saved = {};
      if (Object.keys(list).length) {
        Object.assign(saved, await putMyListRow(id, list));
      }
      if (Object.keys(planFlags).length) {
        Object.assign(
          saved,
          await fetchJson(endpoints.me.planFlags(id), {
            method: "PUT",
            ...jsonBody(planFlags),
          }),
        );
      }
      return { ...entry, ...saved };
    },
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(mediaItemQueryKey(type, variables.id), (old) =>
        old ? { ...old, ...updated } : old,
      );
      queryClient.setQueriesData({ queryKey: ["media-list", type] }, (old) =>
        Array.isArray(old)
          ? old.map((item) =>
              item.system_id === variables.id ? { ...item, ...updated } : item,
            )
          : old,
      );
      queryClient.invalidateQueries({ queryKey: ["media-list", type] });
      queryClient.invalidateQueries({ queryKey: ["plan-next"] });
    },
  });
}
