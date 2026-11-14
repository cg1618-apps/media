// Frontend: the caller's own list row for one entry.
//
// PUT /api/me/list/{media_id} under self.list, with the type's own keys
// (`watching_status`, `ep_fin`, `ch_fin`, ...). It keeps the tracker's rules -
// a write carrying the counter up to its total finishes the row - so the
// answer's status may differ from what was sent. The answer is the row as the
// entry's own keys, without the `media_id` / `media_type` envelope, ready to
// fold into an entry a page holds.
import { fetchJson, jsonBody } from "./client";
import { endpoints } from "./endpoints";

export async function putMyListRow(mediaId, fields) {
  // eslint-disable-next-line no-unused-vars
  const { media_id, media_type, ...row } = await fetchJson(endpoints.me.list(mediaId), {
    method: "PUT",
    ...jsonBody(fields),
  });
  return row;
}
