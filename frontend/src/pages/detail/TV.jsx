// Frontend: page component file for TV.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import NeedsWorkBadge from "../../components/needs-work/NeedsWorkBadge";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import { endpoints } from "../../api/endpoints";
import MarkReleaseButton from "../../components/tracker/MarkReleaseButton";
import AdminActions from "../../components/layout/AdminActions";
import { useAuth } from "../../contexts/AuthContext";
import FollowedOrderPanel from "../../components/tracker/FollowedOrderPanel";
import { useToast } from "../../hooks/useToast";
import { useOwnTrackerSave } from "../../hooks/useOwnTrackerSave";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import RelationsSection from "../../components/tracker/RelationsSection";
import InfoCard from "../../components/info/InfoCard";
import GenresCard from "../../components/info/GenresCard";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import TVShowNotes from "./TVShowNotes";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import DetailContents, { TocSection } from "../../components/layout/DetailContents";
import { usePageTitle } from "../../contexts/PageTitleContext";
import {
  Button,
  Eyebrow,
  ProgressRule,
  RatingStamp,
} from "../../components/ui/primitives";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { AIRING_WATCHING_STATUSES } from "../../config/fieldOptions";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import LazyImage from "../../components/ui/LazyImage";
import { focusStyle } from "../../lib/covers";
import { useViewScope } from "../../hooks/useViewScope";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];
const LIST_OPTIONS = { params: { limit: 2000 } };

const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

