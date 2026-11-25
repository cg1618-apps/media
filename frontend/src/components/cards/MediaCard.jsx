// Frontend: card component file for MediaCard.
//
// An archive card: the cover across the full width with the rating stamp
// top-right, then the title in the display face and one mono line of
// metadata. No grid card names its type in a spine; the page it sits on does. Flat, no hover zoom - the border darkens.
//
// Three variants. `library` is the library's card, with the tracker (progress
// and the status button) along its foot; `credit` is the library card
// without the tracker, drawn for each entry a studio or publisher is credited
// on (components/info/CompanyCredits.jsx). A credit card reads the credit
// payload (app/services/domain/credit_cards.py): `display_name` is its title
// and `release_date` is already the type's primary release value. `future`
// is the frame FutureReleaseCard fills: what sits on its cover and under its
// title comes in as `coverBadges` and `meta`, so the future-release content
// lives in that one component. The frame keeps the footer - the status
// select and the release bolt.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useViewScope } from "../../hooks/useViewScope";
import { useToast } from "../../hooks/useToast";
import { useStatusToggle } from "../../hooks/useStatusToggle";
import MarkAiringModal from "../modals/MarkAiringModal";
import { entityPath } from "../../lib/entityPath";
import {
  formatReleaseDate,
  primaryReleaseValue,
  releaseYear,
} from "../../lib/releaseDate";
import { effectiveProgressDisplay } from "../../lib/bookUnits";
import { progressFor } from "../../lib/hComicRegion";
import {
  getDisplayName,
  getCoverUrl,
  FALLBACK_SVG,
  getCardStatusConfig,
  getReleaseFallback,
  formatLength,
  MEDIA_CONFIG,
  getBookProgress,
} from "../../utils/media";
import { statusToggleFields } from "../../lib/status";
import { focusStyle, thumbUrl } from "../../lib/covers";
import { isFilmType, WAIT_FOR_RELEASE_STATUSES } from "../../config/fieldOptions";
import { Chip, RatingStamp, eyebrowCls } from "../ui/primitives";
import PlatformIcons from "./PlatformIcons";
import LazyImage from "../ui/LazyImage";
import { formatProgress, parseProgressTotal } from "../../lib/progressStep";
import { progressEstimate } from "../../lib/gameHours";

// The statuses the future variant's select offers, per status axis. A game
// is on the play axis, so it must not be offered the watch vocabulary, and a
// film waits with Watch When Released where the airing types wait with Watch
// When Airs.
const FUTURE_STATUS_OPTIONS = {
  watch: ["Might Watch", "Plan to Watch", "Watch When Airs"],
  film: ["Might Watch", "Plan to Watch", "Watch When Released"],
  play: ["Might Play", "Plan to Play", "Play When Released"],
};

// What the bolt does on the future variant: the column that says a title is
// still unreleased, and the value that says it is out. A game and a film
// carry release_status where the airing types carry airing_status.
const BOLT_RELEASE = {
  anime: { field: "airing_status", value: "Airing" },
  "anime-movie": { field: "release_status", value: "Released" },
  movie: { field: "release_status", value: "Released" },
  "tv-show": { field: "airing_status", value: "Airing" },
  cartoon: { field: "airing_status", value: "Airing" },
  game: { field: "release_status", value: "Released" },
};

// Small ink label laid over cover art.
export const OVERLAY_CLS =
  "bg-black/60 text-white px-1.5 py-0.5 font-mono text-[9px] leading-none z-10";
// The same label in the brand fill: a Highest expectation, and only that,
// stands out from the rest (lib/groupSort.js, expectationTone).
export const OVERLAY_BRAND_CLS =
  "bg-brand text-on-brand px-1.5 py-0.5 font-mono text-[9px] leading-none z-10";

// Score figure on a mono meta line (MAL / AniList / IMDb).
function Score({ value, label = "Score" }) {
  return (
    <span className="shrink-0 text-text-muted tabular-nums" title={label}>
      {value}
    </span>
  );
}

