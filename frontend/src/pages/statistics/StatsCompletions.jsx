// Frontend: statistics page file for StatsCompletions.
//
// The Recent completions tabs. All mixes every type the viewer may see into
// one list; each type's own tab lists its completions in titled groups. What
// a tab lists and how it groups is completionGroups.js; this file draws it.
import { useState } from "react";
import { Link } from "react-router-dom";
import { getCoverUrl, getDisplayName, FALLBACK_SVG } from "../../utils/media";
import { useAuth } from "../../contexts/AuthContext";
import { visibleByType } from "../../lib/gatedTypes";
import { Button, Eyebrow, RatingStamp, sectionTitleCls } from "../../components/ui/primitives";
import LazyImage from "../../components/ui/LazyImage";
import { entityPath } from "../../lib/entityPath";
import { focusStyle, thumbUrl } from "../../lib/covers";
import { completionDetails, completionGroups, recentCompletions } from "./completionGroups";

const ALL = "all";

const COMPLETION_TABS = [
  { key: "anime", label: "Anime", prop: "allAnime" },
  { key: "anime-movie", label: "Anime movie", prop: "allAnimeMovies" },
  { key: "movie", label: "Movie", prop: "allMovies" },
  { key: "tv-show", label: "TV show", prop: "allTVShows" },
  { key: "cartoon", label: "Cartoon", prop: "allCartoons" },
  { key: "manga", label: "Manga", prop: "allManga" },
  { key: "book", label: "Book", prop: "allBook" },
  { key: "comic", label: "Comic", prop: "allComic" },
  { key: "game", label: "Game", prop: "allGame" },
  // Gated: offered, and mixed into All, through visibleByType only.
  { key: "h-comic", label: "H-Comic", prop: "allHComic" },
  { key: "h-game", label: "H-Game", prop: "allHGame" },
  { key: "hentai", label: "Hentai", prop: "allHentai" },
];

const TAB_LABEL = Object.fromEntries(COMPLETION_TABS.map(({ key, label }) => [key, label]));

// How many detail cells a type's rows carry (completionDetails). Every row of
// a list draws the same number of fixed-width cells, empty ones included, so
// the rating and the date line up down the list whatever a row holds.
const DETAIL_SLOTS = {
  anime: 1,
  "tv-show": 1,
  cartoon: 1,
  manga: 1,
  book: 1,
  game: 1,
  "h-comic": 2,
  "h-game": 1,
  hentai: 1,
};

const PAGE_SIZE = 10;

const mutedCls = "font-mono text-[11px] text-text-faint shrink-0 hidden sm:block";

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * One completed entry. `lead` is the cell at the left: the row's number in a
 * type's tab, the media type in All. The details, the rating and the date
 * each sit in a fixed-width cell, so a one-digit day or a missing rating
 * shifts nothing.
 */
