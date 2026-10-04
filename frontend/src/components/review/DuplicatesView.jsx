// Frontend: the potential-duplicates review - one tab per kind of row, each a
// list of clusters (find_all_duplicates in app/services/domain/duplicates.py).
//
// Drawn by the Duplicates block of /review-queue and by the Control Center's
// Duplicates modal, so the two cannot drift apart.
//
// Three cluster shapes come back. A franchise, series or media-type cluster
// is a list of rows carrying system_id, the columns its grouping key was
// built from, and its names. A system-option cluster is a list of
// { id, category, option_value }. An entity cluster (person, studio,
// publisher) is ONE object, { kind, key, ids, names }.
//
// The gated types' tabs (h-comic, hentai, h-game) are drawn only for a
// session that may see the type (lib/gatedTypes.js).
import { useState } from "react";

import { useAuth } from "../../contexts/AuthContext";
import { visibleByType } from "../../lib/gatedTypes";
import { EmptyTab, ReviewTabBar } from "./ReviewBlock";

const shortId = (id) => (id ? `${String(id).slice(0, 8)}…` : "—");

const FRANCHISE = { label: "Franchise", field: "franchise_id", id: true };
const SERIES = { label: "Series", field: "series_id", id: true };
const MAIN = { label: "Main", field: "is_main" };
const SEASON = { label: "Season", field: "season_part" };

// `key` is the response key, `type` the media type a gated tab is checked
// against (none for the tiers, options and entities). `shared` lists the
// columns every member of a cluster agrees on, drawn once above it; `names`
// the per-member name columns.
export const DUPLICATE_TABS = [
  { key: "franchise", label: "Franchise",
    shared: [{ label: "Type", field: "franchise_type" }],
    names: [["CN", "franchise_name_cn"], ["EN", "franchise_name_en"]] },
  { key: "series", label: "Series", shared: [FRANCHISE],
    names: [["CN", "series_name_cn"], ["EN", "series_name_en"], ["Alt", "series_name_alt"]] },
  { key: "anime", type: "anime", label: "Anime",
    shared: [FRANCHISE, SERIES, { label: "Type", field: "airing_type" }, SEASON, MAIN,
      { label: "Special", field: "ep_special" }],
    names: [["CN", "anime_name_cn"], ["EN", "anime_name_en"]] },
  { key: "anime_movie", type: "anime-movie", label: "Anime Movie", shared: [FRANCHISE],
    names: [["CN", "anime_movie_name_cn"], ["EN", "anime_movie_name_en"]] },
  { key: "movie", type: "movie", label: "Movie", shared: [FRANCHISE, SERIES],
    names: [["CN", "movie_name_cn"], ["EN", "movie_name_en"], ["Alt", "movie_name_alt"]] },
  { key: "tv_show", type: "tv-show", label: "TV Show", shared: [FRANCHISE, SERIES, SEASON, MAIN],
    names: [["CN", "tv_name_cn"], ["EN", "tv_name_en"], ["Alt", "tv_name_alt"]] },
  { key: "cartoon", type: "cartoon", label: "Cartoon", shared: [FRANCHISE, SERIES, SEASON, MAIN],
    names: [["CN", "cartoon_name_cn"], ["EN", "cartoon_name_en"], ["Alt", "cartoon_name_alt"]] },
  { key: "manga", type: "manga", label: "Manga", shared: [FRANCHISE, SERIES, MAIN],
    names: [["CN", "manga_name_cn"], ["EN", "manga_name_en"], ["Alt", "manga_name_alt"]] },
  { key: "novel", type: "novel", label: "Novel", shared: [FRANCHISE, SERIES, MAIN],
    names: [["CN", "novel_name_cn"], ["EN", "novel_name_en"], ["Alt", "novel_name_alt"]] },
  { key: "comic", type: "comic", label: "Comic",
    shared: [FRANCHISE, SERIES, { label: "Main entry", field: "is_main_entry" }],
    names: [["EN", "comic_name_en"], ["CN", "comic_name_cn"], ["Alt", "comic_name_alt"],
      ["Comic Vine", "comicvine_id"]] },
  { key: "game", type: "game", label: "Game",
    shared: [FRANCHISE, SERIES, { label: "Type", field: "game_type" }, MAIN],
    names: [["CN", "game_name_cn"], ["EN", "game_name_en"], ["Alt", "game_name_alt"]] },
  { key: "h_comic", type: "h-comic", label: "H-Comic",
    shared: [FRANCHISE, SERIES, { label: "Region", field: "region" },
      { label: "No.", field: "series_number" }],
    names: [["CN", "h_comic_name_cn"], ["EN", "h_comic_name_en"], ["Alt", "h_comic_name_alt"]] },
  { key: "hentai", type: "hentai", label: "Hentai",
    shared: [FRANCHISE, SERIES, { label: "No.", field: "series_number" }],
    names: [["CN", "hentai_name_cn"], ["EN", "hentai_name_en"], ["Alt", "hentai_name_alt"]] },
  { key: "h_game", type: "h-game", label: "H-Game",
    shared: [FRANCHISE, SERIES, { label: "Type", field: "game_type" }, MAIN,
      { label: "No.", field: "series_number" }],
    names: [["CN", "h_game_name_cn"], ["EN", "h_game_name_en"], ["Alt", "h_game_name_alt"]] },
  { key: "system_options", label: "Sys. Options", shape: "options" },
  { key: "entities", label: "People & Companies", shape: "entities" },
];