// Which outside score a card shows, and what to call it. The four AniList
// types read `scoreField` from the active sort (see LibraryLayout) so that a
// library sorted by an AniList figure does not show a MAL one on the card;
// every other type only ever has the one score, and takes the default.
//
// AniList's is an integer on its own 0-100 scale - 85 where MAL says 8.5 -
// so the tooltip has to name which of the two the numeral is.
const SCORE_LABEL = {
  mal_rating: "MAL score",
  anilist_rating: "AniList score",
  imdb_rating: "IMDb score",
  metacritic_score: "Metacritic score",
};

function imdbValue(value) {
  return value && value !== "N/A" ? value : null;
}

// A TV show's or cartoon's IMDb figure. The show's own rating leads and the
// season's - the average of its episodes' ratings - follows in brackets:
// "9.5 (avg 9.4)". With no show rating (a cartoon movie, or a show OMDb has
// no figure for) the entry's own rating stands alone, as on a movie card.
function ImdbShowScore({ data }) {
  const show = imdbValue(data.imdb_series_rating);
  const season = imdbValue(data.imdb_rating);
  if (show && season) {
    return <Score value={`${show} (avg ${season})`} label="IMDb rating (avg: this season's)" />;
  }
  if (show) return <Score value={show} label="IMDb rating" />;
  if (season) return <Score value={season} label={SCORE_LABEL.imdb_rating} />;
  return null;
}

export function MetaLine({ children, className = "" }) {
  return (
    <div
      className={`font-mono text-[10px] text-text-faint mb-3 flex items-center justify-between gap-1 ${className}`}
    >
      {children}
    </div>
  );
}

// The tile the platform icons sit on over cover art.
export const PLATFORM_BOX_CLS = "bg-surface/95 px-1 py-0.5 border border-border";

// What a credit card says, per type: `release` is the release line - the
// anime's season line, a full date, or the year alone - and `score` the
// public rating at its right. The gated types read as their counterparts
// (Hentai as Anime, H-Comic as Manga, H-Game as Game), with what they carry:
// a hentai has no season, so it reads its date. A type not listed draws the
// library card's meta line instead.
const CREDIT_META = {
  anime: { release: "season", score: "mal_rating" },
  hentai: { release: "date", score: "mal_rating" },
  "anime-movie": { release: "date", score: "mal_rating" },
  manga: { release: "date", score: "mal_rating" },
  "h-comic": { release: "date", score: "mal_rating" },
  book: { release: "date", score: "mal_rating" },
  comic: { release: "year" },
  game: { release: "year", score: "metacritic_score" },
  "h-game": { release: "year", score: "metacritic_score" },
};

// The label a credit card lays over its cover's top-left corner: an anime's
// airing type, an anime movie's release type (Cinema, ONA).
const CREDIT_CORNER = {
  anime: "airing_type",
  hentai: "airing_type",
  "anime-movie": "release_type",
};

function CreditMeta({ type, data }) {
  const { release, score } = CREDIT_META[type];
  const line =
    release === "season"
      ? getReleaseFallback(data)
      : release === "year"
        ? releaseYear(data.release_date) || "?"
        : formatReleaseDate(data.release_date);
  const value = score ? data[score] : null;
  return (
    <MetaLine className="mb-0">
      <span className="truncate pr-1">{line}</span>
      {value != null && value !== "" && <Score value={value} label={SCORE_LABEL[score]} />}
    </MetaLine>
  );
}

