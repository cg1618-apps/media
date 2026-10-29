// Frontend: the one place that knows the shape of an /watch-orders URL.
//
// The admin page keeps its state in two query parameters: ?owner=<tier>:<id>,
// the group its left pane is scoped to, and ?order=<system_id>, the order open
// in the editor. Hubs and the full page link in with both, so "Edit" lands on
// the order the reader was looking at rather than at the page's start.
import { buildUrl } from "../api/client";

// The owner of a list as one string, so lists and owners can be joined
// without every call site re-checking which of the three id columns is set.
export function ownerKeyOf(list) {
  if (list.franchise_id) return `franchise:${list.franchise_id}`;
  if (list.series_id) return `series:${list.series_id}`;
  if (list.collection_id) return `collection:${list.collection_id}`;
  return "unknown";
}

// /watch-orders opened on one owner, and on one of its orders when given.
export function watchOrderEditPath(ownerKey, orderId) {
  return buildUrl("/watch-orders", {
    owner: ownerKey === "unknown" ? null : ownerKey,
    order: orderId,
  });
}
