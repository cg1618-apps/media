// Frontend: the Plan page's "Plan to do for future releases" section.
//
// Two filters over the five watching types: "Do when released" holds what
// the viewer is waiting on in either spelling - Watch When Airs on the airing
// types, Watch When Released on the two films - and "Plan to do" holds
// planned entries that are not out yet. Each is grouped by release year, TBD
// last.
//
// The grouping is a hook (usePlanFuture) the Plan page calls rather than state
// held here, because the page's table of contents lists one row per year
// group and has to see the same groups this section draws. Every card is
// FutureReleaseCard, the one the Future releases page draws too.
import { useMemo, useState } from "react";
import { releaseYear } from "../../lib/releaseDate";
import { useAuth } from "../../contexts/AuthContext";
import { useApiQuery } from "../../hooks/useApiQuery";
import FutureReleaseCard from "../../components/cards/FutureReleaseCard";
import { Eyebrow } from "../../components/ui/primitives";
import { WAIT_FOR_RELEASE_STATUSES } from "../../config/fieldOptions";

export const FUTURE_TABS = [
  { key: "waiting", label: "Do when released", statuses: WAIT_FOR_RELEASE_STATUSES },
  { key: "planned", label: "Plan to do", statuses: ["Plan to Watch"] },
];

const TYPE_ORDER = ["anime", "anime_movie", "movie", "tv_show", "cartoon"];
const TYPE_MAP = {
  anime: "anime",
  anime_movie: "anime-movie",
  movie: "movie",
  tv_show: "tv-show",
  cartoon: "cartoon",
};
const SEASON_ORDER = { WIN: 0, SPR: 1, SUM: 2, FAL: 3 };

/** The anchor of one year group, as the page's table of contents names it. */
export function futureYearAnchor(year) {
  return `plan-future-${year}`;
}

function seasonRawToKey(raw) {
  if (!raw || raw === "Not Set") return null;
  const parts = raw.trim().split(" ");
  if (parts.length !== 2) return null;
  const [code, year] = parts;
  const idx = SEASON_ORDER[code];
  if (idx === undefined) return null;
  return `S_${year}_${idx}`;
}

function getAnimeSeasonKey(anime) {
  // The season names the JP broadcast, so only the JP year pairs with it.
  const jpYear = releaseYear(anime.release_date_jp) || null;
  const season = anime.release_season;
  if (jpYear && season && SEASON_ORDER[season] !== undefined)
    return `S_${jpYear}_${SEASON_ORDER[season]}`;
  const year = jpYear || releaseYear(anime.release_date_tw) || null;
  if (year) return `Y_${year}`;
  return "Z_TBD";
}

// A film is not out yet while Not Released; the airing types while Not Yet
// Aired.
function isNotOutYet(entry) {
  if (entry._type === "movie" || entry._type === "anime_movie") {
    return entry.release_status === "Not Released";
  }
  return entry.airing_status === "Not Yet Aired";
}

function isFutureRelease(entry, currentSeasonKey) {
  if (!isNotOutYet(entry)) return false;
  if (entry._type === "anime" && currentSeasonKey) {
    const key = getAnimeSeasonKey(entry);
    if (key.startsWith("S_") && key < currentSeasonKey) return false;
  }
  return true;
}

function getEntryYear(entry) {
  if (entry._type === "anime") {
    const year = releaseYear(entry.release_date_jp || entry.release_date_tw);
    return year ? String(year) : "TBD";
  }
  if (entry._type === "anime_movie") {
    const d = entry.release_date_jp || entry.release_date_tw;
    if (!d) return "TBD";
    const y = String(d).substring(0, 4);
    return /^\d{4}$/.test(y) ? y : "TBD";
  }
  if (entry._type === "movie") {
    const d = entry.release_date_usa || entry.release_date_tw;
    if (!d) return "TBD";
    const parts = String(d).split(/[\s-]/);
    const yearPart = parts.find((p) => /^\d{4}$/.test(p));
    return yearPart || "TBD";
  }
  if (entry._type === "tv_show" || entry._type === "cartoon") {
    const d = entry.release_date;
    if (!d) return "TBD";
    const y = String(d).substring(0, 4);
    return /^\d{4}$/.test(y) ? y : "TBD";
  }
  return "TBD";
}

