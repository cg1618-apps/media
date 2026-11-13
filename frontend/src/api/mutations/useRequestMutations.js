// Frontend: the query and mutation hooks for requests and reports.
//
// Two reads - the filer's own list (`/api/requests/mine`) and the handler's
// inbox (`/api/requests`) - and every write refetches both, the way
// useResourceMutations does for its one tree. Both lists live under the one
// `["requests"]` prefix, so a single invalidation reaches every status filter
// of either page: a handler closing a request and its author reading it in the
// same session see the same row.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

export const REQUESTS_QUERY_KEY = ["requests"];
export const myRequestsQueryKey = (status) => ["requests", "mine", status ?? "all"];
export const requestInboxQueryKey = (status) => ["requests", "inbox", status];

/** The caller's own requests, newest first; `status` omitted is every status. */
export function useMyRequests(status) {
  return useApiQuery(myRequestsQueryKey(status), endpoints.requests.mine(), {
    params: status ? { status } : undefined,
  });
}

/** The inbox, newest first; `status` is open, done, declined or all. */
export function useRequestInbox(status = "open") {
  return useApiQuery(requestInboxQueryKey(status), endpoints.requests.inbox(), {
    params: { status },
  });
}

function useRequestMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: REQUESTS_QUERY_KEY }),
  });
}

/**
 * `{ kind, description, remark?, target_type?, target_id?, page_path? }` →
 * the created request. A 409 (over the open-request limit) throws with the
 * server's sentence as its message.
 */
export function useFileRequest() {
  return useRequestMutation((body) =>
    fetchJson(endpoints.requests.create(), { method: "POST", ...jsonBody(body) }),
  );
}

/** `{ id, data: { description?, remark? } }` → the request; the author's own. */
export function useEditRequest() {
  return useRequestMutation(({ id, data }) =>
    fetchJson(endpoints.requests.update(id), { method: "PATCH", ...jsonBody(data) }),
  );
}

/** `{ id, status, response? }` → the request. Inbox only. */
export function useSetRequestStatus() {
  return useRequestMutation(({ id, status, response }) =>
    fetchJson(endpoints.requests.status(id), {
      method: "PUT",
      ...jsonBody(response === undefined ? { status } : { status, response }),
    }),
  );
}

/** `id` → deletes the request outright. Inbox only. */
export function useDeleteRequest() {
  return useRequestMutation((id) =>
    fetchJson(endpoints.requests.remove(id), { method: "DELETE" }),
  );
}
