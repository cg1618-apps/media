// Frontend: the mutation that files a queued game under a platform group.
//
// `{ systemId, platformGroup }` PATCHes the caller's own plan row; null moves
// it back to ungrouped. Invalidates the plan-next queries, so the Plan page
// redraws the card under its new heading.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "../client";
import { endpoints } from "../endpoints";

export function usePlanPlatformGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ systemId, platformGroup }) =>
      fetchJson(endpoints.planNext.row(systemId), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform_group: platformGroup }),
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["plan-next"] }),
  });
}
