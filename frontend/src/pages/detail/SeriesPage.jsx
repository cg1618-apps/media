// Frontend: page component file for SeriesPage.
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { RESTRICTED_FAMILY, canSeeGatedType, inFranchiseFamily } from "../../lib/gatedTypes";
import { buildMediaTabs } from "../../lib/mediaTabs";
import { useToast } from "../../hooks/useToast";
import { getDisplayName } from "../../utils/media";
import { getSeriesCover } from "../../lib/covers";
import { HubLoading, HubError } from "../../components/hub/HubStates";
import {
  HubShell,
  SELECT_CLS,
  Crumbs,
  AdminStrip,
  HeroCover,
  Field,
  HubTabs,
  Section,
} from "../../components/hub/HubChrome";
import { Eyebrow, Slip, Chip } from "../../components/ui/primitives";
import BelongingTab from "../../components/hub/BelongingTab";
import { useHubTabViews } from "../../hooks/useHubTabViews";
import NeedsWorkBadge from "../../components/needs-work/NeedsWorkBadge";
import ReportProblemButton from "../../components/requests/ReportProblemButton";
import OrderSection from "../../components/tracker/OrderSection";
import HubCharacters from "../../components/hub/HubCharacters";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import SeriesNotes from "./SeriesNotes";
import RelationGraph from "../../components/relations/RelationGraph";
import PlanKindToggles, {
  kindLabel,
  applicableTypes,
} from "../../components/plan/PlanKindToggles";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRatingSaver } from "../../api/mutations/useMyRatingMutations";
import { entityPath } from "../../lib/entityPath";

// A card's write hands back the whole row; it replaces the one in its list.
function replaceEntry(setEntries, updated) {
  setEntries((list) =>
    list.map((e) => (e.system_id === updated.system_id ? updated : e)),
  );
}

