// Frontend: the caller's own remark on an entry or a group.
//
// A remark is kept per account: each account has its own on an entry (`anime`,
// `anime-movie`, ...) or a group (`collection`, `franchise`, `series`), and
// another account's remark on the same row is untouched. It is written through
// PUT /api/me/remarks/{owner_type}/{owner_id} under self.list, with the body
// `{remark: text | null}` - empty or null clears it - and the answer is
// `{remark: text | null}`. Reads carry the caller's own value as the row's
// `remark`, so the answer folds straight back into the row a page holds, and
// the reads that show it are invalidated to refetch.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useToast } from "../../hooks/useToast";

/** `{ ownerType, ownerId, remark }` → `{remark}` as saved. */
export function useSaveMyRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerType, ownerId, remark }) =>
      fetchJson(endpoints.me.remark(ownerType, ownerId), {
        method: "PUT",
        ...jsonBody({ remark: remark || null }),
      }),
    onSuccess: (_saved, { ownerType }) => {
      queryClient.invalidateQueries({ queryKey: ["media-item", ownerType] });
      queryClient.invalidateQueries({ queryKey: ["media-list", ownerType] });
    },
  });
}

/**
 * `save(text)` for one entry or group: sends the remark, folds the saved value
 * into the page's row through `setRow`, and toasts the outcome. Resolves to the
 * saved remark, or `undefined` when the save failed.
 */
export function useMyRemarkSaver(ownerType, ownerId, setRow) {
  const { mutateAsync } = useSaveMyRemark();
  const { showToast } = useToast();
  return async function save(text) {
    try {
      const saved = await mutateAsync({ ownerType, ownerId, remark: text });
      const remark = saved?.remark ?? null;
      setRow((row) => (row ? { ...row, remark } : row));
      showToast("success", "Remark saved");
      return remark;
    } catch (err) {
      showToast("error", err.message || "Save failed");
      return undefined;
    }
  };
}
