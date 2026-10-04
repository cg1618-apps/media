// Frontend: the music review - every anime whose music tracking is waiting on
// something (GET /api/data-control/check/music, app/services/domain/
// music_review.py).
//
// A row lists only what is flagged: the song lists whose own status is
// flagged, and the songs that are. The chips narrow the rows to the statuses
// picked; an anime is shown while any of its flagged items matches. A row
// opens the anime's detail page, where its music notes are.
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";

// The order the chips are drawn in, and the only statuses the check returns.
export const FLAGGED_MUSIC_STATUSES = ["Need", "Pending", "No Full Version"];

const LIST_LABELS = { op: "OP", ed: "ED", insert_songs: "Insert Song", ost: "OST" };

export function musicSummary(total) {
  return total === 0
    ? "No anime has music waiting."
    : `${total} anime with music waiting.`;
}

/** The rows, each cut down to the items whose status is in `statuses`. */
export function filterMusic(rows, statuses) {
  return (rows || [])
    .map((row) => ({
      ...row,
      lists: row.lists.filter((l) => statuses.has(l.status)),
      songs: row.songs.filter((s) => statuses.has(s.status)),
    }))
    .filter((row) => row.lists.length + row.songs.length > 0);
}

function StatusTag({ status }) {
  return (
    <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap">
      {status}
    </span>
  );
}

export default function MusicView({ results }) {
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState(() => new Set(FLAGGED_MUSIC_STATUSES));
  const rows = filterMusic(results, statuses);

  function toggle(status) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  function open(row) {
    // entityPath returns "" when an entity has no public_id; never navigate to the site root.
    const path = entityPath("anime", row);
    if (path) navigate(path);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-2 px-4 py-3">
        {FLAGGED_MUSIC_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statuses.has(status)}
            onClick={() => toggle(status)}
            className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
              statuses.has(status)
                ? "border-brand text-brand bg-brand-soft"
                : "border-border text-text-faint hover:text-text-muted"
            }`}
          >
            {status}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        {rows.length === 0 ? (
          <div className="text-center py-8 text-text-faint">
            <p className="font-bold text-sm">No anime with these statuses</p>
          </div>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] font-black text-text-faint uppercase tracking-wider border-b border-border bg-surface">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">Name (CN)</th>
                <th className="px-5 py-3 whitespace-nowrap">Name (EN)</th>
                <th className="px-5 py-3 whitespace-nowrap">Lists</th>
                <th className="px-5 py-3">Songs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr
                  key={row.system_id}
                  className="hover:bg-surface-2 transition cursor-pointer align-top"
                  onClick={() => open(row)}
                >
                  <td className="px-5 py-3 font-bold text-text max-w-[180px] truncate whitespace-nowrap">
                    {row.anime_name_cn || "—"}
                  </td>
                  <td className="px-5 py-3 text-text-muted max-w-[180px] truncate whitespace-nowrap text-xs">
                    {row.anime_name_en || "—"}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {row.lists.length === 0 ? (
                      <span className="text-text-faint">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.lists.map((l) => (
                          <li key={l.kind} className="flex items-center gap-2 whitespace-nowrap">
                            <span className="text-text-muted">{LIST_LABELS[l.kind] || l.kind}</span>
                            <StatusTag status={l.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    {row.songs.length === 0 ? (
                      <span className="text-text-faint">—</span>
                    ) : (
                      <ul className="space-y-1">
                        {row.songs.map((s, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2">
                            <span className="text-text-faint font-mono text-[10px] uppercase">
                              {LIST_LABELS[s.section] || s.section}
                            </span>
                            <span className="text-text">{s.title || "Untitled"}</span>
                            {s.locator && <span className="text-text-faint">{s.locator}</span>}
                            <StatusTag status={s.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
