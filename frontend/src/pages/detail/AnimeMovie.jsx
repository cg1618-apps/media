// Frontend: page component file for AnimeMovie.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import { endpoints } from "../../api/endpoints";
import MarkReleaseButton from "../../components/tracker/MarkReleaseButton";
import { useAuth } from "../../contexts/AuthContext";
import FollowedOrderPanel from "../../components/tracker/FollowedOrderPanel";
import { useToast } from "../../hooks/useToast";
import { useOwnTrackerSave } from "../../hooks/useOwnTrackerSave";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import InfoCard from "../../components/info/InfoCard";
import {
  publisherLabel,
  publisherValue,
  studioValue,
} from "../../components/info/StudioLinks";
import { creditValue } from "../../components/info/PersonLinks";
import NamingCard from "../../components/info/NamingCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import SourcesCard from "../../components/info/SourcesCard";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import RelationsSection from "../../components/tracker/RelationsSection";
import AnimeMovieNotes from "./AnimeMovieNotes";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import DetailContents, { TocSection } from "../../components/layout/DetailContents";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { Button, Eyebrow, RatingStamp, Slip } from "../../components/ui/primitives";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { WATCHING_STATUSES } from "../../config/fieldOptions";
import { useCasting } from "../../hooks/useCasting";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import { focusStyle } from "../../lib/covers";
import CastSection from "../../components/info/CastSection";
import LazyImage from "../../components/ui/LazyImage";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRemarkSaver } from "../../api/mutations/useMyRemark";

const MY_RATINGS = ["S", "A+", "A", "B", "C", "D", "E", "F"];