// The rating stamp is the viewer's own list rating, which a viewer without a
// list does not have.
function PosterBadges({ type, variant, data }) {
  if (variant === "credit" && CREDIT_META[type]) {
    const corner = CREDIT_CORNER[type] ? data[CREDIT_CORNER[type]] : null;
    return (
      <>
        <RatingStamp
          rating={data.my_rating}
          size="sm"
          className="absolute top-1.5 right-1.5 z-10"
        />
        {corner && <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>{corner}</div>}
      </>
    );
  }

  // Every card but the future one: the outside score sits on the meta line,
  // not the cover, and the TV show's region and the game's, book's and
  // comic's type take the cover's top-left corner, opposite the rating stamp.
  // One look on the libraries, on a franchise's entries and on a credit card
  // of a type CREDIT_META does not list.
  return (
    <>
      <RatingStamp
        rating={data.my_rating}
        size="sm"
        className="absolute top-1.5 right-1.5 z-10"
      />
      {(type === "anime" || type === "cartoon") && data.airing_type && (
        <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>
          {data.airing_type}
        </div>
      )}
      {type === "tv-show" && data.region && (
        <div
          className={`absolute top-1 left-1 ${OVERLAY_CLS}`}
        >
          {data.region}
        </div>
      )}
      {(type === "game" || type === "h-game") && data.game_type && (
        <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>
          {data.game_type}
        </div>
      )}
      {type === "book" && data.type && (
        <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>{data.type}</div>
      )}
      {type === "comic" && data.comic_type && (
        <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>{data.comic_type}</div>
      )}
      {/* A comic card is its cover, type, rating, name, year and tracker
          only - no platform icons. */}
      {type !== "comic" && (
        <PlatformIcons
          sources={data.sources}
          linked={false}
          className={`absolute bottom-1 left-1 z-10 ${PLATFORM_BOX_CLS}`}
        />
      )}
    </>
  );
}

// `released` is the start of the run: release_date on most types, the JP
// date (then the TW one) on a book.
function yearRange(data, released = data.release_date) {
  const start = releaseYear(released) || "?";
  const end = releaseYear(data.end_date);
  return end && end !== releaseYear(released) ? `${start} – ${end}` : start;
}

function LibraryMeta({ type, data, scoreField }) {
  if (type === "anime") {
    return (
      <MetaLine>
        <span className="truncate pr-1">{getReleaseFallback(data)}</span>
        <Score value={data[scoreField] || "—"} label={SCORE_LABEL[scoreField]} />
      </MetaLine>
    );
  }

  if (type === "cartoon") {
    return (
      <MetaLine>
        <span className="truncate pr-1">{data.release_date || "TBD"}</span>
        <ImdbShowScore data={data} />
      </MetaLine>
    );
  }

  if (type === "h-comic") {
    return (
      <MetaLine className="mb-1">
        <span className="truncate pr-1">{yearRange(data)}</span>
        {data.serialization_status && (
          <span className="shrink-0">{data.serialization_status}</span>
        )}
      </MetaLine>
    );
  }

  // When it came out and whether it has aired; the episode count is the
  // progress line's.
  if (type === "hentai") {
    return (
      <MetaLine className="mb-1">
        <span className="truncate pr-1">{releaseYear(data.release_date) || "?"}</span>
        {data.airing_status && (
          <span className="shrink-0 truncate">{data.airing_status}</span>
        )}
      </MetaLine>
    );
  }

  if (type === "manga") {
    return (
      <MetaLine className="mb-1">
        <span className="truncate pr-1">{yearRange(data)}</span>
        {data[scoreField] && (
          <Score value={data[scoreField]} label={SCORE_LABEL[scoreField]} />
        )}
      </MetaLine>
    );
  }

  // The type sits on the cover (PosterBadges); the serialization status is
  // not on the card.
  if (type === "book") {
    return (
      <div className="mb-1 flex items-end justify-between gap-1">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {data.version && (
            <div className="flex items-center gap-1 flex-wrap">
              <Chip tone="muted">{data.version}</Chip>
            </div>
          )}
          <span className="font-mono text-[10px] text-text-faint truncate">
            {yearRange(data, data.release_date_jp || data.release_date_tw)}
          </span>
        </div>
        {data[scoreField] && (
          <span
            className="font-mono text-[10px] text-text-muted tabular-nums shrink-0"
            title={SCORE_LABEL[scoreField]}
          >
            {data[scoreField]}
          </span>
        )}
      </div>
    );
  }

  // The release year alone, at the line's left edge; the type is on the
  // cover (PosterBadges) and the title is the EN name.
  if (type === "comic") {
    return (
      <MetaLine className="mb-1">
        <span className="truncate pr-1">{releaseYear(data.release_date) || "?"}</span>
      </MetaLine>
    );
  }

  return null;
}