// An entry list is only usable as an array. Anything else - an error body, an
// unexpected shape - collapses to empty so the page still renders.
async function asList(res) {
  if (!res.ok) return [];
  try {
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export default function SeriesPage() {
  const { publicId } = useParams();
  const auth = useAuth();
  const { isAdmin, has } = auth;
  // A guest's view of a hub (the keys members hold): without self.list the
  // viewer has no rating or expectation of the series and no "my rating" to
  // sort by, so neither is drawn; without view.character there is no
  // Characters tab, and HubCharacters never asks /api/character/ for one.
  const { ownData } = useViewScope();
  const showCharacters = has("view.character");
  // Gated: a series under a franchise of the restricted family is hidden from
  // a session that cannot see the type, so only a session that can asks for
  // its h-comics.
  const canSeeHComic = canSeeGatedType(auth, "h-comic");
  const canSeeHGame = canSeeGatedType(auth, "h-game");
  const canSeeHentai = canSeeGatedType(auth, "hentai");
  const { showToast } = useToast();

  // ── data ──────────────────────────────────────────────────────────────────
  const [series, setSeries] = useState(null);
  const [parentFranchise, setParentFranchise] = useState(null);
  const [animeList, setAnimeList] = useState([]);
  const [movieList, setMovieList] = useState([]);
  const [tvShowList, setTvShowList] = useState([]);
  const [cartoonList, setCartoonList] = useState([]);
  const [mangaList, setMangaList] = useState([]);
  const [bookList, setBookList] = useState([]);
  const [comicList, setComicList] = useState([]);
  const [gameList, setGameList] = useState([]);
  const [hComicList, setHComicList] = useState([]);
  const [hGameList, setHGameList] = useState([]);
  const [hentaiList, setHentaiList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── admin editable ─────────────────────────────────────────────────────────
  const [rating, setRating] = useState("");
  const [expectation, setExpectation] = useState("");
  const [rewatchMarked, setRewatchMarked] = useState(new Set());

  // ── tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(null);

  // ── media tabs: each tab's sort, filters and grouping ─────────────────────
  const { viewOf, updateView } = useHubTabViews("series");

  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = series?.system_id;
  const saveMyRating = useMyRatingSaver("series", system_id, setSeries);

  useCanonicalPath("series", series);

  // ── fetch ─────────────────────────────────────────────────────────────────
  // Eight entry lists, not nine: anime_movies has no series_id column, so an
  // anime movie can only ever be reached through its franchise.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    async function load() {
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. Every list filter below still speaks UUIDs, so they have
        // to wait for the row the detail call resolves rather than run beside
        // it.
        const sRes = await fetch(
          endpoints.resource("series").detail(publicId),
          { credentials: "include" },
        );
        if (!sRes.ok) throw new Error("Series not found");
        // The series itself is load-bearing, so a missing one still throws to
        // the error card. A failing entry list is not: parsing FastAPI's error
        // body into a list state would hand the filter memos a non-array and
        // blank the whole page, so each list degrades to empty instead.
        const s = await sRes.json();
        const resolvedId = s.system_id;
        const [aRes, mRes, tvRes, cRes, mgRes, nvRes, cmRes, gmRes, pnRes] =
          await Promise.all([
          fetch(buildUrl(endpoints.resource("anime").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("movie").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("tv-show").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("cartoon").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("manga").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("book").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("comic").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch(buildUrl(endpoints.resource("game").list(), { series_id: resolvedId }), {
            credentials: "include",
          }),
          fetch("/api/plan-next/?scope=series&kind=rewatch", {
            credentials: "include",
          }),
        ]);
        const [a, m, tv, c, mg, nv, cm, gm] = await Promise.all(
          [aRes, mRes, tvRes, cRes, mgRes, nvRes, cmRes, gmRes].map(asList),
        );
        const pn = pnRes.ok ? await pnRes.json() : [];
        if (cancelled) return;
        setSeries(s);
        setAnimeList(a);
        setMovieList(m);
        setTvShowList(tv);
        setCartoonList(c);
        setMangaList(mg);
        setBookList(nv);
        setComicList(cm);
        setGameList(gm);
        setRewatchMarked(
          new Set(
            pn
              .filter((row) => row.target_id === s.system_id)
              .map((row) => row.media_type),
          ),
        );
        setRating(s.my_rating || "");
        setExpectation(s.series_expectation || "");
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  // The series' h-comics, apart from the load above because the question
  // "may this session see them" is answered by /api/auth/me, which can land
  // after this page mounts. Asked only when the answer is yes.
  const seriesId = series?.system_id;
  useEffect(() => {
    if (!canSeeHComic || !seriesId) return undefined;
    let cancelled = false;
    fetch(
      buildUrl(endpoints.resource("h-comic").list(), { series_id: seriesId }),
      { credentials: "include" },
    )
      .then(asList)
      .then((list) => {
        if (!cancelled) setHComicList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSeeHComic, seriesId]);

  // The series' h-games and hentai, the same way - and only under a franchise
  // of the restricted family, the one kind that can hold them, which the
  // parent franchise (resolved below for the breadcrumb) says.
  const parentInRestrictedFamily = inFranchiseFamily(
    parentFranchise?.franchise_type,
    RESTRICTED_FAMILY,
  );
  useEffect(() => {
    if (!canSeeHGame || !seriesId || !parentInRestrictedFamily) return undefined;
    let cancelled = false;
    fetch(
      buildUrl(endpoints.resource("h-game").list(), { series_id: seriesId }),
      { credentials: "include" },
    )
      .then(asList)
      .then((list) => {
        if (!cancelled) setHGameList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSeeHGame, seriesId, parentInRestrictedFamily]);

  useEffect(() => {
    if (!canSeeHentai || !seriesId || !parentInRestrictedFamily) return undefined;
    let cancelled = false;
    fetch(
      buildUrl(endpoints.resource("hentai").list(), { series_id: seriesId }),
      { credentials: "include" },
    )
      .then(asList)
      .then((list) => {
        if (!cancelled) setHentaiList(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canSeeHentai, seriesId, parentInRestrictedFamily]);

  // Media types this series actually holds entries for. PlanKindToggles
  // further filters this down to what rewatch allows at series scope (movie,
  // tv-show, book, comic - anime and cartoon rewatch at franchise scope only).
  const seriesMediaTypes = useMemo(() => {
    const list = [];
    if (animeList.length) list.push("anime");
    if (movieList.length) list.push("movie");
    if (tvShowList.length) list.push("tv-show");
    if (cartoonList.length) list.push("cartoon");
    if (mangaList.length) list.push("manga");
    if (bookList.length) list.push("book");
    if (comicList.length) list.push("comic");
    if (gameList.length) list.push("game");
    if (hComicList.length) list.push("h-comic");
    if (hGameList.length) list.push("h-game");
    if (hentaiList.length) list.push("hentai");
    return list;
  }, [
    animeList,
    movieList,
    tvShowList,
    cartoonList,
    mangaList,
    bookList,
    comicList,
    gameList,
    hComicList,
    hGameList,
    hentaiList,
  ]);

  const seriesApplicableRewatchTypes = useMemo(
    () => applicableTypes("rewatch", "series", seriesMediaTypes),
    [seriesMediaTypes],
  );

  // Only this group filters which media entries are listed. It is shown under
  // its own label, apart from the extras below. A series carries no type, so
  // a tab appears purely because its list holds something. The tab's count
  // and the hero's totals come from the same rows. Game is the last ungated
  // tab; the gated types follow it.
  const mediaRows = useMemo(
    () =>
      series
        ? [
            { label: "Anime", type: "anime", entries: animeList, setEntries: setAnimeList },
            { label: "Manga", type: "manga", entries: mangaList, setEntries: setMangaList },
            { label: "Book", type: "book", entries: bookList, setEntries: setBookList },
            { label: "Comic", type: "comic", entries: comicList, setEntries: setComicList },
            { label: "Movies", type: "movie", entries: movieList, setEntries: setMovieList },
            { label: "TV Shows", type: "tv-show", entries: tvShowList, setEntries: setTvShowList },
            { label: "Cartoons", type: "cartoon", entries: cartoonList, setEntries: setCartoonList },
            { label: "Game", type: "game", entries: gameList, setEntries: setGameList },
            // Gated types last, after every ungated one.
            { label: "H-Comic", type: "h-comic", entries: hComicList, setEntries: setHComicList },
            { label: "H-Game", type: "h-game", entries: hGameList, setEntries: setHGameList },
            { label: "Hentai", type: "hentai", entries: hentaiList, setEntries: setHentaiList },
          ]
        : [],
    [
      series,
      animeList,
      mangaList,
      bookList,
      comicList,
      gameList,
      hComicList,
      hGameList,
      hentaiList,
      movieList,
      tvShowList,
      cartoonList,
    ],
  );
  const {
    tabs: mediaTabs,
    countOf: getTabCount,
    total: totalEntries,
    completed: completedCount,
  } = useMemo(() => buildMediaTabs(mediaRows), [mediaRows]);

  // Always offered, and never dependent on the entry lists: each section
  // reports whether it holds anything, and an admin needs the entry point
  // precisely when it is still empty.
  const extraTabs = useMemo(
    () =>
      series
        ? [
            ...(showCharacters ? ["Characters"] : []),
            "Order",
            "Relations",
            "Notes",
          ]
        : [],
    [series, showCharacters],
  );

  const tabs = useMemo(() => [...mediaTabs, ...extraTabs], [mediaTabs, extraTabs]);

  useEffect(() => {
    if (tabs.length > 0 && activeTab === null) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // The media row the open tab shows, if the open tab is a media one.
  const activeRow = mediaTabs.includes(activeTab)
    ? mediaRows.find((row) => row.label === activeTab)
    : null;


  // Optional parent tier: resolve the franchise name for the breadcrumb.
  useEffect(() => {
    const fid = series?.franchise_id;
    if (!fid) {
      setParentFranchise(null);
      return;
    }
    let cancelled = false;
    fetch(endpoints.resource("franchise").detail(fid), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (!cancelled) setParentFranchise(f);
      })
      .catch(() => {
        if (!cancelled) setParentFranchise(null);
      });
    return () => {
      cancelled = true;
    };
  }, [series?.franchise_id]);

  async function handleRewatchToggle(mediaType, next) {
    if (!series) return;
    try {
      if (next) {
        const res = await fetch("/api/plan-next/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            media_type: mediaType,
            scope: "series",
            kind: "rewatch",
            target_id: series.system_id,
          }),
        });
        if (!res.ok && res.status !== 409) return;
      } else {
        const params = new URLSearchParams({
          scope: "series",
          media_type: mediaType,
          kind: "rewatch",
          target_id: series.system_id,
        });
        const res = await fetch(`/api/plan-next/target?${params}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) return;
      }
      setRewatchMarked((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(mediaType);
        else nextSet.delete(mediaType);
        return nextSet;
      });
    } catch {
      showToast("error", "Network error.");
    }
  }


  // ── Completion ────────────────────────────────────────────────────────────
  // totalEntries and completedCount come from the media tab rows above.
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  // ── loading / error ───────────────────────────────────────────────────────
  // The heading's title, which the browser tab shows too.
  const mainTitle = series
    ? series.series_name_cn ||
      series.series_name_en ||
      series.series_name_alt ||
      series.series_name_roman ||
      series.series_name_jp ||
      "Unknown Series"
    : null;
  usePageTitle(loading || error ? null : mainTitle);

  if (loading) return <HubLoading label="Loading Series Hub..." />;

  if (error)
    return (
      <HubError
        title="Error Loading Series"
        message={error}
        backTo="/library/franchise"
        backLabel="Franchise Library"
      />
    );

  // Combined flat entry list, used only for hero cover resolution: search
  // every loaded tab's entries for cover_entry_id, then fall back to the
  // newest one with a cover image.
  const allEntries = [
    ...animeList,
    ...movieList,
    ...tvShowList,
    ...cartoonList,
    ...mangaList,
    ...bookList,
    ...comicList,
    ...gameList,
    ...hComicList,
    ...hGameList,
    ...hentaiList,
  ];
  const cover = getSeriesCover(series, allEntries);

  const subTitles = [
    { label: "EN", value: series.series_name_en },
    { label: "JP", value: series.series_name_jp },
    { label: "Romaji", value: series.series_name_roman },
    { label: "Alt", value: series.series_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);

  // A series always hangs off a franchise, so the franchise library is the
  // root of the trail even when the parent has not loaded.
  const trail = [
    { to: "/library/franchise", label: "Franchise" },
    ...(parentFranchise
      ? [
          {
            to: entityPath("franchise", parentFranchise),
            label: getDisplayName(parentFranchise, "franchise"),
          },
        ]
      : []),
  ];

  const eyebrow = [
    "Series",
    `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
  ].join("  ·  ");

  return (
    <HubShell>
      <Crumbs
        trail={trail}
        current={mainTitle}
        action={
          <div className="flex shrink-0 items-center gap-3">
            <NeedsWorkBadge ownerType="series" ownerId={system_id} />
            <ReportProblemButton
              targetType="series"
              targetId={system_id}
              targetLabel={mainTitle}
            />
          </div>
        }
      />

      {isAdmin && <AdminStrip editId={system_id} />}

      {/* Hero: the cover, then the identity block */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1">
          <HeroCover
            cover={cover}
            rating={ownData ? series.my_rating : null}
            done={completedCount}
            total={totalEntries}
            pct={completionPct}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <header>
            <div className="font-mono text-[11px] text-text-muted mb-3">
              {eyebrow}
            </div>
            <h1 className="font-display text-5xl sm:text-6xl font-semibold text-text leading-[0.95] mb-2">
              {mainTitle}
            </h1>
            {subTitles.length > 0 && (
              <div className="space-y-0.5 mb-4">
                {subTitles.map(({ label, value }) => (
                  <p
                    key={label}
                    className="text-lg text-text-muted truncate flex items-baseline gap-2"
                  >
                    <Eyebrow className="shrink-0">{label}</Eyebrow>
                    {value}
                  </p>
                ))}
              </div>
            )}

            {/* Lineage: the franchise above */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
              <div className="flex items-baseline gap-2">
                <Eyebrow>Franchise</Eyebrow>
                {parentFranchise ? (
                  <Link
                    to={entityPath("franchise", parentFranchise)}
                    className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
                  >
                    {getDisplayName(parentFranchise, "franchise")}
                  </Link>
                ) : (
                  <span className="text-text-faint">None</span>
                )}
              </div>
            </div>

            {/* A series' labels hide the series AND every entry in it, so
                they are said in their own row, as the Franchise hub says its
                own. */}
            <ContentLabelChips
              labels={series.content_labels}
              note="Hides this series and every entry in it."
              className="mt-4"
            />

            {((ownData && series.series_expectation) ||
              rewatchMarked.size > 0) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {ownData && series.series_expectation && (
                  <Chip>Expectation · {series.series_expectation}</Chip>
                )}
                {Array.from(rewatchMarked).map((mediaType) => (
                  <Chip key={`rewatch-${mediaType}`}>
                    {kindLabel("rewatch", [mediaType])} ·{" "}
                    {mediaType.replace("-", " ")}
                  </Chip>
                ))}
              </div>
            )}
          </header>

          {/* The rating and expectation are the viewer's own (self.list);
              the rewatch controls stay the catalogue manager's. */}
          {(ownData || isAdmin) && (
            <Slip title="Personal Status">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {ownData && (
                  <>
                    <Field label="Overall rating">
                      <select
                        value={rating}
                        onChange={(e) => {
                          setRating(e.target.value);
                          saveMyRating(
                            { my_rating: e.target.value || null },
                            "Rating saved",
                          );
                        }}
                        className={`${SELECT_CLS} w-full`}
                      >
                        <option value="">Not rated</option>
                        {["S", "A+", "A", "B", "C", "D", "E", "F"].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Expectation">
                      <select
                        value={expectation}
                        onChange={(e) => {
                          setExpectation(e.target.value);
                          saveMyRating(
                            { expectation: e.target.value || null },
                            "Expectation saved",
                          );
                        }}
                        className={`${SELECT_CLS} w-full`}
                      >
                        <option value="">None</option>
                        {["Highest", "High", "Medium", "Low"].map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </>
                )}
                {isAdmin && seriesApplicableRewatchTypes.length > 0 && (
                  <Field
                    label={kindLabel("rewatch", seriesApplicableRewatchTypes)}
                    className="sm:col-span-2"
                  >
                    <PlanKindToggles
                      kind="rewatch"
                      scope="series"
                      mediaTypes={seriesMediaTypes}
                      marked={rewatchMarked}
                      onToggle={handleRewatchToggle}
                    />
                  </Field>
                )}
              </div>
            </Slip>
          )}
        </div>
      </div>

      {/*
        Tab bar, in two labelled groups: "Media" picks which entries the list
        below shows, "Extras" opens material that belongs to the series as a
        whole. The Media group disappears for a series with no entries yet.
      */}
      <HubTabs
        groups={[
          { label: "Media", tabs: mediaTabs, counted: true },
          { label: "Extras", tabs: extraTabs },
        ]}
        activeTab={activeTab}
        onSelect={setActiveTab}
        getCount={getTabCount}
      />

      {/* ── Media tab content: one tab of entries, sorted and filtered ──── */}
      {activeRow && (
        <BelongingTab
          key={activeRow.type}
          title={activeRow.label}
          type={activeRow.type}
          scope="series"
          entries={activeRow.entries}
          view={viewOf(activeRow.type)}
          onViewChange={(update) => updateView(activeRow.type, update)}
          onUpdated={(updated) => replaceEntry(activeRow.setEntries, updated)}
        />
      )}

      {/* ── Characters tab content ───────────────────────────────────────── */}
      {showCharacters && activeTab === "Characters" && (
        <Section
          title="Characters"
        >
          <HubCharacters scope="series" tierId={system_id} />
        </Section>
      )}

      {/* ── Order tab content ──────────────────────────────────────── */}
      {activeTab === "Order" && (
        <Section
          title="Order"
        >
          <OrderSection seriesId={system_id} />
        </Section>
      )}

      {/* ── Relations tab content ────────────────────────────────────────── */}
      {activeTab === "Relations" && (
        <Section
          title="Relations"
        >
          {/* Read-only everywhere outside the admin Relations page, for admins
              too: this is a view of the structure, and curating it belongs in
              one place rather than scattered across every hub. The link is
              the way there, already scoped to this series. */}
          {isAdmin && (
            <div className="flex justify-end mb-2">
              <Link
                to={`/relations?owner=series:${system_id}`}
                className="text-xs font-medium text-text-muted hover:text-text whitespace-nowrap"
              >
                Edit relations
              </Link>
            </div>
          )}
          <RelationGraph readOnly scopeType="series" scopeId={system_id} />
        </Section>
      )}

      {/* ── Notes tab content ─────────────────────────────────────────────── */}
      {activeTab === "Notes" && (
        <Section
          title="Notes"
        >
          <SeriesNotes
            series={series}
          />
        </Section>
      )}

      {/* No entries at all. Keyed off the media tabs, not every tab: Watch
          Order and Notes are always offered, so `tabs` is never empty. */}
      {mediaTabs.length === 0 && !loading && (
        <section className="border border-dashed border-border-strong px-4 py-6 text-center">
          <div className="font-mono text-[11px] text-text-muted mb-1">
            No entries
          </div>
          <p className="text-sm text-text-faint">
            Nothing is filed under this series yet. Assign entries to it from the Modify page.
          </p>
        </section>
      )}
    </HubShell>
  );
}
