// Frontend: one season's anime as the catalogue shows them, for a viewer
// without a list.
//
// No status split - a viewer with no list has no statuses to split by - so
// the season is one grid, best external score first. The cards are the
// library's own MediaCard, which draws no personal control without a list.
import MediaCard from "../cards/MediaCard";

// Best MAL score first; an unscored anime after every scored one, by name.
export function sortByExternalScore(items) {
  const score = (a) => (typeof a.mal_rating === "number" ? a.mal_rating : -1);
  return [...items].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""));
  });
}

export default function CatalogueSeasonGrid({ anime }) {
  if (anime.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border-strong">
        <p className="text-text-faint text-sm">No anime entries for this season.</p>
      </div>
    );
  }
  return (
    <div
      data-testid="catalogue-season-grid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
    >
      {sortByExternalScore(anime).map((item) => (
        <MediaCard key={item.system_id} type="anime" data={item} scoreField="mal_rating" />
      ))}
    </div>
  );
}
