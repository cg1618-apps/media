// Frontend: card component file for MediaCard.
//
// An archive card: the cover carries a thin ink spine on the left with the
// media type, the rating stamp top-right, then the title in the display face
// and one mono line of metadata. Flat, no hover zoom - the border darkens.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { useStatusToggle } from "../../hooks/useStatusToggle";
import MarkAiringModal from "../modals/MarkAiringModal";
import { entityPath } from "../../lib/entityPath";
import { releaseYear } from "../../lib/releaseDate";
import { effectiveProgressDisplay } from "../../lib/novelUnits";
import { progressFor } from "../../lib/hComicRegion";
import {
  getDisplayName,
  getCoverUrl,
  FALLBACK_SVG,
  getCardStatusConfig,
  getReleaseFallback,
  formatLength,
  parseTypes,
  MEDIA_CONFIG,
  getNovelProgress,
  getBahaRow,
} from "../../utils/media";
import { Chip, RatingStamp } from "../ui/primitives";

const SPINE_LABEL = {
  anime: "Anime",
  "anime-movie": "Anime movie",
  movie: "Movie",
  "tv-show": "TV show",
  cartoon: "Cartoon",
  manga: "Manga",
  novel: "Novel",
  comic: "Comic",
  game: "Game",
  "h-comic": "H-Comic",
  "h-game": "H-Game",
};

// The statuses the future variant's select offers, per status axis. A game
// is on the play axis, so it must not be offered the watch vocabulary.
const FUTURE_STATUS_OPTIONS = {
  watch: ["Might Watch", "Plan to Watch", "Watch When Airs"],
  play: ["Might Play", "Plan to Play", "Play When Released"],
};

// What the bolt does on the future variant: the column that says a title is
// still unreleased, and the value that says it is out. A game carries
// release_status where the watched types carry airing_status.
const BOLT_RELEASE = {
  anime: { field: "airing_status", value: "Airing" },
  "anime-movie": { field: "airing_status", value: "Finished Airing" },
  movie: { field: "airing_status", value: "Finished Airing" },
  "tv-show": { field: "airing_status", value: "Airing" },
  cartoon: { field: "airing_status", value: "Airing" },
  game: { field: "release_status", value: "Released" },
};

// Small ink label laid over cover art.
const OVERLAY_CLS =
  "bg-black/60 text-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] leading-none z-10";

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
};

function MetaLine({ children, className = "" }) {
  return (
    <div
      className={`font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint mb-3 flex items-center justify-between gap-1 ${className}`}
    >
      {children}
    </div>
  );
}

