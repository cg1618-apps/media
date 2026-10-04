// Frontend: the relation review - franchises and series holding exactly one
// media entry (GET /api/data-control/check/alone-groups,
// app/services/domain/alone_groups.py).
//
// Some groups are single on purpose, so each row has "Reviewed – keep": it
// records the group's current lone entry, and the group stays off the list
// until that entry is replaced. The row leaves this list at once; a 409 means
// the group changed since the list was loaded, and the error says so.
//
// A row whose lone entry is of a gated type the session may not see is not
// drawn (lib/gatedTypes.js).
import { useState } from "react";
import { Link } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { entityPath } from "../../lib/entityPath";
import { canSeeGatedType } from "../../lib/gatedTypes";
import { EmptyTab, ReviewTabBar } from "./ReviewBlock";

const KINDS = [
  { key: "franchise", label: "Franchise" },
  { key: "series", label: "Series" },
];

const TYPE_LABELS = {
  anime: "Anime",
  "anime-movie": "Anime Movie",
  movie: "Movie",
  "tv-show": "TV Show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
  game: "Game",
  "h-comic": "H-Comic",
  hentai: "Hentai",
  "h-game": "H-Game",
};

/** {franchise: [...], series: [...]} without rows this session may not see. */
export function visibleAloneGroups(results, auth) {
  const out = {};
  for (const { key } of KINDS) {
    out[key] = (results?.[key] || []).filter((g) =>
      canSeeGatedType(auth, g.entry.media_type),
    );
  }
  return out;
}

export function countAloneGroups(results, auth) {
  const groups = visibleAloneGroups(results, auth);
  return groups.franchise.length + groups.series.length;
}

export function aloneSummary(total) {
  return total === 0
    ? "Every franchise and series holds more than one entry, or was reviewed."
    : `${total} group${total !== 1 ? "s" : ""} with a single entry.`;
}

export default function RelationView({ results, onReviewed }) {
  const groups = visibleAloneGroups(results, useAuth());
  const [tab, setTab] = useState("franchise");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const rows = groups[tab];

  async function review(group) {
    setBusy(group.system_id);
    setError(null);
    try {
      await fetchJson(endpoints.dataControl.markAloneGroupReviewed(tab, group.system_id), {
        method: "POST",
      });
      onReviewed(tab, group.system_id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <ReviewTabBar
        tabs={KINDS.map((k) => ({ ...k, count: groups[k.key].length }))}
        active={tab}
        onSelect={setTab}
      />
      {error && (
        <p role="alert" className="px-5 pt-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyTab>No single-entry {tab} to review</EmptyTab>
        ) : (
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] font-black text-text-faint uppercase tracking-wider border-b border-border bg-surface">
              <tr>
                <th className="px-5 py-3 whitespace-nowrap">
                  {tab === "franchise" ? "Franchise" : "Series"}
                </th>
                <th className="px-5 py-3 whitespace-nowrap">Type</th>
                <th className="px-5 py-3">Only entry</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((g) => (
                <tr key={g.system_id}>
                  <td className="px-5 py-3 font-bold text-text">
                    <Link to={entityPath(tab, g) || "#"} className="hover:text-brand">
                      {g.display_name || "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap text-xs text-text-faint">
                    <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
                      {TYPE_LABELS[g.entry.media_type] || g.entry.media_type}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-text-muted">
                    <Link
                      to={entityPath(g.entry.media_type, g.entry) || "#"}
                      className="hover:text-brand"
                    >
                      {g.entry.display_name || "—"}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => review(g)}
                      disabled={busy === g.system_id}
                      className="px-3 py-1 rounded-lg text-xs font-bold border border-border-strong text-text-muted hover:text-text hover:border-text transition disabled:opacity-60 whitespace-nowrap"
                    >
                      {busy === g.system_id ? "Saving…" : "Reviewed – keep"}
                    </button>
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
