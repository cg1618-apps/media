// Frontend: the "have remark" review - every entry the caller has written a
// remark on, one tab per media type.
//
// Drawn by the Remarks block of /review-queue and by the Control Center's
// Remarks modal, so the two cannot drift apart. The rows come from
// GET /api/data-control/check/remarks (app/services/domain/remarks.py); each
// carries public_id, so a row opens its entry.
//
// The gated types' tabs (h-comic, hentai, h-game) are drawn only for a
// session that may see the type (lib/gatedTypes.js), like every other type
// picker in the SPA.
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../contexts/AuthContext";
import { entityPath } from "../../lib/entityPath";
import { visibleByType } from "../../lib/gatedTypes";
import { EmptyTab, ReviewTabBar } from "./ReviewBlock";

const WATCHING = { label: "Watching", field: "watching_status" };
const READING = { label: "Reading", field: "reading_status" };
const PLAYING = { label: "Playing", field: "playing_status" };

// Each tab's columns after the two names. `chip` draws the value as a tag.
// `type` is the route type (entityPath, gating); `key` the response key.
export const REMARK_TABS = [
  { key: "anime", type: "anime", label: "Anime",
    names: ["anime_name_cn", "anime_name_en"],
    extra: [{ label: "Type", field: "airing_type", chip: true }, WATCHING] },
  { key: "anime_movie", type: "anime-movie", label: "Anime Movie",
    names: ["anime_movie_name_cn", "anime_movie_name_en"], extra: [WATCHING] },
  { key: "movie", type: "movie", label: "Movie",
    names: ["movie_name_cn", "movie_name_en"],
    extra: [{ label: "Release date", field: "release_date" }, WATCHING] },
  { key: "tv_show", type: "tv-show", label: "TV Show",
    names: ["tv_name_cn", "tv_name_en"],
    extra: [{ label: "Season", field: "season_part" }, WATCHING] },
  { key: "cartoon", type: "cartoon", label: "Cartoon",
    names: ["cartoon_name_cn", "cartoon_name_en"],
    extra: [{ label: "Type", field: "airing_type", chip: true }, WATCHING] },
  { key: "manga", type: "manga", label: "Manga",
    names: ["manga_name_cn", "manga_name_en"],
    extra: [{ label: "Is main", field: "is_main" }, READING] },
  { key: "novel", type: "novel", label: "Novel",
    names: ["novel_name_cn", "novel_name_en"],
    extra: [{ label: "Is main", field: "is_main" }, READING] },
  // EN leads: comic's display name falls back EN -> CN -> Alt, the reverse
  // of every other tab here.
  { key: "comic", type: "comic", label: "Comic",
    names: ["comic_name_en", "comic_name_cn"],
    extra: [{ label: "Volume", field: "volume_label" }, READING] },
  { key: "game", type: "game", label: "Game",
    names: ["game_name_cn", "game_name_en"],
    extra: [{ label: "Type", field: "game_type", chip: true }, PLAYING] },
  { key: "h_comic", type: "h-comic", label: "H-Comic",
    names: ["h_comic_name_cn", "h_comic_name_en"],
    extra: [{ label: "Region", field: "region", chip: true }, READING] },
  { key: "hentai", type: "hentai", label: "Hentai",
    names: ["hentai_name_cn", "hentai_name_en"],
    extra: [{ label: "No.", field: "series_number" }, WATCHING] },
  { key: "h_game", type: "h-game", label: "H-Game",
    names: ["h_game_name_cn", "h_game_name_en"],
    extra: [{ label: "Type", field: "game_type", chip: true }, PLAYING] },
];

/** The tabs this session may see, each with its rows. */
export function remarkTabs(results, auth) {
  return visibleByType(auth, REMARK_TABS, (t) => t.type).map((t) => ({
    ...t,
    entries: results?.[t.key] || [],
  }));
}

/** How many remarked entries the visible tabs hold. */
export function countRemarks(results, auth) {
  return remarkTabs(results, auth).reduce((s, t) => s + t.entries.length, 0);
}

export function remarkSummary(total) {
  return total === 0
    ? "No entries have a remark."
    : `${total} entr${total !== 1 ? "ies" : "y"} with a remark.`;
}

const colClass = "px-5 py-3 whitespace-nowrap";
const cellClass = "px-5 py-3 whitespace-nowrap text-xs text-text-faint";

function RemarkTable({ tab }) {
  const navigate = useNavigate();
  // entityPath returns "" when an entity has no public_id; never navigate to the site root.
  const open = (entry) => {
    const path = entityPath(tab.type, entry);
    if (path) navigate(path);
  };
  if (tab.entries.length === 0) {
    return <EmptyTab>No remarks in this category</EmptyTab>;
  }
  const [lead, second] = tab.names;
  return (
    <table className="w-full text-sm text-left">
      <thead className="text-[10px] font-black text-text-faint uppercase tracking-wider border-b border-border bg-surface">
        <tr>
          <th className={colClass}>Name ({lead.endsWith("_en") ? "EN" : "CN"})</th>
          <th className={colClass}>Name ({second.endsWith("_en") ? "EN" : "CN"})</th>
          {tab.extra.map((c) => (
            <th key={c.field} className={colClass}>
              {c.label}
            </th>
          ))}
          <th className="px-5 py-3">Remark</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {tab.entries.map((e) => (
          <tr
            key={e.system_id}
            className="hover:bg-surface-2 transition cursor-pointer"
            onClick={() => open(e)}
          >
            <td
              className="px-5 py-3 font-bold text-text max-w-[180px] truncate whitespace-nowrap"
              title={e[lead] || undefined}
            >
              {e[lead] || "—"}
            </td>
            <td
              className="px-5 py-3 text-text-muted max-w-[180px] truncate whitespace-nowrap text-xs"
              title={e[second] || undefined}
            >
              {e[second] || "—"}
            </td>
            {tab.extra.map((c) => (
              <td key={c.field} className={cellClass}>
                {c.chip ? (
                  <span className="bg-surface-2 border border-border px-2 py-0.5 rounded text-[10px] font-bold">
                    {e[c.field] ?? "—"}
                  </span>
                ) : (
                  (e[c.field] ?? "—")
                )}
              </td>
            ))}
            <td className="px-5 py-3 text-text-muted text-xs max-w-[400px]">
              {e.remark}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function RemarksView({ results }) {
  const tabs = remarkTabs(results, useAuth());
  const [tab, setTab] = useState("anime");
  const active = tabs.find((t) => t.key === tab) || tabs[0];

  return (
    <>
      <ReviewTabBar
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.entries.length }))}
        active={active?.key}
        onSelect={setTab}
      />
      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
        {active && <RemarkTable tab={active} />}
      </div>
    </>
  );
}
