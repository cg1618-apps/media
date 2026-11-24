// Frontend: page component file for Book.
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import NeedsWorkBadge from "../../components/needs-work/NeedsWorkBadge";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import { endpoints } from "../../api/endpoints";
import MarkReleaseButton from "../../components/tracker/MarkReleaseButton";
import { useAuth } from "../../contexts/AuthContext";
import FollowedOrderPanel from "../../components/tracker/FollowedOrderPanel";
import { useToast } from "../../hooks/useToast";
import { useOwnTrackerSave } from "../../hooks/useOwnTrackerSave";
import { getCoverUrl, FALLBACK_SVG } from "../../utils/media";
import RelationsSection from "../../components/tracker/RelationsSection";
import InfoCard from "../../components/info/InfoCard";
import GenresCard from "../../components/info/GenresCard";
import { creditLabel, creditValue } from "../../components/info/PersonLinks";
import {
  publisherLabel,
  publisherValue,
} from "../../components/info/StudioLinks";
import NamingCard from "../../components/info/NamingCard";
import BookTrackerBlock from "../../components/tracker/BookTrackerBlock";
import SourcesCard from "../../components/info/SourcesCard";
import ScoreBlock from "../../components/info/ScoreBlock";
import BookNotes from "./BookNotes";
import BookUnitsEditor from "../../components/forms/BookUnitsEditor";
import { UnitCoverThumb, UnitReleaseDates } from "../../components/info/BookUnitParts";
import MediaLoadingState from "../../components/layout/MediaLoadingState";
import DetailContents, { TocSection } from "../../components/layout/DetailContents";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { effectiveProgressDisplay } from "../../lib/bookUnits";
import {
  Button,
  Chip,
  Eyebrow,
  ProgressRule,
  RatingStamp,
  Slip,
} from "../../components/ui/primitives";
import { useMediaCacheUpdate } from "../../hooks/useMediaCacheUpdate";
import { useMediaItem } from "../../hooks/useMediaItem";
import { useMediaList } from "../../hooks/useMediaList";
import { useCasting } from "../../hooks/useCasting";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { entityPath } from "../../lib/entityPath";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import { progressToast } from "../../lib/progressToast";
import { focusStyle } from "../../lib/covers";
import CastSection from "../../components/info/CastSection";
import LazyImage from "../../components/ui/LazyImage";
import { useViewScope } from "../../hooks/useViewScope";
import { useSaveMyBookUnit } from "../../api/mutations/useMyRatingMutations";
import { SELECT_CLS } from "../../components/hub/HubChrome";
import { MY_RATINGS } from "../../config/fieldOptions";
import { bookUnitPayload } from "../../lib/payloads";

const lineageLinkCls =
  "text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition";


