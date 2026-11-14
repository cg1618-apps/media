// Frontend: page component file for Hentai.
//
// The detail page of the gated hentai type. App.jsx only routes here for a
// session that can see the type, and the API answers 404 to any other, so
// nothing on this page re-checks visibility.
//
// Tracked like Cartoon.jsx: an episode stepper (ep_fin of ep_total) that
// finishes the entry when it reaches the total, and Mark completed, which
// also marks it aired and carries the counter to the total. What it adds is
// h-comic's: usefulness, the three H genre fields, and the originality of
// the work, and an author; and anime's: a studio, a director, a voiced cast,
// and a MAL link
// Tenrai fills the airing status, release date, episode count, cover and two
// reference links from.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import ReportProblemButton from "../../components/requests/ReportProblemButton";

import { endpoints } from "../../api/endpoints";
import MarkReleaseButton from "../../components/tracker/MarkReleaseButton";
import { EpisodeStepper, PausedAtInput } from "../../components/tracker/MyTrackerCard";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import { creditLabel, creditValue } from "../../components/info/PersonLinks";
import SourcesCard from "../../components/info/SourcesCard";
import { studioValue } from "../../components/info/StudioLinks";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import DetailContents, { TocSection } from "../../components/layout/DetailContents";
import { usePageTitle } from "../../contexts/PageTitleContext";
import RelationsSection from "../../components/tracker/RelationsSection";
import StatusOptions from "../../components/ui/StatusOptions";
import { Button, Eyebrow, RatingStamp, Slip } from "../../components/ui/primitives";
import { H_COMIC_USEFULNESS, MY_RATINGS, WATCHING_STATUSES } from "../../config/fieldOptions";
import { useAuth } from "../../contexts/AuthContext";
import FollowedOrderPanel from "../../components/tracker/FollowedOrderPanel";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useCasting } from "../../hooks/useCasting";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { useToast } from "../../hooks/useToast";
import { useOwnTrackerSave } from "../../hooks/useOwnTrackerSave";
import { entityPath } from "../../lib/entityPath";
import { FALLBACK_SVG, getCoverUrl, getDisplayName } from "../../utils/media";
import HentaiNotes from "./HentaiNotes";
import { focusStyle } from "../../lib/covers";
import CastSection from "../../components/info/CastSection";
import LazyImage from "../../components/ui/LazyImage";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRemarkSaver } from "../../api/mutations/useMyRemark";

const LIST_OPTIONS = { params: { limit: 2000 } };

const selectCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";


function HentaiTrackerBlock({ hentai, canTrack, onPatch }) {
  // Every control here is the viewer's own (self.list), saved through /api/me
  // by the page; without it the slip is not drawn.
  if (!canTrack) return null;
  const select = (id, label, field, options, { emptyLabel, msg }) => (
    <div className="space-y-1">
      <Eyebrow as="label" htmlFor={id}>
        {label}
      </Eyebrow>
      <select
        id={id}
        value={hentai[field] || ""}
        onChange={(e) => onPatch({ [field]: e.target.value || null }, msg)}
        className={selectCls}
      >
        <option value="">{emptyLabel}</option>
        {options.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </div>
  );

  const flag = (field, label, onMsg, offMsg) => (
    <div className="space-y-1">
      <Eyebrow>{label}</Eyebrow>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!hentai[field]}
          onChange={(e) =>
            onPatch({ [field]: e.target.checked }, e.target.checked ? onMsg : offMsg)
          }
          className="w-4 h-4 accent-brand"
        />
        <span className="text-sm text-text-muted">{label}</span>
      </label>
    </div>
  );

  // The same stepper as cartoon's MyTrackerCard; the fields below it are
  // hentai's own, so the card around it is too.
  const stepper = (
    <EpisodeStepper
      epFin={hentai.ep_fin ?? 0}
      epTotal={hentai.ep_total ?? "?"}
      canTrack={canTrack}
      onEpChange={(v) => onPatch({ ep_fin: v }, "Episode progress saved")}
    />
  );

  return (
    <Slip title="My tracker" actions={stepper}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1">
          <Eyebrow as="label" htmlFor="hentai-watching-status">
            Watching status
          </Eyebrow>
          <select
            id="hentai-watching-status"
            value={hentai.watching_status || ""}
            onChange={(e) =>
              onPatch({ watching_status: e.target.value }, "Status updated")
            }
            className={selectCls}
          >
            <StatusOptions statuses={WATCHING_STATUSES} />
          </select>
        </div>
        {select("hentai-rating", "Rating", "my_rating", MY_RATINGS, {
          emptyLabel: "Unrated",
          msg: "Rating saved",
        })}
        {/* Personal, like the rating: how useful it was to me. */}
        {select("hentai-usefulness", "Usefulness", "usefulness", H_COMIC_USEFULNESS, {
          emptyLabel: "—",
          msg: "Usefulness saved",
        })}
        <PausedAtInput
          value={hentai.time_fin}
          canTrack={canTrack}
          onChange={(v) => onPatch({ time_fin: v }, "Paused position saved")}
          className="space-y-1"
        />
        {flag("watch_next", "Watch next", "Added to Watch Next", "Removed from Watch Next")}
        {flag("to_rewatch", "To rewatch", "Marked for rewatch", "Removed from rewatch")}
      </div>
    </Slip>
  );
}