export default function TV() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [show, setShow] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const showQuery = useMediaItem("tv-show", publicId);
  useCanonicalPath("tv-show", showQuery.data);
  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = showQuery.data?.system_id;
  const { ownData } = useViewScope();
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allShowsQuery = useMediaList("tv-show", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate("tv-show", publicId);

  useEffect(() => {
    if (showQuery.data) setShow(showQuery.data);
  }, [showQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      show?.franchise_id
        ? franchises.find((f) => f.system_id === show.franchise_id) || null
        : null,
    [franchises, show?.franchise_id],
  );
  const series = useMemo(
    () =>
      show?.series_id
        ? seriesList.find((s) => s.system_id === show.series_id) || null
        : null,
    [seriesList, show?.series_id],
  );
  const loading =
    showQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    showQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  // The viewer's own values (status, rating, progress, plan flags) go through /api/me;
  // saveRelease is the toolbar's release step, the work's half through the
  // catalogue PATCH.
  const { saveOwn, saveRelease } = useOwnTrackerSave("tv-show", {
    entry: show,
    setEntry: setShow,
    setMediaItem,
    fetchMediaItem,
  });

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(
        endpoints.dataControl.replaceSingle("tv-show", system_id),
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", "Autofill completed");
      await invalidateMedia();
      await fetchMediaItem();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setAutofilling(false);
    }
  }

  // The heading's title, which the browser tab shows too.
  const titleMain = show
    ? show.tv_name_cn || show.tv_name_en || show.tv_name_alt || "Unknown"
    : null;
  usePageTitle(loading || error ? null : titleMain);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !show) {
    return (
      <MediaLoadingState
        error={error || "TV show not found"}
        errorTitle="Error Loading TV Show"
      />
    );
  }

  const titleSub =
    show.tv_name_en && show.tv_name_en !== titleMain ? show.tv_name_en : null;

  const imageUrl = getCoverUrl(show.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;


  const epFin = show.ep_fin ?? 0;
  const epTotal =
    show.ep_total !== null && show.ep_total !== undefined
      ? show.ep_total
      : null;
  const progress =
    epTotal ? epFin / epTotal : epFin > 0 ? 1 : 0;
  const progressPct = epTotal ? Math.round(progress * 100) : null;


  const imdbScore =
    show.imdb_rating && show.imdb_rating !== "N/A" ? show.imdb_rating : "—";
  const showScore =
    show.imdb_series_rating && show.imdb_series_rating !== "N/A"
      ? show.imdb_series_rating
      : null;

  return (
    <DetailContents>
      {/* Breadcrumb: a catalogue path, set in mono */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/tv-show" className="hover:text-brand transition">
            TV shows
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {titleMain}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <NeedsWorkBadge ownerType="tv-show" ownerId={system_id} />
          <ReportProblemButton
            targetType="tv-show"
            targetId={system_id}
            targetLabel={titleMain}
          />
        </div>
      </div>

      {/* Admin toolbar: a plain instrument strip */}
      {isAdmin && (
        <AdminActions
          start={
            <>
              <Button onClick={() => navigate(`/modify?id=${system_id}&type=tv-show`)}>
                Edit
              </Button>
              <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
                {autofilling ? "Autofilling…" : "Autofill & update"}
              </Button>
            </>
          }
          end={
            <>
              <MarkReleaseButton type="tv-show" entry={show} title={titleMain} canTrack={ownData} onPatch={saveRelease} />
              <Button
                onClick={async () => {
                  if (!isAdmin) return;
                  try {
                    const res = await fetch(
                      endpoints.resource("tv-show").complete(system_id),
                      {
                        method: "POST",
                        credentials: "include",
                      },
                    );
                    if (!res.ok) throw new Error("Request failed");
                    showToast("success", "Marked as Completed!");
                    await invalidateMedia();
                    await fetchMediaItem();
                  } catch {
                    showToast("error", "Update failed");
                  }
                }}
              >
                Mark completed
              </Button>
            </>
          }
        />
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster: the cover and the rating stamp */}
          <div className="flex border border-border bg-surface">
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={show.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <LazyImage
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  style={focusStyle(show.cover_image_focus)}
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
              {/* Progress rule along the bottom edge of the cover */}
              <ProgressRule value={progress} />
              <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] text-text-faint">
                <span>Progress</span>
                <span className="text-text">
                  {epFin} / {epTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={show.sources}
            coverUrl={imageUrl}
            mediaType="tv-show"
            imdbLink={show.imdb_link}
            originalSource={show.source_official}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="tv-show" entryId={show.system_id} />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header */}
          {/* No eyebrow above the title: what it repeated is on the Information
              card, and the breadcrumb names the type. */}
          <header>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {titleMain}
            </h1>
            {titleSub && (
              <h2 className="text-lg text-text-muted font-normal mb-4">
                {titleSub}
              </h2>
            )}
            {/* What restricts this entry, if anything. Its franchise's
                own labels are shown on the franchise, where they can be
                changed. */}
            <ContentLabelChips labels={show.content_labels} className="mb-6" />


            {/* Franchise / Series lineage */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm mb-8 pt-3 border-t border-border">
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
                    {series.series_name_cn ||
                      series.series_name_en ||
                      series.series_name_alt}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>

            {/* IMDb score: display figures on a hairline */}
            <div className="flex flex-wrap items-end gap-8 border-t border-b border-border py-3">
              <div>
                <Eyebrow>{showScore ? "IMDb · this season" : "IMDb score"}</Eyebrow>
                <div className="font-display text-3xl font-semibold text-text leading-none mt-1">
                  {imdbScore}
                </div>
              </div>
              {/* The whole show's rating, every season of it alike. */}
              {showScore && (
                <div>
                  <Eyebrow>IMDb · whole show</Eyebrow>
                  <div className="font-display text-3xl font-semibold text-text-muted leading-none mt-1">
                    {showScore}
                  </div>
                </div>
              )}
              {/* Absent, not blanked: an em-dash would announce a
                  withheld date. See ScoreBlock for the shared version. */}
              {show.updated_at && (
                <div className="ml-auto text-right">
                  <Eyebrow>Last updated</Eyebrow>
                  <div className="font-mono text-xs text-text-muted mt-1">
                    {new Date(show.updated_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </header>

          {/* Where this entry sits in the orders the viewer follows. */}
          <TocSection id="orders" label="Orders">
            <FollowedOrderPanel entryId={show.system_id} />
          </TocSection>

          {/* My Tracker Block */}
          <TocSection id="tracker" label="My tracker">
            <MyTrackerCard
              epFin={epFin}
              epTotal={epTotal ?? "?"}
              watchingStatus={show.watching_status}
              myRating={show.my_rating}
              timeFin={show.time_fin}
              watchNext={show.watch_next}
              toRewatch={show.to_rewatch}
              canTrack={ownData}
              pinged={show.is_pinged}
              onPingedChange={(v) =>
                saveOwn({ is_pinged: v }, v ? "Pinned to the dashboard" : "Unpinned")
              }
              onEpChange={(v) =>
                saveOwn({ ep_fin: v }, "Episode progress saved")
              }
              onStatusChange={(v) =>
                saveOwn({ watching_status: v }, "Status updated")
              }
              onRatingChange={(v) =>
                saveOwn({ my_rating: v }, "Rating saved")
              }
              onTimeFinChange={(v) =>
                saveOwn({ time_fin: v }, "Paused position saved")
              }
              onWatchNextChange={(v) =>
                saveOwn(
                  { watch_next: v },
                  v ? "Added to Watch Next" : "Removed from Watch Next",
                )
              }
              onToRewatchChange={(v) =>
                saveOwn(
                  { to_rewatch: v },
                  v ? "Marked for rewatch" : "Removed from rewatch",
                )
              }
              statusOptions={AIRING_WATCHING_STATUSES}
              ratingOptions={MY_RATINGS}
            />
          </TocSection>

          {/* Detail Cards */}
          <div className="space-y-6">
            <TocSection id="naming" label="Naming">
              <NamingCard type="tv-show" item={show} />
            </TocSection>
            <TocSection id="information" label="Information">
              <InfoCard
                title="Information"
                fields={[
                  // Season is shown only when the entry has one.
                  [
                    { label: "Region", value: show.region },
                    { label: "本傳 / 外傳", value: show.is_main },
                    ...(show.season_part
                      ? [{ label: "Season", value: show.season_part }]
                      : []),
                  ],
                  [
                    { label: "Airing Type", value: show.airing_type },
                    { label: "Airing Status", value: show.airing_status },
                    { label: "Release Date", value: show.release_date },
                  ],
                  [
                    {
                      label: "Total Ep",
                      value: show.ep_total != null ? String(show.ep_total) : null,
                    },
                    {
                      label: "Runtime (min)",
                      value: show.runtime_min != null ? String(show.runtime_min) : null,
                    },
                  ],
                ]}
              />
            </TocSection>
            <TocSection id="genres" label="Genres">
              <GenresCard item={show} />
            </TocSection>
          </div>

          {/* Structured Notes */}
          <TVShowNotes
            key={show.system_id}
            show={show}
            series={series}
            franchise={franchise}
          />
        </div>
      </div>
    </DetailContents>
  );
}