/** The tabs this session may see, each with its clusters. */
export function duplicateTabs(results, auth) {
  return visibleByType(auth, DUPLICATE_TABS, (t) => t.type).map((t) => ({
    ...t,
    groups: results?.[t.key] || [],
  }));
}

export function countDuplicates(results, auth) {
  return duplicateTabs(results, auth).reduce((s, t) => s + t.groups.length, 0);
}

export function duplicateSummary(total) {
  return total === 0
    ? "No duplicates found across all categories."
    : `${total} duplicate group${total !== 1 ? "s" : ""} detected.`;
}

const card = "border border-border bg-surface rounded-xl p-4 mb-3";

function showValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return value ?? "—";
}

function RowCluster({ tab, group }) {
  const first = group[0] || {};
  return (
    <div className={card}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2">
        {tab.shared.map((c) =>
          first[c.field] == null ? null : (
            <span key={c.field} className="text-[10px] font-mono text-text-faint">
              {c.label}: {c.id ? shortId(first[c.field]) : showValue(first[c.field])}
            </span>
          ),
        )}
        <span className="text-xs text-text-faint">{group.length} entries</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-faint text-[10px] uppercase">
            <th className="text-left pb-1 pr-3">ID</th>
            {tab.names.map(([label]) => (
              <th key={label} className="text-left pb-1 pr-3">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {group.map((row) => (
            <tr key={row.system_id}>
              <td className="py-1 pr-3 font-mono text-[10px] text-text-faint">
                {shortId(row.system_id)}
              </td>
              {tab.names.map(([label, field], i) => (
                <td key={label} className={`py-1 pr-3 ${i === 0 ? "font-bold" : ""}`}>
                  {row[field] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionCluster({ group }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold bg-surface-2 text-text-muted px-2 py-0.5 rounded">
          {group[0]?.category}
        </span>
        <span className="text-xs text-text-faint">{group.length} entries</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {group.map((opt) => (
          <span
            key={opt.id}
            className="text-xs bg-surface border border-border px-2 py-0.5 rounded font-mono"
          >
            [{shortId(opt.id)}] {opt.option_value}
          </span>
        ))}
      </div>
    </div>
  );
}

function EntityCluster({ group }) {
  return (
    <div className={card}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-bold bg-surface-2 text-text-muted px-2 py-0.5 rounded uppercase">
          {group.kind}
        </span>
        <span className="text-xs text-text-faint">{group.ids.length} entries</span>
      </div>
      <ul className="divide-y divide-border text-xs">
        {group.ids.map((id, i) => (
          <li key={id} className="py-1 flex gap-3">
            <span className="font-mono text-[10px] text-text-faint">{shortId(id)}</span>
            <span className="font-bold">{group.names[i] || "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Cluster({ tab, group }) {
  if (tab.shape === "options") return <OptionCluster group={group} />;
  if (tab.shape === "entities") return <EntityCluster group={group} />;
  return <RowCluster tab={tab} group={group} />;
}

export default function DuplicatesView({ results }) {
  const tabs = duplicateTabs(results, useAuth());
  const [tab, setTab] = useState("franchise");
  const active = tabs.find((t) => t.key === tab) || tabs[0];

  return (
    <>
      <ReviewTabBar
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.groups.length }))}
        active={active?.key}
        onSelect={setTab}
      />
      <div className="p-5 overflow-y-auto max-h-[600px]">
        {!active || active.groups.length === 0 ? (
          <EmptyTab>No duplicates in this category</EmptyTab>
        ) : (
          active.groups.map((group, idx) => (
            <Cluster key={idx} tab={active} group={group} />
          ))
        )}
      </div>
    </>
  );
}