// The viewer's own rating of and remark on one unit, saved through
// PUT /api/me/book-units/{unit_id} (self.list): the rating as soon as it is
// picked, the remark when the field loses focus. Neither is the unit's, so the
// catalogue editor has no control for either.
function UnitPersonalControls({ unit, bookPublicId }) {
  const { mutateAsync } = useSaveMyBookUnit(bookPublicId);
  const { showToast } = useToast();
  const [rating, setRating] = useState(unit.my_rating || "");
  const [remark, setRemark] = useState(unit.remark || "");
  // What the server holds, so a blur with nothing new to say sends nothing.
  // A refetched unit with other values remounts this (see its key).
  const [savedRemark, setSavedRemark] = useState(unit.remark || "");

  async function save(data, message) {
    try {
      const saved = await mutateAsync({ unitId: unit.system_id, data });
      if ("remark" in data) setSavedRemark(saved?.remark || "");
      showToast("success", message);
    } catch (err) {
      showToast("error", err.message || "Save failed");
    }
  }

  return (
    <>
      <select
        className={`${SELECT_CLS} w-20 shrink-0`}
        value={rating}
        aria-label={`My rating for ${unit.display_key}`}
        onChange={(e) => {
          setRating(e.target.value);
          save({ my_rating: e.target.value || null }, "Rating saved");
        }}
      >
        <option value="">—</option>
        {MY_RATINGS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      <input
        className={`${SELECT_CLS} flex-1 min-w-0`}
        value={remark}
        placeholder="Remark"
        aria-label={`My remark for ${unit.display_key}`}
        onChange={(e) => setRemark(e.target.value)}
        onBlur={() => {
          if (remark !== savedRemark)
            save({ remark: remark || null }, "Remark saved");
        }}
      />
    </>
  );
}

// The book's units: the catalogue editor for a manage.catalog holder, and
// the list of units for everyone else. A self.list holder's list carries a
// rating and a remark control on each unit, so an account holding both keys
// gets the editor and that list.
function BookUnitsCard({ book, isAdmin, onSave }) {
  const { ownData } = useViewScope();
  const [items, setItems] = useState(book.units || []);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems(book.units || []);
    setDirty(false);
  }, [book.units]);

  function handleSave() {
    onSave({ units: items.map(bookUnitPayload) });
    setDirty(false);
  }

  function handleCancel() {
    setItems(book.units || []);
    setDirty(false);
  }

  const hasUnits = (book.units || []).length > 0;
  // Read-only viewers see nothing when there are no units — an empty
  // "Units" card would just be a title over a blank box. Admins still get
  // the editor (with its own "+ Add" control) so they can create the first
  // one.
  if (!isAdmin && !hasUnits) return null;
  const showList = hasUnits && (!isAdmin || ownData);

  return (
    <Slip title="Units">
      <div className="space-y-4">
        {isAdmin && (
          <>
            <BookUnitsEditor
              items={items}
              bookType={book.type}
              onChange={(v) => {
                setItems(v);
                setDirty(true);
              }}
            />
            {dirty && (
              <div className="flex gap-2 pt-3 border-t border-border">
                <Button type="button" kind="primary" size="sm" onClick={handleSave}>
                  Save
                </Button>
                <Button type="button" size="sm" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            )}
          </>
        )}
        {showList && (
          <div
            className={`space-y-1.5${isAdmin ? " pt-3 border-t border-border" : ""}`}
          >
            {isAdmin && <Eyebrow>My ratings</Eyebrow>}
            {(book.units || []).map((u) => (
              <div key={u.system_id} className="flex flex-wrap items-center gap-2">
                <UnitCoverThumb unit={u} />
                <Chip className="shrink-0">{u.display_key}</Chip>
                {(u.name_cn || u.name_en) && (
                  <span className="text-sm text-text">
                    {[u.name_cn, u.name_en].filter(Boolean).join(" / ")}
                  </span>
                )}
                {u.unit_kind === "arc" && u.ch_count != null && (
                  <span className="text-xs font-mono text-text-faint">
                    {u.ch_count} ch
                  </span>
                )}
                <UnitReleaseDates unit={u} />
                {ownData && (
                  <UnitPersonalControls
                    key={`${u.my_rating ?? ""}|${u.remark ?? ""}`}
                    unit={u}
                    bookPublicId={book.public_id}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Slip>
  );
}
const LIST_OPTIONS = { params: { limit: 2000 } };

export default function Book() {
  const { publicId } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showToast } = useToast();

  const [book, setBook] = useState(null);
  const [autofilling, setAutofilling] = useState(false);

  const bookQuery = useMediaItem("book", publicId);
  useCanonicalPath("book", bookQuery.data);
  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = bookQuery.data?.system_id;
  const { ownData } = useViewScope();
  const franchiseQuery = useMediaList("franchise", LIST_OPTIONS);
  const seriesQuery = useMediaList("series", LIST_OPTIONS);
  const allBooksQuery = useMediaList("book", LIST_OPTIONS);
  const { setMediaItem, fetchMediaItem, invalidateMedia } =
    useMediaCacheUpdate("book", publicId);
  const castingQuery = useCasting("book", book?.system_id);
  const cast = castingQuery.data?.cast || [];

  useEffect(() => {
    if (bookQuery.data) setBook(bookQuery.data);
  }, [bookQuery.data]);

  const franchises = franchiseQuery.data || [];
  const seriesList = seriesQuery.data || [];
  const franchise = useMemo(
    () =>
      book?.franchise_id
        ? franchises.find((f) => f.system_id === book.franchise_id) || null
        : null,
    [franchises, book?.franchise_id],
  );
  const series = useMemo(
    () =>
      book?.series_id
        ? seriesList.find((s) => s.system_id === book.series_id) || null
        : null,
    [book?.series_id, seriesList],
  );
  const loading =
    bookQuery.isLoading || franchiseQuery.isLoading || seriesQuery.isLoading;
  const error =
    bookQuery.error?.message ||
    franchiseQuery.error?.message ||
    seriesQuery.error?.message ||
    null;

  // The viewer's own values (status, rating, progress, plan flags) go through /api/me;
  // saveRelease is the toolbar's release step, the work's half through the
  // catalogue PATCH. performPatch below is that PATCH, for the units editor.
  const { saveOwn, saveRelease } = useOwnTrackerSave("book", {
    entry: book,
    setEntry: setBook,
    setMediaItem,
    fetchMediaItem,
  });

  async function performPatch(payload, msg) {
    if (!isAdmin) return;
    setBook((prev) => ({ ...prev, ...payload }));
    try {
      const res = await fetch(endpoints.resource("book").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Sync failed");
      const updated = await res.json();
      // `book` is still the pre-write row here: this closure never saw the
      // optimistic update. A progress step can finish the entry.
      showToast("success", progressToast(book, updated, msg || "Saved"));
      setBook(updated);
      setMediaItem(updated);
    } catch {
      showToast("error", "Update failed");
      fetchMediaItem();
    }
  }

  async function handleAutofill() {
    setAutofilling(true);
    try {
      const res = await fetch(
        endpoints.dataControl.replaceSingle("book", system_id),
        {
          method: "POST",
          credentials: "include",
        },
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
  const titleMain = book
    ? book.book_name_cn ||
      book.book_name_en ||
      book.book_name_roman ||
      book.book_name_jp ||
      book.book_name_alt ||
      "Unknown"
    : null;
  usePageTitle(loading || error ? null : titleMain);

  if (loading) {
    return <MediaLoadingState isLoading loadingText="Loading details..." />;
  }

  if (error || !book) {
    return (
      <MediaLoadingState
        error={error || "Book not found"}
        errorTitle="Error Loading Book"
      />
    );
  }

  const titleSub =
    book.book_name_en && book.book_name_en !== titleMain
      ? book.book_name_en
      : null;

  const imageUrl = getCoverUrl(book.cover_image_file);

  const franchiseName = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_roman
    : null;

  // The rule along the cover shows whichever counter the entry is set to.
  // It used to read ch_fin/ch_total unconditionally, which is how a finished
  // 11-volume light novel came to display "CHAPTERS 0 / 110".
  const progressMode = effectiveProgressDisplay(book);
  const arcCount = (book.units || []).filter((u) => u.unit_kind === "arc").length;
  const [progressLabel, progressFin, progressTotal] =
    progressMode === "vol_tw"
      ? ["Volumes", book.vol_fin ?? 0, book.vol_total_tw ?? book.vol_total_original ?? null]
      : progressMode === "vol_original"
        ? ["Volumes", book.vol_fin ?? 0, book.vol_total_original ?? book.vol_total_tw ?? null]
        : progressMode === "arc"
          ? ["Arcs", book.arc_fin ?? 0, arcCount || null]
          : // "ch" and "arc_ch" both read the absolute chapter pair; with arc
            // rows it is derived from them, so the two agree by construction.
            ["Chapters", book.ch_fin ?? 0, book.ch_total ?? null];
  const progress = progressTotal
    ? progressFin / progressTotal
    : progressFin > 0
      ? 1
      : 0;
  const progressPct = progressTotal ? Math.round(progress * 100) : null;

  const eyebrow = ["Book", book.region, book.type, book.serialization_status]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <DetailContents>
      {/* Breadcrumb: a catalogue path, set in mono */}
      <div className="mb-8 flex items-center justify-between gap-3">
        <nav
          className="font-mono text-[11px] text-text-faint min-w-0 flex items-center gap-3"
          aria-label="Breadcrumb"
        >
          <Link to="/library/book" className="hover:text-brand transition">
            Book
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-text-muted truncate max-w-xs normal-case tracking-normal">
            {titleMain}
          </span>
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <NeedsWorkBadge ownerType="book" ownerId={system_id} />
          <ReportProblemButton
            targetType="book"
            targetId={system_id}
            targetLabel={titleMain}
          />
        </div>
      </div>

      {/* Admin toolbar: a plain instrument strip */}
      {isAdmin && (
        <div className="border border-border-strong border-dashed px-3 py-2 flex flex-wrap gap-3 items-center justify-between mb-8">
          <Eyebrow className="text-[11px] text-text-muted">
            Admin
          </Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/modify?id=${system_id}&type=book`)}>
              Edit
            </Button>
            <Button
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  const res = await fetch(endpoints.resource("book").complete(system_id), {
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
            <MarkReleaseButton type="book" entry={book} title={titleMain} canTrack={ownData} onPatch={saveRelease} />
            <Button kind="primary" onClick={handleAutofill} disabled={autofilling}>
              {autofilling ? "Autofilling…" : "Autofill & update"}
            </Button>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* ========== LEFT COLUMN ========== */}
        <div className="lg:col-span-1 space-y-6">
          {/* Poster: the cover and the rating stamp */}
          <div className="flex border border-border bg-surface">
            <div className="relative flex-1 min-w-0">
              <RatingStamp
                rating={book.my_rating}
                size="md"
                tilt
                className="absolute top-2 right-2 z-10"
              />
              <div className="w-full aspect-[2/3] bg-surface-2 overflow-hidden">
                <LazyImage
                  src={imageUrl}
                  alt="Cover"
                  className="w-full h-full object-cover"
                  style={focusStyle(book.cover_image_focus)}
                  onError={(e) => {
                    e.target.src = FALLBACK_SVG;
                  }}
                />
              </div>
              {/* Progress rule along the bottom edge of the cover */}
              <ProgressRule value={progress} />
              <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] text-text-faint">
                <span>{progressLabel}</span>
                <span className="text-text">
                  {progressFin} / {progressTotal ?? "?"}
                  {progressPct != null ? ` · ${progressPct}%` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Sources */}
          <SourcesCard
            sources={book.sources}
            coverUrl={imageUrl}
            mediaType="book"
            malLink={book.mal_link}
            openLibraryLink={book.openlibrary_link}
            serializationPlatform={book.serialization_platform}
          />

          <RelationsSection mediaType="book" entryId={book.system_id} />
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-3 space-y-10">
          {/* Header */}
          <header>
            <div className="font-mono text-[11px] text-text-muted mb-3">
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
            <ContentLabelChips labels={book.content_labels} className="mb-6" />


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

            {/* Score Block */}
            <ScoreBlock
              malScore={book.mal_rating}
              malRank={book.mal_rank}
              anilistScore={book.anilist_rating}
              anilistRank={book.anilist_rank}
              anilistPopularityRank={book.anilist_popularity_rank}
            />
          </header>

          {/* Where this entry sits in the orders the viewer follows. */}
          <TocSection id="orders" label="Orders">
            <FollowedOrderPanel entryId={book.system_id} />
          </TocSection>

          {/* My Tracker Block */}
          <TocSection id="tracker" label="My tracker">
            <BookTrackerBlock
              book={book}
              canTrack={ownData}
              onChChange={(v) =>
                saveOwn({ ch_fin: v }, "Chapter progress saved")
              }
              onVolChange={(v) =>
                saveOwn({ vol_fin: v }, "Volume progress saved")
              }
              onArcProgressChange={(next) =>
                saveOwn(next, "Arc progress saved")
              }
              onStatusChange={(v) =>
                saveOwn({ reading_status: v }, "Status updated")
              }
              onRatingChange={(v) =>
                saveOwn({ my_rating: v || null }, "Rating saved")
              }
              onReadNextChange={(v, msg) => saveOwn({ read_next: v }, msg)}
              onToRerereadChange={(v, msg) => saveOwn({ to_reread: v }, msg)}
              onPingedChange={(v) =>
                saveOwn({ is_pinged: v }, v ? "Pinned to the dashboard" : "Unpinned")
              }
              onProgressDisplayChange={(v) =>
                saveOwn({ progress_display: v || null }, "Progress display updated")
              }
            />
          </TocSection>

          {/* Detail Cards */}
          <div className="space-y-6">
            <TocSection id="naming" label="Naming">
              <NamingCard type="book" item={book} />
            </TocSection>
            <TocSection id="information" label="Information">
              <InfoCard
                title="Information"
                fields={[
                  [
                    { label: "Region", value: book.region },
                    { label: "Type", value: book.type },
                    { label: "Version", value: book.version },
                  ],
                  [
                    { label: "本傳 / 外傳", value: book.is_main },
                    {
                      label: "Serialization Status",
                      value: book.serialization_status,
                    },
                  ],
                  // Shown verbatim: a year-only date must not be dressed up
                  // as a month.
                  [
                    { label: "Release Date JP", value: book.release_date_jp || null },
                    { label: "Release Date TW", value: book.release_date_tw || null },
                    { label: "End Date", value: book.end_date || null },
                  ],
                  [
                    {
                      label: "Total Volumes (JP/KR)",
                      value:
                        book.vol_total_original != null
                          ? String(book.vol_total_original)
                          : null,
                    },
                    {
                      label: "Vol Total (TW)",
                      value:
                        book.vol_total_tw != null
                          ? String(book.vol_total_tw)
                          : null,
                    },
                  ],
                  [
                    {
                      label: "Arc Total",
                      value:
                        book.arc_total != null ? String(book.arc_total) : null,
                    },
                    {
                      label: "Chapter Total",
                      value:
                        book.ch_total != null ? String(book.ch_total) : null,
                    },
                  ],
                ]}
              />
            </TocSection>
            <TocSection id="genres" label="Genres">
              <GenresCard item={book} />
            </TocSection>
            {/* Production Card */}
            <TocSection id="production" label="Production">
              {(book.author ||
                book.illustrator ||
                book.publisher_tw ||
                book.publisher_refs?.length > 0) && (
                <InfoCard
                  title="Production"
                  fields={[
                    ...(book.author
                      ? [
                          {
                            label: creditLabel(book, "author", "Author"),
                            value: creditValue(book, "author", book.author),
                          },
                        ]
                      : []),
                    ...(book.illustrator
                      ? [
                          {
                            label: creditLabel(
                              book,
                              "illustrator",
                              "Illustrator",
                            ),
                            value: creditValue(
                              book,
                              "illustrator",
                              book.illustrator,
                            ),
                          },
                        ]
                      : []),
                    ...(book.publisher_tw || book.publisher_refs?.length
                      ? [
                          {
                            label: publisherLabel(book, "台灣出版社"),
                            value: publisherValue(book),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
            </TocSection>
          </div>

          {/* Cast */}
          <TocSection id="cast" label="Cast">
            <CastSection cast={cast} />
          </TocSection>

          {/* Units */}
          <TocSection id="units" label="Units">
            <BookUnitsCard
              book={book}
              isAdmin={isAdmin}
              onSave={(payload) => performPatch(payload, "Units saved")}
            />
          </TocSection>

          {/* Structured Notes */}
          <BookNotes
            key={book.system_id}
            book={book}
            series={series}
            franchise={franchise}
          />
        </div>
      </div>
    </DetailContents>
  );
}
