// Frontend: the catalogue remark on an entry or a group.
//
// A remark is one shared row per entry (`anime`, `anime-movie`, ...) or group
// (`collection`, `franchise`, `series`), read by everyone who can see it and
// written by a holder of manage.catalog (`isAdmin`). It is written through the
// owner's own PATCH with the body `{remark: text | null}` - empty or null
// clears it - and the answer is the owner's row, whose `remark` folds straight
// back into the row a page holds; the reads that show it are invalidated to
// refetch. A viewer's own short notes go in the notes page's 備註列表 Remark
// List, which is personal.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useToast } from "../../hooks/useToast";

/** `{ ownerType, ownerId, remark }` → the owner's row as saved. */
export function useSaveRemark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ownerType, ownerId, remark }) =>
      fetchJson(endpoints.resource(ownerType).patch(ownerId), {
        method: "PATCH",
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
export function useRemarkSaver(ownerType, ownerId, setRow) {
  const { mutateAsync } = useSaveRemark();
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
