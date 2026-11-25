// Frontend: the caller's own plan_next rows, every kind and type.
//
// One query under ["plan-next"], read by the Plan page (usePlanData) and by a
// game's detail page (PlanPlatformGroupField). Not a media list: plan_next has
// no MEDIA_CONFIG entry, so this sits under its own key - the media-list cache
// writers (useStatusToggle, useMediaCacheUpdate) map over every
// ["media-list", *] entry and must never see this non-list payload. Every
// plan-flag write invalidates the key (useStatusToggle), so a row queued or
// unqueued on a detail page reaches both readers.
import { useQuery } from "@tanstack/react-query";

import { fetchJson } from "../api/client";
import { endpoints } from "../api/endpoints";

export function usePlanNextRows({ enabled = true } = {}) {
  return useQuery({
    queryKey: ["plan-next"],
    queryFn: () => fetchJson(endpoints.planNext.list()),
    staleTime: 30_000,
    enabled,
  });
}