// A card's meta line for the types laid out apart from the rest - the films,
// the TV show and the games; every other type reads LibraryMeta.
function CardMeta({ type, data, scoreField }) {
  // The films: the release date with the score beside it, as on an anime
  // card, and the runtime under the date. The date is the type's own first
  // pick - JP for an anime movie, TW for a movie.
  if (type === "anime-movie" || type === "movie") {
    const field = type === "movie" ? "imdb_rating" : scoreField;
    const score = data[field] && data[field] !== "N/A" ? data[field] : "—";
    const length = formatLength(data.length_min);
    return (
      <div className="mb-3">
        <MetaLine className="mb-1">
          <span className="truncate pr-1">
            {formatReleaseDate(primaryReleaseValue(type, data))}
          </span>
          <Score value={score} label={SCORE_LABEL[field]} />
        </MetaLine>
        {length && (
          <div className={eyebrowCls}>
            {length}
          </div>
        )}
      </div>
    );
  }

  if (type === "tv-show") {
    return (
      <MetaLine>
        <span className="truncate pr-1">{data.release_date || "TBD"}</span>
        <ImdbShowScore data={data} />
      </MetaLine>
    );
  }

  // The release date above the play hours (the progress row), and the two
  // Metacritic figures stacked at the right: critics over users. An h-game
  // carries neither figure.
  if (type === "game" || type === "h-game") {
    const critic = data.metacritic_score;
    const user = data.metacritic_user_score;
    return (
      <MetaLine className="items-start">
        <span className="truncate pr-1">{formatReleaseDate(data.release_date)}</span>
        {(critic != null || user != null) && (
          <span className="flex flex-col items-end gap-0.5 shrink-0">
            {critic != null && <Score value={critic} label="Metacritic score" />}
            {user != null && (
              <Score value={Number(user).toFixed(1)} label="Metacritic user score" />
            )}
          </span>
        )}
      </MetaLine>
    );
  }

  return <LibraryMeta type={type} data={data} scoreField={scoreField} />;
}

const COUNT_CLS = "font-mono text-[11px] text-text-muted tabular-nums";
const UNIT_CLS = "text-[9px] text-text-faint ml-1";

function Count({ fin, total, unit }) {
  return (
    <div className={COUNT_CLS}>
      {formatProgress(fin)} <span className="text-text-faint">/</span>{" "}
      {formatProgress(total)}
      <span className={UNIT_CLS}>{unit}</span>
    </div>
  );
}

