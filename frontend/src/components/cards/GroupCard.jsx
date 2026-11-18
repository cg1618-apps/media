// Frontend: the card every grouping-tier library draws - collection,
// franchise and series. Each tier's own card names its kind and passes the
// row; anything only one tier shows (a collection's member count) comes in
// through `badge` and `children`.
import { Link } from "react-router-dom";
import { entityPath } from "../../lib/entityPath";
import { useViewScope } from "../../hooks/useViewScope";
import { focusStyle, thumbUrl } from "../../lib/covers";
import { FALLBACK_SVG, getDisplayName } from "../../utils/media";
import { EXPECTATION_FIELD } from "../../api/mutations/useMyRatingMutations";
import { Chip, RatingStamp } from "../ui/primitives";
import LazyImage from "../ui/LazyImage";

const SPINE = { collection: "Collection", franchise: "Franchise", series: "Series" };

// `cover` is the resolved { url, focus } from lib/covers.js.
export default function GroupCard({ kind, row, cover, badge = null, children = null }) {
  const name = getDisplayName(row, kind) || `Unknown ${SPINE[kind]}`;
  // The rating and expectation are the viewer's own: drawn only for a viewer
  // holding self.list (anyone else has none, and the server answers null).
  const { ownData: showPersonal } = useViewScope();
  const expectation = row[EXPECTATION_FIELD[kind]];

  // Empty when the row carries no public_id: there is no URL to link to, so
  // the card renders as plain markup rather than a link to nowhere.
  const path = entityPath(kind, row);
  const Wrapper = path ? Link : "div";
  const wrapperProps = path ? { to: path } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`bg-surface border border-border hover:border-border-strong transition-colors flex flex-col group${
        path ? " cursor-pointer" : ""
      }`}
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            {SPINE[kind]}
          </span>
        </div>
        <div
          className="relative flex-1 min-w-0 bg-surface-2 overflow-hidden"
          style={{ aspectRatio: "2/3" }}
        >
          <RatingStamp
            rating={showPersonal ? row.my_rating : null}
            size="sm"
            className="absolute top-1.5 right-1.5 z-10"
          />
          {badge}
          <LazyImage
            src={thumbUrl(cover?.url ?? FALLBACK_SVG)}
            alt="Cover"
            className="w-full h-full object-cover"
            style={focusStyle(cover?.focus)}
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>
      <div className="p-2.5 flex flex-col gap-1.5 flex-1 border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight"
          title={name}
        >
          {name}
        </h3>
        {children}
        {showPersonal && expectation && <Chip className="self-start">{expectation}</Chip>}
      </div>
    </Wrapper>
  );
}
