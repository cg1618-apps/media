// Frontend: the statistics page for a viewer without a list.
//
// Counts of the catalogue only - entries per type, per anime season and per
// genre - from GET /api/statistics/catalogue, which counts over what the
// viewer's role and mode show, so a mode never learns what it hides. The
// counts are the server's because a viewer without a list should not
// download every list to count it.
//
// The personal sections - favourites, rating distribution, the seasonal
// overview, game spend - and the sidebar that indexes them are absent, not
// empty: a viewer with no list has nothing in them.
import { useQuery } from "@tanstack/react-query";
import { endpoints } from "../../api/endpoints";
import { fetchJson } from "../../hooks/queryUtils";
import { mediaTypeLabel, MEDIA_TYPE_LABELS } from "../../config/mediaRegistry";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import { Eyebrow, Slip } from "../../components/ui/primitives";
import StatsSectionHeader from "./StatsSectionHeader";

// The registry's order, so the table reads the way the Library tab does; a
// type the registry does not name goes last.
const TYPE_ORDER = Object.keys(MEDIA_TYPE_LABELS);

function typeRows(byType) {
  const rank = (t) => (TYPE_ORDER.includes(t) ? TYPE_ORDER.indexOf(t) : TYPE_ORDER.length);
  return Object.entries(byType || {}).sort(([a], [b]) => rank(a) - rank(b));
}

function CountTable({ label, rows, caption }) {
  if (rows.length === 0) {
    return <p className="text-text-faint text-sm py-6 text-center">Nothing to count yet.</p>;
  }
  return (
    <table className="w-full text-sm" aria-label={caption}>
      <thead>
        <tr className="border-b border-border">
          <th className="px-4 py-2 text-left font-mono text-[10px] font-normal text-text-faint uppercase tracking-[0.14em]">
            {label}
          </th>
          <th className="px-4 py-2 text-right font-mono text-[10px] font-normal text-text-faint uppercase tracking-[0.14em]">
            Entries
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map(([name, count]) => (
          <tr key={name}>
            <td className="px-4 py-2 text-text">{name}</td>
            <td className="px-4 py-2 text-right font-mono tabular-nums text-text">{count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function StatsCatalogue() {
  const query = useQuery({
    queryKey: ["statistics", "catalogue"],
    queryFn: () => fetchJson(endpoints.statistics.catalogue()),
  });

  if (query.isLoading) {
    return <MediaLoadingState isLoading loadingText="Loading statistics..." />;
  }
  if (query.error) {
    return <MediaLoadingState error={query.error.message} errorTitle="Error loading statistics." />;
  }

  const { by_type: byType, by_season: bySeason = [], by_genre: byGenre = [] } = query.data;
  const types = typeRows(byType);
  const total = types.reduce((sum, [, n]) => sum + n, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      <header>
        <Eyebrow className="mb-2">Archive</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-text leading-none mb-2">
          Statistics
        </h1>
        <p className="text-sm text-text-muted font-mono">{total} entries in the catalogue</p>
      </header>

      <section id="catalogue-types">
        <StatsSectionHeader eyebrow="Catalogue" title="Entries by type" />
        <Slip padded={false}>
          <CountTable
            label="Type"
            caption="Entries by type"
            rows={types.map(([t, n]) => [mediaTypeLabel(t), n])}
          />
        </Slip>
      </section>

      <section id="catalogue-seasons">
        <StatsSectionHeader eyebrow="Catalogue" title="Anime by season" />
        <Slip padded={false}>
          <CountTable
            label="Season"
            caption="Anime by season"
            rows={bySeason.map((row) => [row.season, row.entry_count])}
          />
        </Slip>
      </section>

      <section id="catalogue-genres">
        <StatsSectionHeader eyebrow="Catalogue" title="Entries by genre" />
        <Slip padded={false}>
          <CountTable
            label="Genre"
            caption="Entries by genre"
            rows={byGenre.map((row) => [row.genre, row.entry_count])}
          />
        </Slip>
      </section>
    </div>
  );
}