function ProgressDisplay({ type, data, showVol, onToggleVol }) {
  if (type === "anime") {
    const localFin = data.ep_fin || 0;
    const localTotal = parseProgressTotal(data.ep_total) ?? "?";
    return <Count fin={localFin} total={localTotal} unit="ep" />;
  }

  if (type === "tv-show" || type === "cartoon" || type === "hentai") {
    const epFin = data.ep_fin ?? 0;
    const epTotal = parseProgressTotal(data.ep_total) ?? "?";
    return <Count fin={epFin} total={epTotal} unit="ep" />;
  }

  if (type === "manga") {
    const chFin = data.ch_fin ?? 0;
    const chTotal = data.ch_total != null ? data.ch_total : "?";
    const volFin = data.vol_fin ?? 0;
    const volTotal = data.vol_total != null ? data.vol_total : "?";
    const volFinPage = data.vol_fin_page ?? 0;
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleVol}
          className="font-mono text-[9px] text-text-faint hover:text-brand border border-border-strong px-1 py-0.5 transition-colors shrink-0"
          title="Toggle Ch/Vol"
        >
          {showVol ? "Ch" : "Vol"}
        </button>
        {showVol ? (
          <div className={COUNT_CLS}>
            {formatProgress(volFin)}
            {volFinPage > 0 && (
              <span className="text-[9px] text-text-faint ml-0.5">
                p{volFinPage}
              </span>
            )}{" "}
            <span className="text-text-faint">/</span> {formatProgress(volTotal)}
            <span className={UNIT_CLS}>vol</span>
          </div>
        ) : (
          <Count fin={chFin} total={chTotal} unit="ch" />
        )}
      </div>
    );
  }

  if (type === "book") {
    const pd = effectiveProgressDisplay(data);
    if (pd === "vol_tw") {
      return (
        <Count
          fin={data.vol_fin ?? 0}
          total={data.vol_total_tw != null ? data.vol_total_tw : "?"}
          unit="vol tw"
        />
      );
    }
    if (pd === "arc_ch") {
      return (
        <span className="font-mono text-[10px] text-text-muted tabular-nums">
          {getBookProgress(data)}
        </span>
      );
    }
    if (pd === "ch") {
      return (
        <Count
          fin={data.ch_fin ?? 0}
          total={data.ch_total != null ? data.ch_total : "?"}
          unit="ch"
        />
      );
    }
    return (
      <Count
        fin={data.vol_fin ?? 0}
        total={data.vol_total_original != null ? data.vol_total_original : "?"}
        unit="vol"
      />
    );
  }

  if (type === "comic") {
    const issFin = data.issue_fin ?? 0;
    const issTotal = data.issue_total != null ? data.issue_total : "?";
    return <Count fin={issFin} total={issTotal} unit="iss" />;
  }

  // Pages on a JP h-comic, chapters on a KR one (lib/hComicRegion.js).
  if (type === "h-comic") {
    const progress = progressFor(data);
    if (!progress) return null;
    return (
      <Count
        fin={progress.fin}
        total={progress.total ?? "?"}
        unit={progress.unit}
      />
    );
  }

  // A game has no episode/chapter counter - playtime against the Main + Extra
  // estimate (progressEstimate) is its progress. With neither figure there is
  // nothing to show.
  if (type === "game") {
    const estimate = progressEstimate(data);
    if (data.hours_played == null && estimate == null) return null;
    return (
      <Count
        fin={data.hours_played ?? 0}
        total={estimate ?? "?"}
        unit="h"
      />
    );
  }

  // An h-game records no playtime, so achievements are its progress - shown
  // only against a total, since "12 earned" alone measures nothing.
  if (type === "h-game") {
    const total = Number(data.achievements_total);
    if (!Number.isFinite(total) || total <= 0) return null;
    return <Count fin={data.achievements_earned ?? 0} total={total} unit="ach" />;
  }

  return null;
}

// Types whose bolt action also offers to move the watching status along.
const BOLT_PROMPTS_WATCHING = new Set(["anime", "tv-show", "cartoon"]);

const HAS_PROGRESS = new Set([
  "anime",
  "tv-show",
  "cartoon",
  "manga",
  "book",
  "comic",
  "game",
  "h-comic",
  "hentai",
  "h-game",
]);
// The status a card shows when the entry has none yet, per status axis.
const FALLBACK_STATUS = {
  watch: "Might Watch",
  read: "Might Read",
  play: "Might Play",
};

