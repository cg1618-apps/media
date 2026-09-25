// Frontend: page component file for HGame.
//
// The detail page of the gated h-game type. App.jsx only routes here for a
// session that can see the type, and the API answers 404 to any other, so
// nothing on this page re-checks visibility.
//
// Laid out like Game.jsx - one NotesProvider around the page, 待辦 Todo in the
// Progress slip, the completion block beside My tracker, the copies read-only
// - minus what h_game does not hold (playtime, Metacritic, the achievement and
// collectible flags, every credit but the developer). What it adds: All CG
// and usefulness in the completion block, the language / audio / animation /
// H-presentation / platform facts, the two DLsite links beside Steam, and the
// 亮點 Highlights section, whose groups are ordered by the entry's
// highlight_group_order, saved whole by PATCH as h-comic's are.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { endpoints } from "../../api/endpoints";
import CommunityCard from "../../components/info/CommunityCard";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import InfoCard from "../../components/info/InfoCard";
import NamingCard from "../../components/info/NamingCard";
import SourcesCard from "../../components/info/SourcesCard";
import { studioValue } from "../../components/info/StudioLinks";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import GameCompletionBlock, {
  H_GAME_COMPLETION_AXES,
} from "../../components/tracker/GameCompletionBlock";
import MyTrackerCard from "../../components/tracker/MyTrackerCard";
import {
  Button,
  Eyebrow,
  ProgressRule,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
import { MY_RATINGS, PLAYING_STATUSES } from "../../config/fieldOptions";
import { useAuth } from "../../contexts/AuthContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { useToast } from "../../hooks/useToast";
import { entityPath } from "../../lib/entityPath";
import { releaseYear } from "../../lib/releaseDate";
import { FALLBACK_SVG, getCoverUrl, getDisplayName } from "../../utils/media";
import { NotesProvider } from "../notes/NotesContext";
import { NotesBlocks, NotesGroup } from "../notes/NotesTemplate";
import { GameCopiesSection, yesNo } from "./Game";

const LIST_OPTIONS = { params: { limit: 2000 } };

const textareaCls =
  "block w-full border border-border-strong bg-surface text-text px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand disabled:bg-surface-2 disabled:text-text-faint disabled:cursor-not-allowed";
const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";

/**
 * A multi-choice field for the Information card: null is "not recorded" and
 * renders as the card's em dash, [] is a real answer and says so.
 */
export function choiceText(values) {
  if (values == null) return null;
  return values.length ? values.join(" · ") : "None";
}

function money(amount, currency) {
  if (amount == null || amount === "") return null;
  return `${currency} ${amount}`;
}

/** Earned against total, or null when the entry reports no total. */
function achievements(hGame) {
  const total = Number(hGame.achievements_total);
  if (!Number.isFinite(total) || total <= 0) return null;
  const earned = Number(hGame.achievements_earned) || 0;
  return { earned, total, pct: Math.min(100, Math.round((earned / total) * 100)) };
}

/**
 * The time-to-beat estimate and achievements. Game's GameProgress measures
 * playtime against the estimate; an h-game records no playtime, so the
 * estimate stands alone. Renders nothing when neither figure exists.
 */
export function HGameProgress({ hGame }) {
  const estimate =
    hGame.hltb_main != null && hGame.hltb_main !== "" ? `~${hGame.hltb_main} h` : null;
  const ach = achievements(hGame);
  if (!estimate && !ach) return null;
  return (
    <div className="space-y-3">
      {estimate && (
        <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint">
          <span>Main story</span>
          <span className="text-text normal-case tracking-normal">{estimate}</span>
        </div>
      )}
      {ach && (
        <div>
          <div className="flex items-baseline justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-1.5">
            <span>Achievements</span>
            <span className="text-text normal-case tracking-normal">
              {ach.earned} / {ach.total}
              <span className="text-text-faint"> · {ach.pct}%</span>
            </span>
          </div>
          <ProgressRule value={ach.pct / 100} />
        </div>
      )}
    </div>
  );
}

export default function HGame() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin, isRoot } = useAuth();
  const { showToast } = useToast();

  const [hGame, setHGame] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const itemQuery = useMediaItem("h-game", publicId);
  useCanonicalPath("h-game", itemQuery.data);
  // Everything past the lookup speaks UUIDs; resolved from the fetched row so
  // the URL segment and the id can never disagree.
  const system_id = itemQuery.data?.system_id;
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } = useMediaCacheUpdate(
    "h-game",
    publicId
  );

  useEffect(() => {
    if (itemQuery.data) setHGame(itemQuery.data);
  }, [itemQuery.data]);

  const franchiseId = hGame?.franchise_id;
  const seriesId = hGame?.series_id;
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
    setHGame((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("h-game").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      showToast("success", msg || "Saved");
      const updated = await res.json();
      setHGame(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function markCompleted() {
    if (!isAdmin) return;
    try {
      const res = await fetch(endpoints.resource("h-game").complete(system_id), {
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

  // Game's IGDB and Steam fill, limited server-side to the columns h_game has.
  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(endpoints.dataControl.replaceSingle("h-game", system_id), {
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

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !hGame) {
    return (
      <MediaLoadingState error={error || "H-Game not found"} errorTitle="Error Loading H-Game" />
    );
  }

  const titleMain = getDisplayName(hGame, "h-game");
  const titleSub =
    hGame.h_game_name_en && hGame.h_game_name_en !== titleMain ? hGame.h_game_name_en : null;
  const imageUrl = getCoverUrl(hGame.cover_image_file);
  const franchiseName = franchise ? getDisplayName(franchise, "franchise") : null;
  const year = releaseYear(hGame.release_date);
  // The cover rule shows achievements: with no playtime recorded, it is the
  // one progress figure an h-game has.
  const ach = achievements(hGame);

  const eyebrow = [
    "H-Game",
    hGame.game_type,
    hGame.playstyle,
    hGame.release_status,
    hGame.completion_level,
    year,
  ]
    .filter(Boolean)
    .join("  ·  ");

  const num = (v) => (v != null ? String(v) : null);

  return (
    // One provider around the whole page, as on Game: 待辦 Todo renders in the
    // Progress slip and everything else at the bottom, from one fetch. The
    // three props after isAdmin are what 亮點 Highlights reads - the row, and
    // the stored group order with the callback that saves a new one. An
    // h-game has no cast, so its `names` inputs take free text only.
    <NotesProvider
      key={hGame.system_id}
      ownerType="h-game"
      ownerId={hGame.system_id}
      isAdmin={isAdmin}
      owner={hGame}
      groupOrder={hGame.highlight_group_order}
      onGroupOrderChange={(names) =>
        performPatch({ highlight_group_order: names }, "Group order saved")
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <nav
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-text-faint mb-8 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/h-game" className="hover:text-brand transition">
            H-Game
          </Link>
          {franchise && (
            <>
              <span aria-hidden="true">/</span>
              <Link
                to={entityPath("franchise", franchise)}
                className="hover:text-brand transition truncate max-w-xs normal-case tracking-normal"
              >
                {franchiseName}
              </Link>
            </>
          )}
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {titleMain}
          </span>
        </nav>

        {isAdmin && (
          <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
            <Eyebrow className="text-[11px] tracking-[0.16em] text-text-muted">Admin</Eyebrow>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/modify?id=${system_id}&type=h-game`)}>
                Quick edit
              </Button>
              <Button onClick={markCompleted}>Mark completed</Button>
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
                  H-Game{hGame.game_type ? ` · ${hGame.game_type}` : ""}
                </span>
                {isRoot && (
                  <span
                    className="font-mono text-[9px] tracking-[0.1em] opacity-60 whitespace-nowrap"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {hGame.system_id}
                  </span>
                )}
              </div>
              <div className="relative flex-1 min-w-0">
                <RatingStamp
                  rating={hGame.my_rating}
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
                <ProgressRule value={ach ? ach.pct / 100 : 0} />
                {ach && (
                  <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-text-faint">
                    <span>Achievements</span>
                    <span className="text-text">
                      {ach.earned} / {ach.total} · {ach.pct}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            <SourcesCard
              sources={hGame.sources}
              mediaType="h-game"
              igdbLink={hGame.igdb_link}
              steamLink={hGame.steam_link}
              dlsiteLinkJp={hGame.dlsite_link_jp}
              dlsiteLinkTw={hGame.dlsite_link_tw}
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
              <ContentLabelChips labels={hGame.content_labels} className="mb-6" />

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
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
                  {hGame.series_number != null && (
                    <span className="font-mono text-xs text-text-muted">#{hGame.series_number}</span>
                  )}
                </div>
              </div>
            </header>

            {/* My Tracker - no stepper, as on Game. */}
            <MyTrackerCard
              watchingStatus={hGame.playing_status || "Might Play"}
              statusOptions={PLAYING_STATUSES}
              statusLabel="Playing Status"
              myRating={hGame.my_rating}
              ratingOptions={MY_RATINGS}
              isAdmin={isAdmin}
              onStatusChange={(v) => performPatch({ playing_status: v }, "Status updated")}
              onRatingChange={(v) => performPatch({ my_rating: v || null }, "Rating saved")}
              toRewatch={hGame.to_replay}
              rewatchLabel="To Replay"
              onToRewatchChange={(v) =>
                performPatch({ to_replay: v }, v ? "Marked to replay" : "Removed from replay")
              }
            />

            {/* Completion Level, All Endings, All CG - and usefulness, the
                other personal answer about a playthrough, which MyTrackerCard
                (shared by every type) has no place for. */}
            <GameCompletionBlock
              game={hGame}
              isAdmin={isAdmin}
              axes={H_GAME_COMPLETION_AXES}
              idPrefix="h-game"
              onChange={(patch) => performPatch(patch, "Saved")}
            />

            <CommunityCard mediaId={hGame.system_id} />

            <Slip title="進度/待辦 Progress and Todo">
              <div className="space-y-4">
                <HGameProgress hGame={hGame} />
                <NotesGroup groupKey="todo" />
              </div>
            </Slip>

            <div className="space-y-6">
              <NamingCard type="h-game" item={hGame} />
              <InfoCard
                title="Information"
                fields={[
                  [
                    { label: "Type", value: hGame.game_type },
                    {
                      label: "Base Game",
                      value: hGame.base_game ? (
                        <Link
                          to={entityPath("h-game", hGame.base_game)}
                          className="text-brand hover:underline"
                        >
                          {hGame.base_game.display_name}
                        </Link>
                      ) : null,
                    },
                  ],
                  [
                    { label: "Play Style", value: hGame.playstyle },
                    { label: "Series Number", value: num(hGame.series_number) },
                  ],
                  [
                    { label: "Language", value: hGame.language_availability },
                    { label: "Animation", value: yesNo(hGame.animation_availability) },
                  ],
                  [
                    { label: "Audio", value: choiceText(hGame.audio_availability) },
                    { label: "H 演出形式", value: choiceText(hGame.h_presentation) },
                  ],
                  [
                    { label: "Art Style", value: choiceText(hGame.art_style) },
                    { label: "Platform", value: choiceText(hGame.platform) },
                  ],
                  [
                    { label: "Release Status", value: hGame.release_status },
                    { label: "Release Date", value: hGame.release_date },
                    { label: "Current Patch", value: hGame.current_patch },
                  ],
                  [
                    {
                      label: "Steam Progress Sync",
                      value: yesNo(hGame.steam_progress_sync),
                    },
                  ],
                  [
                    // Derived from the copy rows server-side, never stored.
                    { label: "Ownership", value: hGame.ownership },
                    {
                      label: "Copies",
                      value: hGame.copies?.length ? String(hGame.copies.length) : null,
                    },
                  ],
                ]}
              />
              <InfoCard
                title="Prices"
                fields={[
                  [
                    { label: "MSRP (US)", value: money(hGame.price_original_us, "USD") },
                    { label: "MSRP (JP)", value: money(hGame.price_original_jp, "JPY") },
                    { label: "MSRP (TW)", value: money(hGame.price_original_tw, "TWD") },
                  ],
                  [
                    { label: "Current (US)", value: money(hGame.price_current_us, "USD") },
                    { label: "Current (JP)", value: money(hGame.price_current_jp, "JPY") },
                    { label: "Current (TW)", value: money(hGame.price_current_tw, "TWD") },
                  ],
                ]}
              />
              {(hGame.studio || hGame.studio_refs?.length) && (
                <InfoCard
                  title="Production"
                  fields={[{ label: "Developer", value: studioValue(hGame) }]}
                />
              )}
              <InfoCard
                title="Genres"
                fields={[
                  [
                    { label: "Genre", value: hGame.game_genre },
                    { label: "Theme", value: hGame.game_theme },
                  ],
                  { label: "Genre Plot", value: hGame.h_genre_plot },
                  { label: "Genre Appearance", value: hGame.h_genre_appearance },
                  { label: "Genre Relation", value: hGame.h_genre_relation },
                ]}
              />
            </div>

            <GameCopiesSection copies={hGame.copies} />

            {hGame.remark && (
              <Slip title="Remarks">
                <textarea
                  key={hGame.system_id}
                  defaultValue={hGame.remark || ""}
                  disabled={!isAdmin}
                  onBlur={(e) =>
                    isAdmin && performPatch({ remark: e.target.value || null }, "Remark saved")
                  }
                  rows={4}
                  placeholder="Add remarks…"
                  className={textareaCls}
                ></textarea>
              </Slip>
            )}

            <NotesBlocks
              hideSections={hGame.remark ? ["remark"] : []}
              // Rendered in the Progress slip at the top instead.
              hideGroups={["todo"]}
            />
          </div>
        </div>
      </div>
    </NotesProvider>
  );
}