function PosterBadges({ type, variant, data, franchiseDict, scoreField }) {
  const bahaRow = getBahaRow(data);
  const bahaFlag =
    (type === "anime" || type === "anime-movie") && bahaRow?.available === true;
  const hasBahaLink = bahaFlag && bahaRow?.url;
  const franchise = franchiseDict?.[data.franchise_id];
  const expectation = franchise?.franchise_expectation;

  if (variant === "future") {
    return (
      <>
        {expectation && (type === "anime" || type === "cartoon") && (
          <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>
            {expectation}
          </div>
        )}
        {(type === "anime" || type === "cartoon") && data.airing_type && (
          <div className={`absolute top-1 right-1 ${OVERLAY_CLS}`}>
            {data.airing_type}
          </div>
        )}
        {bahaFlag &&
          (hasBahaLink ? (
            <a
              href={bahaRow.url}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-1 left-1 bg-surface/95 px-1.5 py-0.5 z-10 border border-border flex items-center justify-center"
              title="Watch on Bahamut"
            >
              <img
                loading="lazy"
                src="https://i2.bahamut.com.tw/anime/logo.svg"
                className="h-3 opacity-90"
                alt="Baha"
              />
            </a>
          ) : (
            <div
              className="absolute bottom-1 left-1 bg-surface/95 px-1.5 py-0.5 z-10 border border-border flex items-center justify-center"
              title="Available on Bahamut (no link)"
            >
              <img
                loading="lazy"
                src="https://i2.bahamut.com.tw/anime/logo.svg"
                className="h-3 opacity-30 grayscale"
                alt="Baha"
              />
            </div>
          ))}
      </>
    );
  }

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
      {type === "anime-movie" && data[scoreField] && (
        <div
          className={`absolute top-1 left-1 ${OVERLAY_CLS}`}
          title={SCORE_LABEL[scoreField]}
        >
          {data[scoreField]}
        </div>
      )}
      {(type === "movie" || type === "tv-show") &&
        data.imdb_rating &&
        data.imdb_rating !== "N/A" && (
          <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`} title="IMDb score">
            {data.imdb_rating}
          </div>
        )}
      {type === "tv-show" && data.region && (
        <div className={`absolute bottom-1 right-1 ${OVERLAY_CLS}`}>
          {data.region}
        </div>
      )}
      {(type === "manga" || type === "novel" || type === "h-comic") &&
        data.region && (
        <div className={`absolute top-1 left-1 ${OVERLAY_CLS}`}>
          {data.region}
        </div>
      )}
      {type === "comic" && data.is_main_entry && (
        <div
          className={`absolute top-1 left-1 ${OVERLAY_CLS}`}
          title="On the main line"
        >
          Main
        </div>
      )}
      {type === "comic" && data.comic_type && (
        <div className={`absolute bottom-1 right-1 ${OVERLAY_CLS}`}>
          {data.comic_type}
        </div>
      )}
      {bahaFlag && (
        <div
          className="absolute bottom-1 left-1 bg-surface/95 px-1.5 py-0.5 z-10 border border-border flex items-center justify-center"
          title="Available on Bahamut"
        >
          <img
            loading="lazy"
            src="https://i2.bahamut.com.tw/anime/logo.svg"
            className="h-3 opacity-90"
            alt="Baha"
          />
        </div>
      )}
    </>
  );
}

function yearRange(data) {
  const start = releaseYear(data.release_date) || "?";
  const end = releaseYear(data.end_date);
  return end && end !== releaseYear(data.release_date) ? `${start} – ${end}` : start;
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

  if (type === "tv-show") {
    return (
      <MetaLine>
        {data.season_part && (
          <span className="truncate pr-1">{data.season_part}</span>
        )}
        {data.airing_status && (
          <span className="shrink-0 truncate">{data.airing_status}</span>
        )}
      </MetaLine>
    );
  }

  if (type === "cartoon") {
    return (
      <MetaLine>
        <span className="truncate pr-1">{data.release_date || "TBD"}</span>
        {data.imdb_rating && data.imdb_rating !== "N/A" && (
          <Score value={data.imdb_rating} />
        )}
      </MetaLine>
    );
  }

  if (type === "anime-movie") {
    const length = formatLength(data.length_min);
    const year = releaseYear(data.release_date_jp || data.release_date_tw);
    return (
      <MetaLine>
        {length && <span className="shrink-0">{length}</span>}
        {year ? <span className="truncate">{year}</span> : null}
      </MetaLine>
    );
  }

  if (type === "movie") {
    const length = formatLength(data.length_min);
    return (
      <MetaLine>
        {length && <span className="shrink-0">{length}</span>}
        {(data.release_date_tw || data.release_date_usa) && (
          <span className="truncate">
            {data.release_date_tw || data.release_date_usa}
          </span>
        )}
      </MetaLine>
    );
  }

  // Play style and language: what an h-game library is browsed by.
  if (type === "h-game") {
    return (
      <MetaLine className="mb-1">
        <span className="truncate pr-1">{data.playstyle || "—"}</span>
        {data.language_availability && (
          <span className="shrink-0">{data.language_availability}</span>
        )}
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

  if (type === "novel") {
    return (
      <div className="mb-1 flex items-end justify-between gap-1">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          {(data.type || data.serialization_status || data.version) && (
            <div className="flex items-center gap-1 flex-wrap">
              {data.type && <Chip>{data.type}</Chip>}
              {data.serialization_status && (
                <Chip>{data.serialization_status}</Chip>
              )}
              {data.version && <Chip tone="muted">{data.version}</Chip>}
            </div>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint truncate">
            {yearRange(data)}
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

  if (type === "comic") {
    // events is a comma-joined multi-select sharing franchise_type's idiom;
    // show the first and count the rest.
    const events = parseTypes(data.events);
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint mb-1 flex flex-col gap-1 min-w-0">
        {data.comic_name_cn && (
          <span
            className="truncate font-sans normal-case tracking-normal"
            title={data.comic_name_cn}
          >
            {data.comic_name_cn}
          </span>
        )}
        <div className="flex items-center justify-between gap-1">
          {data.volume_label && <Chip>{data.volume_label}</Chip>}
          <span className="truncate">{yearRange(data)}</span>
        </div>
        {data.era && <Chip className="self-start">{data.era}</Chip>}
        {events.length > 0 && (
          <div
            className="flex items-center gap-1 min-w-0"
            title={events.join(", ")}
          >
            <span className="truncate">{events[0]}</span>
            {events.length > 1 && (
              <span className="shrink-0">+{events.length - 1}</span>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}

const COUNT_CLS = "font-mono text-[11px] text-text-muted tabular-nums";
const UNIT_CLS = "text-[9px] text-text-faint uppercase tracking-[0.12em] ml-1";

function Count({ fin, total, unit }) {
  return (
    <div className={COUNT_CLS}>
      {fin} <span className="text-text-faint">/</span> {total}
      <span className={UNIT_CLS}>{unit}</span>
    </div>
  );
}

function ProgressDisplay({ type, data, showVol, onToggleVol }) {
  if (type === "anime") {
    const localFin = data.ep_fin || 0;
    const localTotal =
      data.ep_total != null && data.ep_total !== ""
        ? parseInt(data.ep_total, 10)
        : "?";
    return <Count fin={localFin} total={localTotal} unit="ep" />;
  }

  if (type === "tv-show" || type === "cartoon") {
    const epFin = data.ep_fin ?? 0;
    const epTotal =
      data.ep_total != null && data.ep_total !== ""
        ? parseInt(data.ep_total, 10)
        : "?";
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
          className="font-mono text-[9px] uppercase tracking-[0.12em] text-text-faint hover:text-brand border border-border-strong px-1 py-0.5 transition-colors shrink-0"
          title="Toggle Ch/Vol"
        >
          {showVol ? "Ch" : "Vol"}
        </button>
        {showVol ? (
          <div className={COUNT_CLS}>
            {volFin}
            {volFinPage > 0 && (
              <span className="text-[9px] text-text-faint ml-0.5">
                p{volFinPage}
              </span>
            )}{" "}
            <span className="text-text-faint">/</span> {volTotal}
            <span className={UNIT_CLS}>vol</span>
          </div>
        ) : (
          <Count fin={chFin} total={chTotal} unit="ch" />
        )}
      </div>
    );
  }

  if (type === "novel") {
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
          {getNovelProgress(data)}
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

  // A game has no episode/chapter counter - playtime against the main-story
  // estimate is its progress. With neither figure there is nothing to show.
  if (type === "game") {
    if (data.hours_played == null && data.hltb_main == null) return null;
    return (
      <Count
        fin={data.hours_played ?? 0}
        total={data.hltb_main != null ? data.hltb_main : "?"}
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

function FutureMeta({ type, data }) {
  if (type === "anime") {
    return data.studio ? (
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint truncate mt-0.5">
        {data.studio}
      </p>
    ) : null;
  }
  if (type === "anime-movie") {
    const length = formatLength(data.length_min);
    const year = releaseYear(data.release_date_jp || data.release_date_tw);
    return (
      <MetaLine className="mt-1 mb-0">
        {length && <span className="shrink-0">{length}</span>}
        {year ? <span className="truncate">{year}</span> : null}
      </MetaLine>
    );
  }
  if (type === "movie") {
    const length = formatLength(data.length_min);
    const d = data.release_date_tw || data.release_date_usa || "";
    const year = releaseYear(d);
    const shownYear = year || "TBD";
    return (
      <MetaLine className="mt-1 mb-0">
        {length && <span className="shrink-0">{length}</span>}
        <span className="truncate">{shownYear}</span>
      </MetaLine>
    );
  }
  if (type === "tv-show") {
    return (
      <MetaLine className="mt-1 mb-0">
        {data.region && <span className="shrink-0">{data.region}</span>}
        <span className="truncate">{data.release_date || "TBD"}</span>
      </MetaLine>
    );
  }
  if (type === "cartoon") {
    return (
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-faint mt-1 truncate">
        {data.release_date || "TBD"}
      </div>
    );
  }
  if (type === "game") {
    return (
      <MetaLine className="mt-1 mb-0">
        {data.game_type && <span className="shrink-0">{data.game_type}</span>}
        <span className="truncate">{data.release_date || "TBD"}</span>
      </MetaLine>
    );
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
  "novel",
  "comic",
  "game",
  "h-comic",
  "h-game",
]);
const ADMIN_ONLY_STATUS = new Set(["movie", "anime-movie"]);

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
  franchiseDict = {},
  isAdmin: isAdminProp,
  onUpdated,
  scoreField = "mal_rating",
}) {
  const { isAdmin: authAdmin } = useAuth();
  const showAdmin = isAdminProp !== undefined ? isAdminProp : authAdmin;
  const { showToast } = useToast();
  const [showVol, setShowVol] = useState(false);
  const [showAiringPrompt, setShowAiringPrompt] = useState(false);
  const statusMutation = useStatusToggle(type);

  const config = MEDIA_CONFIG[type];
  const { statusField, navPath, statusType } = config;

  const title = getDisplayName(data, type);
  // Prefer the pretty /anime/47/slug form every other Link on the site uses.
  // Rows that predate public_id, or a payload that omits it, still resolve:
  // the backend's entry-ref parser takes a UUID too.
  const cardPath =
    entityPath(type, data) ||
    (navPath && data.system_id ? `${navPath}/${data.system_id}` : "");
  const imageUrl = getCoverUrl(data.cover_image_file);
  const currentStatus = data[statusField] || FALLBACK_STATUS[statusType];
  const btnConfig = getCardStatusConfig(type, currentStatus);
  const futureOptions = FUTURE_STATUS_OPTIONS[statusType] || [];
  const boltRelease = BOLT_RELEASE[type];
  const needsExtra = !futureOptions.includes(currentStatus);

  async function handleStatusToggle() {
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        value: btnConfig.target,
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
      });
      onUpdated?.(updated);
    } catch {
      showToast("error", "Network error");
    }
  }

  async function applyBoltAction(watchingStatus) {
    const airingStatus = boltRelease?.value;
    const fields = { [boltRelease.field]: airingStatus };
    if (watchingStatus) fields[statusField] = watchingStatus;
    try {
      const updated = await statusMutation.mutateAsync({
        id: data.system_id,
        fields,
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
    if (!BOLT_PROMPTS_WATCHING.has(type)) {
      applyBoltAction(null);
      return;
    }
    if (currentStatus === "Watch When Airs") {
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
  const statusBtn = showAdmin ? (
    <button
      onClick={handleStatusToggle}
      className="w-6 h-6 flex items-center justify-center border border-border-strong bg-surface text-text-muted hover:border-text hover:text-text transition-colors font-mono text-[13px] leading-none"
      title={`${currentStatus} → ${btnConfig.target}`}
    >
      {btnConfig.symbol}
    </button>
  ) : !ADMIN_ONLY_STATUS.has(type) && currentStatus ? (
    <Chip className="min-w-0 truncate" title={currentStatus}>
      {currentStatus}
    </Chip>
  ) : null;

  return (
    <div
      className={`bg-surface border border-border hover:border-border-strong transition-colors flex flex-col h-full relative group${
        cardPath ? " cursor-pointer" : ""
      }`}
    >
      <div className="flex">
        <div className="w-5 shrink-0 bg-ink text-ink-text flex flex-col items-center py-1.5 overflow-hidden">
          <span
            className="font-mono text-[8px] uppercase tracking-[0.2em] whitespace-nowrap"
            style={{ writingMode: "vertical-rl" }}
          >
            {SPINE_LABEL[type] || type}
          </span>
        </div>
        <div className="flex-1 min-w-0 aspect-[3/4] bg-surface-2 relative overflow-hidden">
          <PosterBadges
            type={type}
            variant={variant}
            data={data}
            franchiseDict={franchiseDict}
            scoreField={scoreField}
          />
          <img
            src={imageUrl}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover"
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

        {variant === "future" ? (
          <>
            <FutureMeta type={type} data={data} />
            <div className="relative z-10 mt-auto flex items-center gap-1 border-t border-border pt-2.5">
              {showAdmin && (
                <>
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
                  <button
                    onClick={handleBoltAction}
                    className="w-6 h-6 flex items-center justify-center border border-border-strong bg-surface text-text-muted hover:border-brand hover:text-brand transition-colors text-[10px] shrink-0"
                    title={`Mark as ${boltRelease?.value}`}
                  >
                    <i className="fas fa-bolt"></i>
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <>
            <LibraryMeta type={type} data={data} scoreField={scoreField} />
            <div
              className={`relative z-10 mt-auto flex items-center border-t border-border pt-2.5 ${HAS_PROGRESS.has(type) ? "justify-between" : "justify-end"}`}
            >
              {HAS_PROGRESS.has(type) && (
                <ProgressDisplay
                  type={type}
                  data={data}
                  showVol={showVol}
                  onToggleVol={() => setShowVol((v) => !v)}
                />
              )}
              {statusBtn}
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
