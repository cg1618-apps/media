// Frontend: thin fetch wrappers for the note endpoints. The notes page reads
// its own structure from the backend registry, so there is no local config.
//
// These go through the shared client so cookies are sent and backend `detail`
// messages surface as Error messages. DELETE answers 204, which has no body,
// so it cannot use fetchJson.
import { buildUrl, fetchJson, jsonBody } from "../../api/client";

const BASE = "/api/notes";

// 204 No Content: succeed without parsing a body.
const fetchNoContent = async (url, options = {}) => {
  const res = await fetch(url, { credentials: "include", ...options });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.detail || data?.message || res.statusText || "Request failed");
  }
  return null;
};

export const fetchSections = (ownerType) =>
  fetchJson(buildUrl(`${BASE}/sections`, { owner_type: ownerType }));

// The values of one system_option category offered on this owner type, as
// strings in their sort order - the suggestions behind a section's
// `kind_category` (Song Type) or `link_text_category` (Song Source).
export const fetchOptionValues = async (category, ownerType) => {
  const rows = await fetchJson(
    buildUrl(`/api/options/${encodeURIComponent(category)}`, { scope: ownerType }),
  );
  return (rows || []).map((row) => row.value);
};

export const fetchNotes = (ownerType, ownerId) =>
  fetchJson(buildUrl(BASE, { owner_type: ownerType, owner_id: ownerId }));

export const createNote = (payload) =>
  fetchJson(BASE, { method: "POST", ...jsonBody(payload) });

export const updateNote = (id, payload) =>
  fetchJson(`${BASE}/${id}`, { method: "PATCH", ...jsonBody(payload) });

// Renumbers sort_index for one section of one owner. `orderedIds` must name
// exactly that section's notes - the endpoint answers 400 otherwise, which is
// what keeps a partial list from quietly renumbering half a section. A
// hierarchical section therefore sends its whole tree, flattened depth-first.
export const reorderNotes = (ownerType, ownerId, section, orderedIds) =>
  fetchJson(`${BASE}/reorder`, {
    method: "PATCH",
    ...jsonBody({
      owner_type: ownerType,
      owner_id: ownerId,
      section,
      ordered_ids: orderedIds,
    }),
  });

export const deleteNote = (id) =>
  fetchNoContent(`${BASE}/${id}`, { method: "DELETE" });
