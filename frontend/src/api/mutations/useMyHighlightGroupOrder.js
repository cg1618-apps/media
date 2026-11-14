// Frontend: the caller's own order of an h-comic's or h-game's highlight groups.
//
// 亮點 Highlights is a personal section, and the order its groups are drawn in
// is kept per account too: PUT /api/me/highlight-group-order/{media_id} with
// `{group_order: [names] | null}`, under self.personal_notes. Reads serve the
// viewer's own list (or null) as the entry's `highlight_group_order`, so the
// entry's cached detail is what is refreshed after a save. The entry PATCH no
// longer writes it.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useToast } from "../../hooks/useToast";

/** `{ ownerType, mediaId, groupOrder }` → the server's answer. */
export function useSaveMyHighlightGroupOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ mediaId, groupOrder }) =>
      fetchJson(endpoints.me.highlightGroupOrder(mediaId), {
        method: "PUT",
        ...jsonBody({ group_order: groupOrder }),
      }),
    // The detail query is keyed by the URL's public id, not the system_id
    // saved here, so every cached entry of the type is refreshed - and on a
    // failure too, so the page falls back to the stored order.
    onSettled: (_saved, _error, { ownerType }) =>
      queryClient.invalidateQueries({ queryKey: ["media-item", ownerType] }),
  });
}

/**
 * `save(names)` for one entry: shows the new order at once through `setRow`,
 * sends it, and toasts the outcome.
 */
export function useHighlightGroupOrderSaver(ownerType, mediaId, setRow) {
  const { mutateAsync } = useSaveMyHighlightGroupOrder();
  const { showToast } = useToast();
  return async function save(names) {
    setRow((row) => (row ? { ...row, highlight_group_order: names } : row));
    try {
      await mutateAsync({ ownerType, mediaId, groupOrder: names });
      showToast("success", "Group order saved");
    } catch (err) {
      showToast("error", err.message || "Save failed");
    }
  };
}