export default function Hentai() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();

  const [hentai, setHentai] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const itemQuery = useMediaItem("hentai", publicId);
  useCanonicalPath("hentai", itemQuery.data);
  // Everything past the lookup speaks UUIDs; resolved from the fetched row so
  // the URL segment and the id can never disagree.
  const system_id = itemQuery.data?.system_id;
  const { ownData } = useViewScope();
  const saveMyRemark = useMyRemarkSaver("hentai", system_id, setHentai);
  const castingQuery = useCasting("hentai", system_id);
  const cast = castingQuery.data?.cast || [];
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "hentai",
    publicId
  );

  useEffect(() => {
    if (itemQuery.data) setHentai(itemQuery.data);
  }, [itemQuery.data]);

  const franchiseId = hentai?.franchise_id;
  const seriesId = hentai?.series_id;
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

  // The viewer's own values (status, rating, progress, plan flags) go through /api/me;
  // saveRelease is the toolbar's release step, the work's half through the
  // catalogue PATCH.
  const { saveOwn, saveRelease } = useOwnTrackerSave("hentai", {
    entry: hentai,
    setEntry: setHentai,
    setMediaItem,
    fetchMediaItem,
  });

  async function markCompleted() {
    if (!isAdmin) return;
    try {
      const res = await fetch(endpoints.resource("hentai").complete(system_id), {
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

  // The single-entry Tenrai fetch: airing status, release date, episode
  // count and cover, each only where it is blank.
  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(endpoints.dataControl.replaceSingle("hentai", system_id), {
        method: "POST",
        credentials: "include",
      });
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
  const titleMain = hentai ? getDisplayName(hentai, "hentai") : null;
  usePageTitle(loading || error ? null : titleMain);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !hentai) {
    return (
      <MediaLoadingState error={error || "Hentai not found"} errorTitle="Error Loading Hentai" />
    );
  }

  const titleSub =
    hentai.hentai_name_en && hentai.hentai_name_en !== titleMain ? hentai.hentai_name_en : null;
  const imageUrl = getCoverUrl(hentai.cover_image_file);
  const franchiseName = franchise ? getDisplayName(franchise, "franchise") : null;

  const eyebrow = ["Hentai", hentai.source_material, hentai.originality, hentai.airing_status]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <DetailContents>
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/hentai" className="hover:text-brand transition">
            Hentai
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {titleMain}
          </span>
        </nav>
        <ReportProblemButton
          targetType="hentai"
          targetId={system_id}
          targetLabel={titleMain}
        />
      </div>

      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">Admin</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=hentai`)}>
              Quick edit
            </Button>
            <Button onClick={markCompleted}>Mark completed</Button>
            <MarkReleaseButton type="hentai" entry={hentai} title={titleMain} canTrack={ownData} onPatch={saveRelease} />
            <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
              {autofilling ? "Autofilling…" : "Autofill & update"}
            </Button>
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
                Hentai{hentai.source_material ? ` · ${hentai.source_material}` : ""}
              </span>
              {has("manage.catalog") && (
                <span
                  className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                  style={{ writingMode: "vertical-rl" }}
                >
                  {hentai.system_id}
                </span>
              )}
            </div>
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={hentai.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <LazyImage
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  style={focusStyle(hentai.cover_image_focus)}
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
            </div>
          </div>

          <SourcesCard
            sources={hentai.sources}
            coverUrl={imageUrl}
            mediaType="hentai"
            malLink={hentai.mal_link}
            anidbLink={hentai.anidb_link}
          />

          <RelationsSection mediaType="hentai" entryId={hentai.system_id} />
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
            <ContentLabelChips labels={hentai.content_labels} className="mb-6" />

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
                {hentai.series_number != null && (
                  <span className="font-mono text-xs text-text-muted">#{hentai.series_number}</span>
                )}
              </div>
            </div>
          </header>

          {/* Where this entry sits in the watch orders the viewer follows. */}
          <TocSection id="watch-orders" label="Watch orders">
            <FollowedOrderPanel entryId={hentai.system_id} />
          </TocSection>

          <TocSection id="tracker" label="My tracker">
            <HentaiTrackerBlock hentai={hentai} canTrack={ownData} onPatch={saveOwn} />
          </TocSection>

          <div className="space-y-6">
            <TocSection id="naming" label="Naming">
              <NamingCard type="hentai" item={hentai} />
            </TocSection>
            <TocSection id="information" label="Information">
              <InfoCard
                title="Information"
                fields={[
                  [
                    { label: "Source Material", value: hentai.source_material },
                    { label: "Originality", value: hentai.originality },
                  ],
                  [
                    { label: "Airing Status", value: hentai.airing_status },
                    { label: "Release Date", value: hentai.release_date || null },
                  ],
                  [
                    {
                      label: "Episodes",
                      value: hentai.ep_total != null ? String(hentai.ep_total) : null,
                    },
                  ],
                ]}
              />
            </TocSection>
            <TocSection id="credits" label="Credits">
              <InfoCard
                title="Credits"
                fields={[
                  [
                    { label: "Studio", value: studioValue(hentai) },
                    {
                      label: creditLabel(hentai, "director", "Director"),
                      value: creditValue(hentai, "director", hentai.director),
                    },
                  ],
                  {
                    label: creditLabel(hentai, "author", "Author"),
                    value: creditValue(hentai, "author", hentai.author),
                  },
                ]}
              />
            </TocSection>
            <TocSection id="cast" label="Cast">
              <CastSection cast={cast} />
            </TocSection>
            <TocSection id="genres" label="Genres">
              <InfoCard
                title="Genres"
                fields={[
                  { label: "Genre Plot", value: hentai.h_genre_plot },
                  { label: "Genre Appearance", value: hentai.h_genre_appearance },
                  { label: "Genre Relation", value: hentai.h_genre_relation },
                ]}
              />
            </TocSection>
          </div>

          <TocSection id="remarks" label="Remarks">
            {ownData && hentai.remark && (
              <Slip title="Remarks">
                <textarea
                  key={hentai.system_id}
                  defaultValue={hentai.remark || ""}
                  onBlur={(e) => {
                    if (e.target.value !== (hentai.remark || ""))
                      saveMyRemark(e.target.value);
                  }}
                  rows={4}
                  placeholder="Add remarks…"
                  className={selectCls}
                ></textarea>
              </Slip>
            )}
          </TocSection>

          {/* The dedicated remark textarea above renders only for a holder of
              self.list who has a remark; hide the notes page's `remark`
              section exactly then, so the viewer's own row never has two
              editors on one screen. */}
          <HentaiNotes
            key={hentai.system_id}
            hentai={hentai}
            hideSections={ownData && hentai.remark ? ["remark"] : []}
            series={series}
            franchise={franchise}
          />
        </div>
      </div>
    </DetailContents>
  );
}
