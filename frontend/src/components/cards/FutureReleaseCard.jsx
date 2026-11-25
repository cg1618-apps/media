// Frontend: the card for a title not released yet.
//
// The one card the Plan page's "Plan to do for future releases" section and
// the Future releases page both draw, so the two cannot drift. It fills
// MediaCard's "future" frame, which keeps the footer (the status select and
// the release bolt):
//
// - top left of the cover, the type: the airing type on anime, TV show and
//   cartoon, "Movie" on an anime movie, the type's own name on the rest
//   (futureTypeLabel);
// - top right, the viewer's own expectation of the entry's franchise, for a
//   holder of self.list only; Highest in the brand tone (expectationTone);
// - bottom left, the platform icons, linked;
// - under the title, what says when and what it is - the exact date on a
//   film, the date alone on a TV show, the type and date on a game, the
//   author and illustrator with the date on a manga or an h-comic, the type
//   and date on a book.
import { useViewScope } from "../../hooks/useViewScope";
import { mediaTypeLabel } from "../../config/mediaRegistry";
import { expectationTone } from "../../lib/groupSort";
import {
  earliestUpcomingReleaseDate,
  primaryReleaseValue,
} from "../../lib/releaseDate";
import { formatLength } from "../../utils/media";
import MediaCard, {
  MetaLine,
  OVERLAY_BRAND_CLS,
  OVERLAY_CLS,
  PLATFORM_BOX_CLS,
} from "./MediaCard";
import PlatformIcons from "./PlatformIcons";

// The types whose own airing type is the label: an ONA reads ONA, not Anime.
const AIRING_TYPE_LABELLED = new Set(["anime", "tv-show", "cartoon"]);

/** What the card's top-left badge reads for one entry. */
export function futureTypeLabel(type, data) {
  if (AIRING_TYPE_LABELLED.has(type) && data.airing_type) return data.airing_type;
  if (type === "anime-movie") return "Movie";
  return mediaTypeLabel(type);
}

const dateOrTbd = (value) => value || "TBD";

// The credited names, each once: a manga drawn by its own author names one.
function names(...values) {
  return [...new Set(values.filter((v) => v && String(v).trim()))].join(" / ");
}

const LINE_CLS = "font-mono text-[10px] text-text-faint truncate mt-0.5";

function Credits({ value }) {
  if (!value) return null;
  return (
    <p className={LINE_CLS} title={value}>
      {value}
    </p>
  );
}

function DateLine({ children }) {
  return <p className={`${LINE_CLS} tabular-nums`}>{children}</p>;
}

// A manga is upcoming by its next volume, so that is its date - per region,
// as the volume comes out in each - and its first release only when no
// volume is announced.
function mangaDate(data) {
  const next = [
    ["JP", data.next_vol_release_date_jp],
    ["TW", data.next_vol_release_date_tw],
  ].filter(([, value]) => value);
  if (next.length === 0) return dateOrTbd(data.release_date);
  return `Next vol. ${next.map(([region, value]) => `${region} ${value}`).join(" · ")}`;
}

// A book's own date that is still ahead, or its first release.
function bookDate(data) {
  return dateOrTbd(
    earliestUpcomingReleaseDate([data.release_date_jp, data.release_date_tw]) ||
      primaryReleaseValue("book", data),
  );
}

function FutureMeta({ type, data }) {
  if (type === "anime") return <Credits value={data.studio} />;
  if (type === "anime-movie" || type === "movie") {
    const length = formatLength(data.length_min);
    return (
      <MetaLine className="mt-1 mb-0">
        <span className="truncate tabular-nums">
          {dateOrTbd(primaryReleaseValue(type, data))}
        </span>
        {length && <span className="shrink-0">{length}</span>}
      </MetaLine>
    );
  }
  if (type === "game" || type === "h-game") {
    return (
      <MetaLine className="mt-1 mb-0">
        {data.game_type && <span className="shrink-0">{data.game_type}</span>}
        <span className="truncate tabular-nums">{dateOrTbd(data.release_date)}</span>
      </MetaLine>
    );
  }
  if (type === "manga") {
    return (
      <>
        <Credits value={names(data.author_plot, data.author_draw)} />
        <DateLine>{mangaDate(data)}</DateLine>
      </>
    );
  }
  if (type === "h-comic") {
    return (
      <>
        <Credits value={names(data.author, data.illustrator)} />
        <DateLine>{dateOrTbd(data.release_date)}</DateLine>
      </>
    );
  }
  if (type === "book") {
    return (
      <MetaLine className="mt-1 mb-0">
        {data.type && <span className="shrink-0">{data.type}</span>}
        <span className="truncate tabular-nums">{bookDate(data)}</span>
      </MetaLine>
    );
  }
  // TV show, cartoon, comic, hentai: the date alone - no region on a TV show.
  return <DateLine>{dateOrTbd(data.release_date)}</DateLine>;
}

function FutureBadges({ type, data, franchiseDict }) {
  // The expectation is the viewer's own (self.list); a viewer without a list
  // has none, and the server answers null for it anyway.
  const { ownData } = useViewScope();
  const expectation = ownData
    ? franchiseDict?.[data.franchise_id]?.franchise_expectation
    : null;
  return (
    <>
      <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>{futureTypeLabel(type, data)}</div>
      {expectation && (
        <div
          className={`absolute top-1 right-1 ${
            expectationTone(expectation) === "brand" ? OVERLAY_BRAND_CLS : OVERLAY_CLS
          }`}
          title="Expectation"
        >
          {expectation}
        </div>
      )}
      <PlatformIcons
        sources={data.sources}
        className={`absolute bottom-1 left-1 z-10 ${PLATFORM_BOX_CLS}`}
      />
    </>
  );
}

export default function FutureReleaseCard({
  type,
  data,
  franchiseDict = {},
  isAdmin,
  onUpdated,
}) {
  return (
    <MediaCard
      type={type}
      variant="future"
      data={data}
      isAdmin={isAdmin}
      onUpdated={onUpdated}
      coverBadges={<FutureBadges type={type} data={data} franchiseDict={franchiseDict} />}
      meta={<FutureMeta type={type} data={data} />}
    />
  );
}
