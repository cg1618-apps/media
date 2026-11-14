// Frontend: the statistics page's catalogue sections.
//
// Counts of the catalogue - entries and franchises per type, anime per
// season, and the MAL and AniList score distributions - from
// GET /api/statistics/catalogue, which counts over what the viewer's role and
// mode show, so a mode never learns what it hides. Every holder of
// view.statistics sees them: a viewer with a list below its personal sections
// (StatsCatalogueSections), a shared account as the whole page (the default
// export).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../hooks/queryUtils";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Button, Eyebrow, Slip } from "../../components/ui/primitives";
import RatingDistributionCard from "./RatingDistributionCard";
import SeasonCountsModal from "./SeasonCountsModal";
import StatsSectionHeader from "./StatsSectionHeader";
import {
  SEASONS_SHOWN,
  scoreBuckets,
  scoredTypes,
  sortTypeRows,
} from "./catalogueStats";

const TH =
  "px-4 py-2 font-mono text-[10px] font-normal text-text-faint uppercase tracking-[0.14em]";
const TD_NUM = "px-4 py-2 text-right font-mono tabular-nums text-text";
const SELECT =
  "border border-border-strong bg-surface px-2 py-1 font-mono text-xs text-text focus:outline-none focus:ring-2 focus:ring-brand";

export function useCatalogueStatistics() {
  return useQuery({
    queryKey: ["statistics", "catalogue"],
    queryFn: () => fetchJson(endpoints.statistics.catalogue()),
  });
}

function Empty() {
  return <p className="text-text-faint text-sm px-4 py-6 text-center">Nothing to count yet.</p>;
}

function TypeTable({ rows }) {
  if (rows.length === 0) return <Empty />;
  return (
    <table className="text-sm" aria-label="Entries by type">
      <thead>
        <tr className="border-b border-border">
          <th className={`${TH} text-left`}>Type</th>
          <th className={`${TH} text-right`}>Franchises</th>
          <th className={`${TH} text-right`}>Entries</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.media_type}>
            <td className="px-4 py-2 text-text">{mediaTypeLabel(row.media_type)}</td>
            <td className={TD_NUM}>{row.franchise_count}</td>
            <td className={TD_NUM}>{row.entry_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SeasonTable({ seasons, onShowAll }) {
  if (seasons.length === 0) return <Empty />;
  const shown = seasons.slice(0, SEASONS_SHOWN);
  return (
    <>
      <table className="text-sm" aria-label="Anime by season">
        <thead>
          <tr className="border-b border-border">
            <th className={`${TH} text-left`}>Season</th>
            <th className={`${TH} text-right`}>Count</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {shown.map((row) => (
            <tr key={row.season}>
              <td className="px-4 py-2 font-mono text-text">{row.season}</td>
              <td className={TD_NUM}>{row.entry_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {seasons.length > SEASONS_SHOWN && (
        <div className="px-4 py-3 border-t border-border">
          <Button size="sm" onClick={onShowAll}>
            Show all {seasons.length}
          </Button>
        </div>
      )}
    </>
  );
}

// One score's chart, with the media-type selector that narrows it. "All"
// pools every type that carries the score.
function ScoreCard({ title, scaleKey, rows }) {
  const [mediaType, setMediaType] = useState("");
  const types = scoredTypes(rows);
  const { rows: buckets, total } = scoreBuckets(rows, scaleKey, mediaType || null);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 text-sm text-text-muted">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
          Type
        </span>
        <select
          className={SELECT}
          aria-label={`${title} media type`}
          value={mediaType}
          onChange={(e) => setMediaType(e.target.value)}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {mediaTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <RatingDistributionCard
        title={title}
        subtitle={`${total} scored`}
        rows={buckets}
        total={total}
      />
    </div>
  );
}

/** The three catalogue sections, without a page header. */
export function StatsCatalogueSections() {
  const query = useCatalogueStatistics();
  const [showAllSeasons, setShowAllSeasons] = useState(false);

  if (query.isLoading) {
    return <MediaLoadingState isLoading loadingText="Loading catalogue counts..." />;
  }
  if (query.error) {
    return (
      <MediaLoadingState error={query.error.message} errorTitle="Error loading catalogue counts." />
    );
  }

  const { by_type: byType, by_season: bySeason = [], scores = {} } = query.data;
  const types = sortTypeRows(byType);

  return (
    <>
      {/* The two tables are each as wide as their content, side by side when
          the screen has room for both and stacked when it does not. */}
      <div className="flex flex-wrap items-start gap-x-10 gap-y-12">
        <section id="catalogue-types" className="scroll-mt-24">
          <StatsSectionHeader eyebrow="Catalogue" title="Entries by type" />
          <Slip padded={false} className="inline-block">
            <TypeTable rows={types} />
          </Slip>
        </section>

        <section id="catalogue-seasons" className="scroll-mt-24">
          <StatsSectionHeader eyebrow="Catalogue" title="Anime by season" />
          <Slip padded={false} className="inline-block">
            <SeasonTable seasons={bySeason} onShowAll={() => setShowAllSeasons(true)} />
          </Slip>
        </section>
      </div>

      <section id="catalogue-ratings" className="scroll-mt-24">
        <StatsSectionHeader eyebrow="Catalogue" title="Rating distribution" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ScoreCard title="MAL rating" scaleKey="mal" rows={scores.mal} />
          <ScoreCard title="AniList score" scaleKey="anilist" rows={scores.anilist} />
        </div>
      </section>

      {showAllSeasons && (
        <SeasonCountsModal seasons={bySeason} onClose={() => setShowAllSeasons(false)} />
      )}
    </>
  );
}

/** The whole page for a viewer without a list: the catalogue sections alone. */
export default function StatsCatalogue() {
  const query = useCatalogueStatistics();
  const total = (query.data?.by_type || []).reduce((sum, row) => sum + row.entry_count, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <header>
        <Eyebrow className="mb-2">Archive</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
          Statistics
        </h1>
        {query.data && (
          <p className="text-sm text-text-muted font-mono">{total} entries in the catalogue</p>
        )}
      </header>
      <StatsCatalogueSections />
    </div>
  );
}
