// Frontend: the query and mutation hooks for pending registrations.
//
// One read - the accounts waiting for approval (`/api/users/?status=pending`)
// - and two writes, approve and decline. Every key lives under the one
// `["users"]` prefix, so a single invalidation after either write refetches
// the pending list and any cached list of accounts with it.
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson, jsonBody } from "../client";
import { endpoints } from "../endpoints";
import { useApiQuery } from "../../hooks/useApiQuery";

export const USERS_QUERY_KEY = ["users"];
export const PENDING_USERS_QUERY_KEY = ["users", "pending"];

/** The accounts waiting for approval. `enabled` false asks nothing. */
export function usePendingRegistrations({ enabled = true } = {}) {
  return useApiQuery(PENDING_USERS_QUERY_KEY, endpoints.users.list(), {
    params: { status: "pending" },
    enabled,
  });
}

function useRegistrationMutation(mutationFn) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: USERS_QUERY_KEY }),
  });
}

/**
 * `{ id, data: { role_id?, ceiling_mode, default_mode } }` → the account, now
 * active. A 422 (refused role or mode) or 409 (not pending) throws with the
 * server's sentence as its message.
 */
export function useApproveRegistration() {
  return useRegistrationMutation(({ id, data }) =>
    fetchJson(endpoints.users.approve(id), { method: "POST", ...jsonBody(data) }),
  );
}

/** `id` → nothing (204); the pending account is deleted. 409 if not pending. */
export function useDeclineRegistration() {
  return useRegistrationMutation((id) =>
    fetchJson(endpoints.users.reject(id), { method: "POST" }),
  );
}
