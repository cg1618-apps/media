// Frontend: an entry form's save creates the franchise and series it names.
//
// Every Add and Modify save of a media type does the same thing before it
// writes the entry: when the form names a franchise or a series that does
// not exist, ask once (GroupCreateModal) - showing the names that will be
// used, editable, and the franchise's types - then create the franchise, then
// the series under it, and carry on with their ids. This hook holds that
// dialog and those two writes, so the twenty-odd saves share one flow.
//
//   const { createMissingGroups, groupCreateModal } = useGroupQuickCreate({...});
//   const groups = await createMissingGroups({ franchiseId, seriesId, franchise, series });
//   if (!groups) return;   // cancelled, or a create failed (a toast said which)
//
// `franchise` is `{ names, type }` - the entry's names and the franchise type
// its media type implies, which stays ticked - or `{ names, types }` for a
// form with no implied type (the Series tab's), or null when nothing is to be
// created. `series` is `{ names, text }` or null. Render `groupCreateModal`.
import { useState } from "react";

import GroupCreateModal from "../components/modals/GroupCreateModal";
import { FRANCHISE_TYPES } from "../config/fieldOptions";
import { useAuth } from "../contexts/AuthContext";
import { visibleFranchiseTypes } from "../lib/gatedTypes";
import {
  franchiseCreateBody,
  offeredFranchiseTypes,
  orderTypes,
  seriesCreateBody,
} from "../lib/groupQuickCreate";

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return res.ok ? res.json() : null;
}

export function useGroupQuickCreate({ showToast, onFranchiseCreated, onSeriesCreated }) {
  const auth = useAuth();
  const [request, setRequest] = useState(null);

  async function createMissingGroups({ franchiseId, seriesId, franchise = null, series = null }) {
    if (!franchise && !series) return { franchiseId, seriesId };

    const locked = franchise?.type ? [franchise.type] : [];
    const initial = franchise?.types ?? [];
    const anchor = locked[0] ?? initial[0];
    const offered = franchise
      ? orderTypes(
          [...offeredFranchiseTypes(visibleFranchiseTypes(auth, FRANCHISE_TYPES), anchor), ...locked],
          FRANCHISE_TYPES,
        )
      : [];

    const answer = await new Promise((resolve) => {
      setRequest({
        franchise: franchise && { names: franchise.names, types: initial, lockedTypes: locked },
        series: series && { names: series.names, text: series.text },
        franchiseTypes: offered,
        resolve,
      });
    });
    setRequest(null);
    if (!answer) return null;

    let newFranchiseId = franchiseId;
    if (answer.franchise) {
      const nf = await postJson(
        "/api/franchise/",
        franchiseCreateBody(answer.franchise.names, answer.franchise.types),
      );
      if (!nf) {
        showToast("error", "Failed to create franchise");
        return null;
      }
      newFranchiseId = nf.system_id;
      onFranchiseCreated?.(nf);
    }

    let newSeriesId = seriesId;
    if (answer.series) {
      const ns = await postJson("/api/series/", seriesCreateBody(newFranchiseId, answer.series.names));
      if (!ns) {
        showToast("error", "Failed to create series");
        return null;
      }
      newSeriesId = ns.system_id;
      onSeriesCreated?.(ns);
    }
    return { franchiseId: newFranchiseId, seriesId: newSeriesId };
  }

  const groupCreateModal = request ? (
    <GroupCreateModal
      franchise={request.franchise}
      series={request.series}
      franchiseTypes={request.franchiseTypes}
      onConfirm={(edited) => request.resolve(edited)}
      onCancel={() => request.resolve(null)}
    />
  ) : null;

  return { createMissingGroups, groupCreateModal };
}
