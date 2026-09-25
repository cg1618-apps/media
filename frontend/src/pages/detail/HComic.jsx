// Frontend: page component file for HComic.
//
// The detail page of the gated h-comic type. App.jsx only routes here for a
// session that can see the type, and the API answers 404 to any other, so
// nothing on this page re-checks visibility.
//
// Laid out like Manga.jsx. What differs is the region (lib/hComicRegion.js):
// a JP entry counts pages and carries originality, animation status and its
// place in its series; a KR one counts chapters, says how far it trails the
// official source, credits an author and an official source, and has the
// 亮點 Highlights notes section.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import CommunityCard from "../../components/info/CommunityCard";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import { creditLabel, creditValue } from "../../components/info/PersonLinks";
import SourcesCard from "../../components/info/SourcesCard";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import RelationsSection from "../../components/tracker/RelationsSection";
import StatusOptions from "../../components/ui/StatusOptions";
import {
  Button,
  Chip,
  Eyebrow,
  ProgressRule,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
import { H_COMIC_USEFULNESS, MY_RATINGS, READING_STATUSES } from "../../config/fieldOptions";
import { useAuth } from "../../contexts/AuthContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useCasting } from "../../hooks/useCasting";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { useToast } from "../../hooks/useToast";
import { entityPath } from "../../lib/entityPath";
import { adaptingHentai, isDerivedAnimationStatus } from "../../lib/hComicAnimation";
import { progressFor, showsField } from "../../lib/hComicRegion";
import { FALLBACK_SVG, getCoverUrl, getDisplayName } from "../../utils/media";
import HComicNotes from "./HComicNotes";

const LIST_OPTIONS = { params: { limit: 2000 } };

// Main before Supporting, then the server's order - the shape every ACG
// detail page's cast list takes. An h-comic's castings never carry a seiyuu
// (ck_casting_voice_scope), so a row is the character alone.
const CAST_ROLE_ORDER = { Main: 0, Supporting: 1 };

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";
const stepBtnCls =
  "w-8 h-8 shrink-0 text-text-muted hover:text-text hover:bg-surface-2 transition flex items-center justify-center disabled:opacity-40";
const counterInputCls =
  "text-text w-12 text-right bg-transparent border-b border-transparent hover:border-border-strong focus:border-brand focus:outline-none transition-colors appearance-none p-0 m-0 leading-none disabled:opacity-60";

// A derived animation status, and the hentai it comes from. The names are
// the relation card's own rows (RelationsSection onRows), so naming them
// costs no request of its own; until they arrive the note says where the
// value comes from without naming it.
function DerivedAnimationStatus({ hComic, adaptations }) {
  return (
    <>
      {hComic.animation_status}
      <span className="block text-xs text-text-muted mt-0.5">
        Derived from{" "}
        {adaptations.length === 0
          ? "a linked hentai adaptation"
          : adaptations.map((other, i) => (
              <Fragment key={other.entry_id}>
                {i > 0 && ", "}
                {other.nav_path ? (
                  <Link to={other.nav_path} className={lineageLinkCls}>
                    {other.display_name}
                  </Link>
                ) : (
                  other.display_name
                )}
              </Fragment>
            ))}
      </span>
    </>
  );
}

function CastSection({ cast }) {
  if (!cast || cast.length === 0) return null;
  const sorted = [...cast].sort((a, b) => {
    const ra = CAST_ROLE_ORDER[a.role] ?? 2;
    const rb = CAST_ROLE_ORDER[b.role] ?? 2;
    if (ra !== rb) return ra - rb;
    return (a.position ?? 0) - (b.position ?? 0);
  });
  return (
    <Slip title="Cast">
      <div className="space-y-2">
        {sorted.map((row) => (
          <div key={row.system_id} className="flex items-center gap-3">
            <div className="w-10 h-10 shrink-0 bg-surface-2 overflow-hidden rounded">
              <img
                loading="lazy"
                src={getCoverUrl(row.photo_file)}
                alt=""
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.target.src = FALLBACK_SVG;
                }}
              />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
              {row.role && <Chip>{row.role}</Chip>}
              <Link
                to={entityPath("character", {
                  public_id: row.character_public_id,
                  display_name: row.character_name,
                })}
                className={lineageLinkCls}
              >
                {row.character_name || "Unknown"}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </Slip>
  );
}

// The counter: pages on JP, chapters on KR, whichever the region reads in.
function ProgressStepper({ progress, isAdmin, onChange }) {
  const { fin, total, unit, label } = progress;

  function step(delta) {
    if (!isAdmin) return;
    let next = (fin || 0) + delta;
    if (total !== null && next > total) next = total;
    if (next < 0) next = 0;
    if (next === fin) return;
    onChange(next);
  }

  return (
    <div>
      <Eyebrow className="mb-2">{label}</Eyebrow>
      <div className="flex items-center border border-border-strong w-fit">
        <button
          onClick={() => step(-1)}
          disabled={!isAdmin}
          aria-label={`Previous ${unit === "ch" ? "chapter" : "page"}`}
          className={stepBtnCls}
        >
          <i className="fas fa-minus text-xs"></i>
        </button>
        <div className="font-mono text-sm flex items-baseline justify-center px-2 min-w-[90px] whitespace-nowrap border-l border-r border-border">
          <input
            type="number"
            aria-label={`${label} read`}
            value={fin}
            disabled={!isAdmin}
            onChange={(e) => {
              if (!isAdmin) return;
              const v = parseInt(e.target.value, 10) || 0;
              if (total !== null && v > total) return;
              onChange(Math.max(0, v));
            }}
            className={counterInputCls}
          />
          <span className="text-text-faint mx-1 text-xs">/</span>
          <span className="text-text-faint text-sm leading-none">{total ?? "?"}</span>
          <span className="text-[9px] text-text-faint ml-1.5 uppercase">{unit}</span>
        </div>
        <button
          onClick={() => step(1)}
          disabled={!isAdmin}
          aria-label={`Next ${unit === "ch" ? "chapter" : "page"}`}
          className={`${stepBtnCls} text-brand`}
        >
          <i className="fas fa-plus text-xs"></i>
        </button>
      </div>
    </div>
  );
}

function HComicTrackerBlock({ hComic, isAdmin, onPatch }) {
  const progress = progressFor(hComic);
  const behind = showsField(hComic.region, "ch_behind") ? hComic.ch_behind : null;

  const flag = (field, label, onMsg, offMsg) => (
    <div className="space-y-1">
      <Eyebrow>{label}</Eyebrow>
      <label
        className={`flex items-center gap-2 ${isAdmin ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
      >
        <input
          type="checkbox"
          checked={!!hComic[field]}
          disabled={!isAdmin}
          onChange={(e) =>
            isAdmin && onPatch({ [field]: e.target.checked }, e.target.checked ? onMsg : offMsg)
          }
          className="w-4 h-4 accent-brand"
        />
        <span className="text-sm text-text-muted">{label}</span>
      </label>
    </div>
  );

  return (
    <Slip title="My tracker">
      <div className="space-y-5">
        {progress ? (
          <div className="flex flex-wrap items-end gap-6">
            <ProgressStepper
              progress={progress}
              isAdmin={isAdmin}
              onChange={(v) => onPatch({ [progress.finField]: v }, `${progress.label} saved`)}
            />
            {/* Hand-set by the owner, not derived (spec D8). */}
            {behind != null && (
              <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-muted pb-2">
                Behind official: <span className="text-text">{behind}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-faint">
            No region yet, so there is no counter. Set one on Quick edit.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-border">
          <div className="space-y-1">
            <Eyebrow as="label" htmlFor="h-comic-reading-status">
              Reading status
            </Eyebrow>
            <select
              id="h-comic-reading-status"
              value={hComic.reading_status || ""}
              disabled={!isAdmin}
              onChange={(e) =>
                isAdmin && onPatch({ reading_status: e.target.value }, "Status updated")
              }
              className={selectCls}
            >
              <StatusOptions statuses={READING_STATUSES} />
            </select>
          </div>
          <div className="space-y-1">
            <Eyebrow as="label" htmlFor="h-comic-rating">
              Rating
            </Eyebrow>
            <select
              id="h-comic-rating"
              value={hComic.my_rating || ""}
              disabled={!isAdmin}
              onChange={(e) =>
                isAdmin && onPatch({ my_rating: e.target.value || null }, "Rating saved")
              }
              className={selectCls}
            >
              <option value="">Unrated</option>
              {MY_RATINGS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {/* Personal, like the rating: how useful it was to me. */}
          <div className="space-y-1">
            <Eyebrow as="label" htmlFor="h-comic-usefulness">
              Usefulness
            </Eyebrow>
            <select
              id="h-comic-usefulness"
              value={hComic.usefulness || ""}
              disabled={!isAdmin}
              onChange={(e) =>
                isAdmin && onPatch({ usefulness: e.target.value || null }, "Usefulness saved")
              }
              className={selectCls}
            >
              <option value="">—</option>
              {H_COMIC_USEFULNESS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          {flag("read_next", "Read next", "Added to Read Next", "Removed from Read Next")}
          {flag("to_reread", "To reread", "Marked for reread", "Removed from reread")}
        </div>
      </div>
    </Slip>
  );
}

export default function HComic() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isRoot } = useAuth();
  const { showToast } = useToast();

  const [hComic, setHComic] = useState(null);
  const [adaptations, setAdaptations] = useState([]);
  const handleRelationRows = useCallback((rows) => setAdaptations(adaptingHentai(rows)), []);

  const itemQuery = useMediaItem("h-comic", publicId);
  useCanonicalPath("h-comic", itemQuery.data);
  // Everything past the lookup speaks UUIDs; resolved from the fetched row so
  // the URL segment and the id can never disagree.
  const system_id = itemQuery.data?.system_id;
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "h-comic",
    publicId
  );
  const castingQuery = useCasting("h-comic", hComic?.system_id);
  const cast = useMemo(() => castingQuery.data?.cast || [], [castingQuery.data]);
  // The cast's names are what the Highlights `names` inputs suggest.
  const castNames = useMemo(
    () => [...new Set(cast.map((row) => row.character_name).filter(Boolean))],
    [cast]
  );

  useEffect(() => {
    if (itemQuery.data) setHComic(itemQuery.data);
  }, [itemQuery.data]);

  const franchiseId = hComic?.franchise_id;
  const seriesId = hComic?.series_id;
  const franchise = useMemo(
    () =>
      (franchiseId && (franchiseQuery.data || []).find((f) => f.system_id === franchiseId)) || null,
    [franchiseQuery.data, franchiseId]
  );
  const series = useMemo(
    () => (seriesId && (seriesQuery.data || []).find((s) => s.system_id === seriesId)) || null,
    [seriesQuery.data, seriesId]
  );
  const loading = itemQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    itemQuery.error?.message || franchiseQuery.error?.message || seriesQuery.error?.message || null;

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setHComic((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("h-comic").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setHComic(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function markCompleted() {
    if (!isAdmin) return;
    try {
      const res = await fetch(endpoints.resource("h-comic").complete(system_id), {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Request failed");
      showToast("success", "Marked as Completed!");
      await invalidateMedia();
      await fetchMediaItem();
    } catch {
      showToast("error", "Update failed");
    }
  }

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !hComic) {
    return (
      <MediaLoadingState error={error || "H-Comic not found"} errorTitle="Error Loading H-Comic" />
    );
  }

  const region = hComic.region;
  const shows = (field) => showsField(region, field);
  const titleMain = getDisplayName(hComic, "h-comic");
  const titleSub =
    hComic.h_comic_name_en && hComic.h_comic_name_en !== titleMain ? hComic.h_comic_name_en : null;
  const imageUrl = getCoverUrl(hComic.cover_image_file);
  const franchiseName = franchise ? getDisplayName(franchise, "franchise") : null;

  const progress = progressFor(hComic);
  const progressValue = progress
    ? progress.total
      ? progress.fin / progress.total
      : progress.fin > 0
        ? 1
        : 0
    : 0;
  const progressPct = progress?.total ? Math.round((progress.fin / progress.total) * 100) : null;

  const eyebrow = ["H-Comic", region, hComic.originality, hComic.serialization_status]
    .filter(Boolean)
    .join("  ·  ");

  const num = (v) => (v != null ? String(v) : null);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      <nav
        className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
        aria-label="Breadcrumb"
      >
        <Link to="/library/h-comic" className="hover:text-brand transition">
          H-Comic
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
          {titleMain}
        </span>
      </nav>

      {/* No Autofill: h-comic has no external API, so its write hook fetches
          nothing. */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">Admin</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=h-comic`)}>
              Quick edit
            </Button>
            <Button onClick={markCompleted}>Mark completed</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center justify-between py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                H-Comic{region ? ` · ${region}` : ""}
              </span>
              {isRoot && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {hComic.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={hComic.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <img
                  loading="lazy"
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
              <ProgressRule value={progressValue} />
              {progress && (
                <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                  <span>{progress.label}</span>
                  <span className="text-text">
                    {progress.fin} / {progress.total ?? "?"}
                    {progressPct != null ? ` · ${progressPct}%` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>

          <SourcesCard
            sources={hComic.sources}
            mediaType="h-comic"
            originalSource={shows("original_source") ? hComic.original_source : null}
          />

          <RelationsSection
            mediaType="h-comic"
            entryId={hComic.system_id}
            onRows={handleRelationRows}
          />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {titleMain}
            </h1>
            {titleSub && <h2 className="text-lg text-text-muted font-normal mb-4">{titleSub}</h2>}
            <ContentLabelChips labels={hComic.content_labels} className="mb-6" />

            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm mb-2 pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Franchise</Eyebrow>
                {franchise ? (
                  <Link to={entityPath("franchise", franchise)} className={lineageLinkCls}>
                    {franchiseName}
                  </Link>
                ) : (
                  <span className="text-text-faint">Independent</span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <Eyebrow>Series</Eyebrow>
                {series ? (
                  <Link to={entityPath("series", series)} className={lineageLinkCls}>
                    {getDisplayName(series, "series")}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
                {shows("series_number") && hComic.series_number != null && (
                  <span className="font-mono text-xs text-text-muted">#{hComic.series_number}</span>
                )}
              </div>
            </div>
          </header>

          <HComicTrackerBlock hComic={hComic} isAdmin={isAdmin} onPatch={performPatch} />

          <CommunityCard mediaId={hComic.system_id} />

          <div className="space-y-6">
            <NamingCard type="h-comic" item={hComic} />
            <InfoCard
              title="Information"
              fields={[
                [
                  { label: "Region", value: region },
                  { label: "Serialization Status", value: hComic.serialization_status },
                ],
                ...(region === "JP"
                  ? [
                      [
                        { label: "Originality", value: hComic.originality },
                        {
                          label: "Animation Status",
                          value: isDerivedAnimationStatus(hComic) ? (
                            <DerivedAnimationStatus hComic={hComic} adaptations={adaptations} />
                          ) : (
                            hComic.animation_status
                          ),
                        },
                      ],
                      [
                        { label: "Series Number", value: num(hComic.series_number) },
                        { label: "Page Total", value: num(hComic.page_total) },
                      ],
                    ]
                  : []),
                ...(region === "KR"
                  ? [
                      [
                        { label: "Chapter Total", value: num(hComic.ch_total) },
                        { label: "Chapters Behind Official", value: num(hComic.ch_behind) },
                      ],
                      { label: "Official Source", value: hComic.original_source },
                    ]
                  : []),
                [
                  { label: "Release Date", value: hComic.release_date || null },
                  { label: "End Date", value: hComic.end_date || null },
                ],
              ]}
            />
            <InfoCard
              title="Credits"
              fields={[
                [
                  {
                    label: creditLabel(hComic, "illustrator", "繪師"),
                    value: creditValue(hComic, "illustrator", hComic.illustrator),
                  },
                  {
                    label: creditLabel(hComic, "club", "Club"),
                    value: creditValue(hComic, "club", hComic.club),
                  },
                ],
                ...(shows("author")
                  ? [
                      {
                        label: creditLabel(hComic, "author", "Author"),
                        value: creditValue(hComic, "author", hComic.author),
                      },
                    ]
                  : []),
              ]}
            />
            <InfoCard
              title="Genres"
              fields={[
                { label: "Genre Plot", value: hComic.h_genre_plot },
                { label: "Genre Appearance", value: hComic.h_genre_appearance },
                { label: "Genre Relation", value: hComic.h_genre_relation },
              ]}
            />
          </div>

          <CastSection cast={cast} />

          {hComic.remark && (
            <Slip title="Remarks">
              <textarea
                key={hComic.system_id}
                defaultValue={hComic.remark || ""}
                disabled={!isAdmin}
                onBlur={(e) =>
                  isAdmin && performPatch({ remark: e.target.value || null }, "Remark saved")
                }
                rows={4}
                placeholder="Add remarks…"
                className={selectCls}
              ></textarea>
            </Slip>
          )}

          {/* The dedicated remark textarea above renders only when a remark
              exists; hide the notes page's `remark` section exactly then, so
              the singleton row never has two editors on one screen. */}
          <HComicNotes
            key={hComic.system_id}
            hComic={hComic}
            isAdmin={isAdmin}
            hideSections={hComic.remark ? ["remark"] : []}
            nameSuggestions={castNames}
            onGroupOrderChange={(names) =>
              performPatch({ highlight_group_order: names }, "Group order saved")
            }
          />
        </div>
      </div>
    </div>
  );
}
