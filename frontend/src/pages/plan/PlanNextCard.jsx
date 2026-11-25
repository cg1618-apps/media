// Frontend: one planned thing on the Plan page.
//
// Franchise and series cards carry an explicit tier label, because the three
// scopes now sit side by side in the same bucket and would otherwise be
// indistinguishable.
//
// The name takes up to two lines, and every card reserves both, so the cards
// in a row line up whether a title wraps or not.
//
// A game or an h-game queued to play next also carries a platform picker
// under its title: the group it is filed under on the Do next tab
// (PLATFORM_GROUPS), or none. The game's detail page offers the same picker.
// It sits outside the card's link, so picking does not open the game.
import { Link } from "react-router-dom";
import { FALLBACK_SVG, entryCover, focusStyle, thumbUrl } from "../../lib/covers";
import { PLATFORM_GROUP_TYPES, SCOPE_LABELS } from "../../config/planNextGroups";
import LazyImage from "../../components/ui/LazyImage";
import PlatformGroupSelect from "../../components/plan/PlatformGroupSelect";

const PICKER_CLS =
  "w-full px-2 py-1 border-t border-border bg-surface text-xs text-text-muted focus:outline-none focus:ring-2 focus:ring-brand";

export default function PlanNextCard({ row }) {
  if (row.missing) {
    return (
      <div className="border border-danger bg-danger/10 p-3 text-sm text-danger">
        Missing {row.scope} &middot; {row.target_id}
      </div>
    );
  }

  const badge = SCOPE_LABELS[row.scope];
  // Entry-scope rows read their own cover_image_file and cover_image_focus.
  // Franchise/series rows have no such columns - usePlanData resolves their
  // cover ({ url, focus }) via getCoverForSlot / the series member-entry
  // fallback, since Franchise and Series only carry cover_entry_id /
  // type_covers.
  const cover = row.cover || entryCover(row);
  const body = (
    <>
      <div className="relative aspect-[3/4] bg-surface-2 overflow-hidden">
        <LazyImage
          src={thumbUrl(cover.url)}
          alt={row.display_name || ""}
          onError={(e) => {
            e.currentTarget.src = FALLBACK_SVG;
          }}
          className="w-full h-full object-cover"
          style={focusStyle(cover.focus)}
        />
        {badge && (
          <span className="absolute top-2 left-2 bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {badge}
          </span>
        )}
      </div>
      <p
        className="font-display text-sm text-text leading-tight line-clamp-2 min-h-[2.5em] box-content px-2 py-1.5 border-t border-border"
        title={row.display_name}
      >
        {row.display_name}
      </p>
    </>
  );

  const className =
    "group relative overflow-hidden bg-surface border border-border hover:border-border-strong transition-colors block";

  const card = row.nav_path ? (
    <Link to={`${row.nav_path}/${row.target_id}`} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
  if (!PLATFORM_GROUP_TYPES.includes(row.media_type) || row.kind !== "next") return card;
  return (
    <div className="flex flex-col border border-border [&>*:first-child]:border-0">
      {card}
      <PlatformGroupSelect row={row} className={PICKER_CLS} />
    </div>
  );
}