function formatLength(minutes) {
  if (!minutes) return null;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}min`;
  if (mins === 0) return `${hrs}hr`;
  return `${hrs}hr ${mins}min`;
}

const LIST_OPTIONS = { params: { limit: 2000 } };

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

export default function AnimeMovie() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [movie, setMovie] = useState(null);
  const [autofilling, setAutofilling] = useState(false);
  const movieQuery = useMediaItem("anime-movie", publicId);
  useCanonicalPath("anime-movie", movieQuery.data);
  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = movieQuery.data?.system_id;
  const { ownData } = useViewScope();
  const saveMyRemark = useMyRemarkSaver("anime-movie", system_id, setMovie);
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("anime-movie", publicId);
  const castingQuery = useCasting("anime-movie", movie?.system_id);
  const cast = castingQuery.data?.cast || [];

  useEffect(() => {
    if (movieQuery.data) setMovie(movieQuery.data);
  }, [movieQuery.data]);

  const allFranchises = franchiseQuery.data || [];
  const franchise = useMemo(
    () =>
      movie?.franchise_id
        ? allFranchises.find((f) => f.system_id === movie.franchise_id) || null
        : null,
    [allFranchises, movie?.franchise_id],
  );
  const loading = movieQuery.isLoading || franchiseQuery.isLoading;
  const error =
    movieQuery.error?.message || franchiseQuery.error?.message || null;

  // The viewer's own values (status, rating, paused-at, plan flags) go through /api/me;
  // saveRelease is the toolbar's release step, the work's half through the
  // catalogue PATCH.
  const { saveOwn, saveRelease } = useOwnTrackerSave("anime-movie", {
    entry: movie,
    setEntry: setMovie,
    setMediaItem,
    fetchMediaItem,
  });

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(
        endpoints.dataControl.replaceSingle("anime-movie", system_id),
        { method: "POST", credentials: "include" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "Autofill failed");
      showToast("success", data.message || "Autofill completed");
      await invalidateMedia();
      await fetchMediaItem();
    } catch (e) {
      showToast("error", e.message);
    } finally {
      setAutofilling(false);
    }
  }

  // The heading's title, which the browser tab shows too.
  const titleMain = movie
    ? movie.anime_movie_name_cn ||
      movie.anime_movie_name_en ||
      movie.anime_movie_name_roman ||
      "Unknown"
    : null;
  usePageTitle(loading || error ? null : titleMain);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !movie) {
    return (
      <MediaLoadingState
        error={error || "Anime movie not found"}
        errorTitle="Error Loading Anime Movie"
      />
    );
  }

  const titleSub =
    movie.anime_movie_name_en && movie.anime_movie_name_en !== titleMain
      ? movie.anime_movie_name_en
      : movie.anime_movie_name_roman &&
          movie.anime_movie_name_roman !== titleMain
        ? movie.anime_movie_name_roman
        : null;

  const imageUrl = getCoverUrl(movie.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  const eyebrow = [
    "Anime movie",
    movie.airing_status,
    formatLength(movie.length_min),
    movie.release_date_jp,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <DetailContents>
      {/* Breadcrumb: a catalogue path, set in mono */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/anime-movie" className="hover:text-brand transition">
            Anime movies
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {titleMain}
          </span>
        </nav>
        <ReportProblemButton
          targetType="anime-movie"
          targetId={system_id}
          targetLabel={titleMain}
        />
      </div>

      {/* Admin toolbar: a plain instrument strip */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">
            Admin
          </Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}`)}>
              Quick edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("anime-movie").complete(system_id), {
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
              }}
            >
              Mark completed
            </Button>
            <MarkReleaseButton type="anime-movie" entry={movie} title={titleMain} canTrack={ownData} onPatch={saveRelease} />
            <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
              {autofilling ? "Autofilling…" : "Autofill & update"}
            </Button>
          </div>
        </div>
      )}

      {/* Main Grid: 4 columns */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster: cover with a spine strip and the rating stamp */}
          <div className="flex border border-border bg-surface">
            <div className="w-7 shrink-0 bg-ink text-ink-text flex flex-col items-center justify-between py-2">
              <span
                className="font-mono text-[10px] uppercase tracking-[0.2em] whitespace-nowrap"
                style={{ writingMode: "vertical-rl" }}
              >
                Anime · Movie
              </span>
              {/* Cosmetic only: the id is this page's own URL, so hiding it
                  tidies the spine rather than concealing the value. Shown to
                  a catalogue editor (manage.catalog). */}
              {has("manage.catalog") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {movie.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={movie.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <LazyImage
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  style={focusStyle(movie.cover_image_focus)}
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={movie.sources}
            coverUrl={imageUrl}
            mediaType="anime"
            malLink={movie.mal_link}
            exclusiveSource={movie.exclusive_source}
          />

          {/* Related Entries */}
          <RelationsSection mediaType="anime-movie" entryId={movie.system_id} />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header & Titles */}
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
              {eyebrow}
            </div>
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
            <ContentLabelChips labels={movie.content_labels} className="mb-6" />


            {/* Franchise lineage */}
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
            </div>

            <ScoreBlock
              malScore={movie.mal_rating}
              malRank={movie.mal_rank}
              anilistScore={movie.anilist_rating}
              anilistRank={movie.anilist_rank}
              anilistPopularityRank={movie.anilist_popularity_rank}
            />
          </header>

          {/* Where this entry sits in the watch orders the viewer follows. */}
          <TocSection id="watch-orders" label="Watch orders">
            <FollowedOrderPanel entryId={movie.system_id} />
          </TocSection>

          {/* My Tracker Block - no stepper: a movie is watched whole, so
              only where playback paused is kept. */}
          <TocSection id="tracker" label="My tracker">
            <MyTrackerCard
              watchingStatus={movie.watching_status}
              myRating={movie.my_rating}
              timeFin={movie.time_fin}
              watchNext={movie.watch_next}
              toRewatch={movie.to_rewatch}
              canTrack={ownData}
              onStatusChange={(v) => saveOwn({ watching_status: v }, "Status updated")}
              onRatingChange={(v) => saveOwn({ my_rating: v }, "Rating saved")}
              onTimeFinChange={(v) => saveOwn({ time_fin: v }, "Paused position saved")}
              pausedPlaceholder="1:10:00"
              onWatchNextChange={(v) =>
                saveOwn({ watch_next: v }, v ? "Added to Watch Next" : "Removed from Watch Next")
              }
              onToRewatchChange={(v) =>
                saveOwn({ to_rewatch: v }, v ? "Marked for rewatch" : "Removed from rewatch")
              }
              statusOptions={WATCHING_STATUSES}
              ratingOptions={MY_RATINGS}
            />
          </TocSection>

          {/* Detail Cards */}
          <div className="space-y-6">
            <TocSection id="naming" label="Naming">
              <NamingCard type="anime-movie" item={movie} />
            </TocSection>
            <TocSection id="information" label="Information">
              <InfoCard
                title="Information"
                fields={[
                  [
                    { label: "Airing Status", value: movie.airing_status },
                    { label: "Length", value: formatLength(movie.length_min) },
                  ],
                  [
                    { label: "Release Date JP", value: movie.release_date_jp },
                    { label: "Release Date TW", value: movie.release_date_tw },
                  ],
                  { label: "Genre (Main)", value: movie.genre_main },
                  { label: "Genre (Sub)", value: movie.genre_sub },
                  { label: "標籤 Label", value: movie.label },
                ]}
              />
            </TocSection>
            <TocSection id="production" label="Production">
              <InfoCard
                title="Production"
                fields={[
                  { label: "Studio", value: studioValue(movie) },
                  {
                    // New on this type: anime-movie never carried a distributor
                    // field before the publisher entity migration.
                    label: publisherLabel(movie, "台灣代理商"),
                    value: publisherValue(movie),
                  },
                  {
                    label: "Director",
                    value: creditValue(movie, "director", movie.director),
                  },
                ]}
              />
            </TocSection>
          </div>

          {/* Cast */}
          <TocSection id="cast" label="Cast">
            <CastSection cast={cast} />
          </TocSection>

          {/* Remarks */}
          <TocSection id="remarks" label="Remarks">
            {ownData && movie.remark && (
              <Slip title="Remarks">
                <textarea
                  key={movie.system_id}
                  defaultValue={movie.remark || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (movie.remark || ""))
                      saveMyRemark(e.target.value);
                  }}
                  rows={4}
                  placeholder="Add remarks…"
                  className={selectCls}
                ></textarea>
              </Slip>
            )}
          </TocSection>

          {/* Structured Notes */}
          {/* The dedicated remark textarea above renders only for a holder of
              self.list who has a remark; hide the notes page's `remark`
              section exactly then, so the viewer's own row never has two
              editors on one screen. */}
          <AnimeMovieNotes
            key={movie.system_id}
            movie={movie}
            hideSections={ownData && movie.remark ? ["remark"] : []}
            franchise={franchise}
          />
        </div>
      </div>
    </DetailContents>
  );
}