function CompletionRow({ type, entry, lead, slots, franchiseMap, last }) {
  const franchise = franchiseMap[String(entry.franchise_id)];
  const name = getDisplayName(entry, type);
  const path = entityPath(type, entry);
  const Wrapper = path ? Link : "div";
  const details = completionDetails(type, entry);
  const cells = [...Array(Math.max(slots - details.length, 0)).fill(null), ...details];
  return (
    <Wrapper
      {...(path ? { to: path } : {})}
      className={`flex items-center gap-4 px-5 py-3 hover:bg-surface-2 transition-colors ${
        last ? "" : "border-b border-border"
      }`}
    >
      {lead}
      <div className="w-9 h-12 overflow-hidden bg-surface-2 border border-border shrink-0">
        <LazyImage
          src={thumbUrl(getCoverUrl(entry.cover_image_file))}
          alt={name}
          className="w-full h-full object-cover"
          style={focusStyle(entry.cover_image_focus)}
          onError={(e) => {
            e.target.src = FALLBACK_SVG;
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-display text-base leading-tight text-text truncate">{name}</p>
        {franchise && (
          <p className="font-mono text-[11px] text-text-faint truncate">
            {getDisplayName(franchise, "franchise")}
          </p>
        )}
      </div>
      {cells.map((cell, idx) => (
        <span
          key={idx}
          data-testid="completion-detail"
          className={`${mutedCls} w-24 text-right truncate tabular-nums`}
        >
          {cell}
        </span>
      ))}
      <span className="w-7 shrink-0 flex justify-center">
        <RatingStamp rating={entry.my_rating} />
      </span>
      <span
        data-testid="completion-date"
        className={`${mutedCls} w-[12ch] text-right tabular-nums`}
      >
        {formatDate(entry.completed_at)}
      </span>
    </Wrapper>
  );
}

/** A list's Previous / Next, drawn only when it runs past one page. */
function Pager({ page, totalPages, setPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between mt-3 px-1">
      <Button size="sm" onClick={() => setPage(page - 1)} disabled={page === 0}>
        Previous
      </Button>
      <span className="font-mono text-[11px] text-text-faint">
        Page {page + 1} of {totalPages}
      </span>
      <Button size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>
        Next
      </Button>
    </div>
  );
}

/** `items` ten a page; `pageKey` names the page this list is on in `pages`. */
function PagedList({ items, pageKey, pages, setPages, renderRow }) {
  const page = pages[pageKey] ?? 0;
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const setPage = (p) => setPages((prev) => ({ ...prev, [pageKey]: p }));
  return (
    <>
      <div className="bg-surface border border-border">
        {pageItems.map((item, idx) =>
          renderRow(item, page * PAGE_SIZE + idx, idx === pageItems.length - 1),
        )}
      </div>
      <Pager page={page} totalPages={totalPages} setPage={setPage} />
    </>
  );
}

/** One type's tab: its completions in titled groups, each paged on its own. */
function GroupedCompletions({ type, groups, pages, setPages, franchiseMap }) {
  return (
    <div className="space-y-8">
      {groups.map(({ key, label, items }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-3 pb-1 border-b border-border">
            <h3 className={sectionTitleCls}>{label}</h3>
            <span className="font-mono text-[11px] text-text-faint tabular-nums">
              {items.length}
            </span>
          </div>
          <PagedList
            items={items}
            pageKey={`${type}:${key}`}
            pages={pages}
            setPages={setPages}
            renderRow={(entry, index, last) => (
              <CompletionRow
                key={entry.system_id}
                type={type}
                entry={entry}
                slots={DETAIL_SLOTS[type] ?? 0}
                franchiseMap={franchiseMap}
                last={last}
                lead={
                  <span className="font-mono text-[10px] text-text-faint w-6 text-center shrink-0 tabular-nums">
                    {index + 1}
                  </span>
                }
              />
            )}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyCompletions({ label = null }) {
  return (
    <div className="border border-dashed border-border-strong px-4 py-10 text-center">
      <p className="text-sm text-text-muted">
        {label ? `No ${label} completions recorded yet.` : "No completions recorded yet."}
      </p>
    </div>
  );
}

export default function StatsCompletions({ franchiseMap, ...lists }) {
  const tabs = visibleByType(useAuth(), COMPLETION_TABS);
  const [completionsTab, setCompletionsTab] = useState(ALL);
  const [pages, setPages] = useState({});

  const tabBar = [{ key: ALL, label: "All" }, ...tabs];
  const listOf = (key) => lists[COMPLETION_TABS.find((tab) => tab.key === key).prop];

  let body;
  if (completionsTab === ALL) {
    const items = recentCompletions(tabs.map(({ key }) => ({ type: key, entries: listOf(key) })));
    const slots = Math.max(0, ...items.map(({ type }) => DETAIL_SLOTS[type] ?? 0));
    body =
      items.length === 0 ? (
        <EmptyCompletions />
      ) : (
        <PagedList
          items={items}
          pageKey={ALL}
          pages={pages}
          setPages={setPages}
          renderRow={({ type, entry }, index, last) => (
            <CompletionRow
              key={`${type}:${entry.system_id}`}
              type={type}
              entry={entry}
              slots={slots}
              franchiseMap={franchiseMap}
              last={last}
              lead={
                <span className="font-mono text-[10px] text-text-faint w-20 shrink-0 truncate">
                  {TAB_LABEL[type]}
                </span>
              }
            />
          )}
        />
      );
  } else {
    const groups = completionGroups(completionsTab, listOf(completionsTab), franchiseMap);
    body =
      groups.length === 0 ? (
        <EmptyCompletions label={TAB_LABEL[completionsTab].toLowerCase()} />
      ) : (
        <GroupedCompletions
          type={completionsTab}
          groups={groups}
          pages={pages}
          setPages={setPages}
          franchiseMap={franchiseMap}
        />
      );
  }

  return (
    <section>
      <header className="mb-6">
        <Eyebrow>Statistics</Eyebrow>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold text-text leading-none mt-1">
          Recent completions
        </h1>
      </header>

      <div className="flex flex-wrap gap-1.5 mb-6">
        {tabBar.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCompletionsTab(tab.key)}
            className={`px-3 py-1.5 text-xs font-medium border transition whitespace-nowrap ${
              completionsTab === tab.key
                ? "bg-brand border-brand text-on-brand"
                : "border-border-strong text-text-muted hover:border-text hover:text-text bg-surface"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {body}
    </section>
  );
}