export default function MediaCard({
  type,
  variant = "library",
  data,
  isAdmin: isAdminProp,
  onUpdated,
  scoreField = "mal_rating",
  coverBadges = null,
  meta = null,
}) {
  // Two different questions. The status controls write the viewer's own list
  // (/api/me), so they ask for a list (ownData, self.list). The bolt also
  // marks the work released, a catalogue edit, so it asks manage.catalog
  // (isAdmin); a caller may pass that in.
  const { isAdmin: authAdmin } = useAuth();
  const canEditCatalogue = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { ownData } = useViewScope();
  const { showToast } = useToast();
  const [showVol, setShowVol] = useState(false);
  const [showAiringPrompt, setShowAiringPrompt] = useState(false);
  // The status writes pass `data` as the entry the result is folded into: a
  // group page holds its rows in page state rather than the media-list cache,
  // and replaces the row with what onUpdated gets.
  const statusMutation = useStatusToggle(type);

  const config = MEDIA_CONFIG[type];
  const { statusField, navPath, statusType } = config;

  const title =
    variant === "credit" && data.display_name ? data.display_name : getDisplayName(data, type);
  // Prefer the pretty /anime/47/slug form every other Link on the site uses.
  // Rows that predate public_id, or a payload that omits it, still resolve:
  // the backend's entry-ref parser takes a UUID too.
  const cardPath =
    entityPath(type, data) ||
    (navPath && data.system_id ? `${navPath}/${data.system_id}` : "");
  const imageUrl = getCoverUrl(data.cover_image_file);
  const currentStatus = data[statusField] || FALLBACK_STATUS[statusType];
  const btnConfig = getCardStatusConfig(type, currentStatus);
  const futureOptions =
    FUTURE_STATUS_OPTIONS[isFilmType(type) ? "film" : statusType] || [];
  const boltRelease = BOLT_RELEASE[type];
  const needsExtra = !futureOptions.includes(currentStatus);

  async function handleStatusToggle() {
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        fields: statusToggleFields(type, statusField, currentStatus, btnConfig.target),
        entry: data,
      });
      showToast("success", `Status -> ${btnConfig.target}`);
      onUpdated?.(updated);
    } catch {
      showToast("error", "Network error");
    }
  }

  async function handleStatusChange(e) {
    const newStatus = e.target.value;
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        value: newStatus,
        entry: data,
      });
      onUpdated?.(updated);
    } catch {
      showToast("error", "Network error");
    }
  }

  async function applyBoltAction(watchingStatus) {
    const airingStatus = boltRelease?.value;
    // The release is the catalogue's; the watching status is the viewer's own,
    // and is only sent by an account that keeps a list.
    const personal = watchingStatus && ownData ? { [statusField]: watchingStatus } : {};
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        fields: personal,
        catalogue: { [boltRelease.field]: airingStatus },
      });
      onUpdated?.(updated);
      showToast(
        "success",
        watchingStatus
          ? `${title} marked as ${airingStatus} · ${watchingStatus}`
          : `${title} marked as ${airingStatus}`,
      );
    } catch {
      showToast("error", "Network error");
    }
  }

  function handleBoltAction() {
    if (type === "game") {
      applyBoltAction(
        currentStatus === "Play When Released" ? "Active Playing" : null,
      );
      return;
    }
    // A film waiting on its release starts with it; any other status stays.
    if (isFilmType(type)) {
      applyBoltAction(currentStatus === "Watch When Released" ? "Active Watching" : null);
      return;
    }
    if (!BOLT_PROMPTS_WATCHING.has(type)) {
      applyBoltAction(null);
      return;
    }
    // Waiting on the release, in either spelling: the release starts it.
    if (WAIT_FOR_RELEASE_STATUSES.includes(currentStatus)) {
      applyBoltAction("Active Watching");
      return;
    }
    if (currentStatus === "Plan to Watch") {
      setShowAiringPrompt(true);
      return;
    }
    applyBoltAction(null);
  }

  // The status button is an ink outline: the status is in the tooltip and
  // the symbol, not in a colour.
  // No list, no status: a viewer without self.list has none to show or change.
  const statusBtn = ownData ? (
    <button
      onClick={handleStatusToggle}
      className="w-6 h-6 flex items-center justify-center border border-border-strong bg-surface text-text-muted hover:border-text hover:text-text transition-colors font-mono text-[13px] leading-none"
      title={`${currentStatus} → ${btnConfig.target}`}
    >
      {btnConfig.symbol}
    </button>
  ) : null;

  return (
    <div
      className={`bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full relative group${
        cardPath ? " cursor-pointer" : ""
      }`}
    >
      <div className="flex">
        <div className="flex-1 min-w-0 aspect-[3/4] bg-surface-2 relative overflow-hidden">
          {variant === "future" ? coverBadges : <PosterBadges type={type} variant={variant} data={data} />}
          <LazyImage
            src={thumbUrl(imageUrl)}
            alt={title}

            className="w-full h-full object-cover"
            style={focusStyle(data.cover_image_focus)}
            onError={(e) => {
              e.target.src = FALLBACK_SVG;
            }}
          />
        </div>
      </div>

      <div className="p-3 flex flex-col flex-1 bg-surface border-t border-border">
        <h3
          className="font-display font-semibold text-text text-sm line-clamp-2 leading-tight mb-1.5"
          title={title}
        >
          {cardPath ? (
            // The stretched link: the anchor is the title, and its ::after
            // covers the whole card. That is what makes a middle click, a
            // ctrl-click and "open in new tab" work anywhere on the card,
            // while keeping every control below out of the anchor.
            <Link
              to={cardPath}
              className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>

        {variant === "credit" ? (
          CREDIT_META[type] ? (
            <CreditMeta type={type} data={data} />
          ) : (
            <CardMeta type={type} data={data} scoreField={scoreField} />
          )
        ) : variant === "future" ? (
          <>
            {meta}
            <div className="relative z-10 mt-auto flex items-center gap-1 border-t border-border pt-2.5">
              {/* A type with no release to wait on (a book, a manga) has no
                  waiting status to pick: it keeps the library's status
                  button instead of the select. */}
              {ownData && futureOptions.length === 0 && (
                <div className="ml-auto shrink-0">{statusBtn}</div>
              )}
              {ownData && futureOptions.length > 0 && (
                <select
                  value={currentStatus}
                  onChange={handleStatusChange}
                  className="font-mono text-[10px] border border-border-strong px-1 py-0.5 bg-surface text-text-muted cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand w-full"
                  title={statusType === "play" ? "Playing status" : "Watching status"}
                >
                  {needsExtra && (
                    <option value={currentStatus} disabled>
                      {currentStatus}
                    </option>
                  )}
                  {futureOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
              {canEditCatalogue && boltRelease && (
                <button
                  onClick={handleBoltAction}
                  className="w-6 h-6 flex items-center justify-center border border-border-strong bg-surface text-text-muted hover:border-brand hover:text-brand transition-colors text-[10px] shrink-0"
                  title={`Mark as ${boltRelease?.value}`}
                >
                  <i className="fas fa-bolt"></i>
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <CardMeta type={type} data={data} scoreField={scoreField} />
            <div
              className="relative z-10 mt-auto flex items-center justify-between gap-1 border-t border-border pt-2.5"
            >
              {HAS_PROGRESS.has(type) && (
                <ProgressDisplay
                  type={type}
                  data={data}
                  showVol={showVol}
                  onToggleVol={() => setShowVol((v) => !v)}
                />
              )}
              {/* ml-auto, not the row's justify-between alone: a progress
                display with nothing to show renders null, and the button
                must stay at the right edge rather than slide into its place. */}
              <div className="ml-auto shrink-0">{statusBtn}</div>
            </div>
          </>
        )}
      </div>

      {showAiringPrompt && (
        <MarkAiringModal
          title={title}
          airingStatus={boltRelease?.value}
          currentStatus={currentStatus}
          onSelect={(watchingStatus) => {
            setShowAiringPrompt(false);
            applyBoltAction(watchingStatus);
          }}
          onCancel={() => setShowAiringPrompt(false)}
        />
      )}
    </div>
  );
}