function getEntryName(entry) {
  if (entry._type === "anime")
    return entry.anime_name_en || entry.anime_name_cn || "";
  if (entry._type === "anime_movie")
    return entry.anime_movie_name_en || entry.anime_movie_name_cn || "";
  if (entry._type === "movie")
    return entry.movie_name_en || entry.movie_name_cn || "";
  if (entry._type === "tv_show")
    return entry.tv_name_en || entry.tv_name_cn || "";
  if (entry._type === "cartoon")
    return entry.cartoon_name_en || entry.cartoon_name_cn || "";
  return "";
}

/**
 * The section's filter and its year groups: `{ activeTab, setActiveTab, tab,
 * grouped }`, `grouped` being `[{ year, entries }]` in year order, TBD last.
 */
export function usePlanFuture({ allAnime, allAnimeMovies, allMovies, allTVShows, allCartoons }) {
  const [activeTab, setActiveTab] = useState("waiting");
  const tab = FUTURE_TABS.find((t) => t.key === activeTab);
  // The open read every catalogue reader may ask, as the Future releases page
  // reads it - not the Control Center's manage.pipelines route, which a
  // member would be refused.
  const seasonQuery = useApiQuery(
    ["api", "seasonal", "current-season"],
    "/api/seasonal/current-season",
  );
  const currentSeasonKey = seasonRawToKey(seasonQuery.data?.current_season || "");

  const combined = useMemo(
    () => [
      ...allAnime.map((e) => ({ ...e, _type: "anime" })),
      ...allAnimeMovies.map((e) => ({ ...e, _type: "anime_movie" })),
      ...allMovies.map((e) => ({ ...e, _type: "movie" })),
      ...allTVShows.map((e) => ({ ...e, _type: "tv_show" })),
      ...allCartoons.map((e) => ({ ...e, _type: "cartoon" })),
    ],
    [allAnime, allAnimeMovies, allMovies, allTVShows, allCartoons],
  );

  const grouped = useMemo(() => {
    const filtered = combined.filter((e) => {
      if (!tab.statuses.includes(e.watching_status)) return false;
      if (activeTab === "planned") return isFutureRelease(e, currentSeasonKey);
      return true;
    });
    const groups = {};
    filtered.forEach((entry) => {
      const year = getEntryYear(entry);
      if (!groups[year]) groups[year] = [];
      groups[year].push(entry);
    });
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => {
        const diff = TYPE_ORDER.indexOf(a._type) - TYPE_ORDER.indexOf(b._type);
        if (diff !== 0) return diff;
        return getEntryName(a).localeCompare(getEntryName(b));
      });
    });
    const sortedYears = Object.keys(groups).sort((a, b) => {
      if (a === "TBD") return 1;
      if (b === "TBD") return -1;
      return Number(a) - Number(b);
    });
    return sortedYears.map((year) => ({ year, entries: groups[year] }));
  }, [combined, activeTab, tab, currentSeasonKey]);

  return { activeTab, setActiveTab, tab, grouped };
}

export default function PlanToWatchFuture({ id, future, franchiseMap, onUpdated }) {
  const { isAdmin } = useAuth();
  const { activeTab, setActiveTab, tab, grouped } = future;
  const totalCount = grouped.reduce((sum, g) => sum + g.entries.length, 0);

  return (
    <section id={id}>
      <h2 className="font-display text-3xl font-semibold text-text leading-none mb-4 pb-3 border-b border-border">
        Plan to do for future releases
      </h2>

      {/* Filter */}
      <div className="flex flex-wrap gap-1.5 mb-6">
        {FUTURE_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-1 text-xs font-medium border transition-colors whitespace-nowrap ${
              activeTab === t.key
                ? "bg-brand text-on-brand border-brand"
                : "bg-surface border-border-strong text-text-muted hover:border-text hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {totalCount === 0 ? (
        <div className="text-center py-12 border border-dashed border-border-strong">
          <Eyebrow className="mb-1">Empty</Eyebrow>
          <p className="text-text-muted text-sm">Nothing in &ldquo;{tab.label}&rdquo; yet.</p>
          <p className="text-text-faint text-xs mt-1">
            Set watching status on an entry to see it here.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ year, entries }) => (
            <div key={year} id={futureYearAnchor(year)}>
              <div className="flex items-baseline gap-3 mb-3 pb-1 border-b border-border">
                <span className="font-display text-xl text-text leading-none tabular-nums">
                  {year}
                </span>
                <span className="font-mono text-[11px] text-text-faint tabular-nums">
                  {entries.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {entries.map((entry) => (
                  <FutureReleaseCard
                    key={entry.system_id}
                    type={TYPE_MAP[entry._type]}
                    data={entry}
                    franchiseDict={franchiseMap}
                    isAdmin={isAdmin}
                    onUpdated={onUpdated}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
