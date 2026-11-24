// Frontend: page component file for FranchisePage.
import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { endpoints } from "../../api/endpoints";
import { buildUrl } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "../../hooks/useToast";
import { getDisplayName, parseTypes } from "../../utils/media";
import { getFranchiseCover, withMediaType } from "../../lib/covers";
import { RESTRICTED_FAMILY, inFranchiseFamily } from "../../lib/gatedTypes";
import { buildMediaTabs } from "../../lib/mediaTabs";
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
import FranchiseNotes from "./FranchiseNotes";
import RelationGraph from "../../components/relations/RelationGraph";
import SizeGroupControls from "../../components/plan/SizeGroupControls";
import PlanKindToggles, {
  applicableTypes,
} from "../../components/plan/PlanKindToggles";
import { SIZE_GROUPS } from "../../config/planNextGroups";
import { effectiveBucket } from "../../utils/planNext";
import { usePageTitle } from "../../contexts/PageTitleContext";
import { useCanonicalPath } from "../../hooks/useCanonicalPath";
import { useViewScope } from "../../hooks/useViewScope";
import { useMyRatingSaver } from "../../api/mutations/useMyRatingMutations";
import { entityPath } from "../../lib/entityPath";
import ContentLabelChips from "../../components/info/ContentLabelChips";
import RelatedRecords from "../../components/info/RelatedRecords";

// The franchise hub's one name for the rewatch / reread / replay mark: a
// franchise mixes types, so no single verb fits all of them.
const REDO_LABEL = "To Redo";

// A card's write hands back the whole row; it replaces the one in its list.
function replaceEntry(setEntries, updated) {
  setEntries((list) =>
    list.map((e) => (e.system_id === updated.system_id ? updated : e)),
  );
}

export default function FranchisePage() {
  const { publicId } = useParams();
  const { isAdmin, has } = useAuth();
  const { showToast } = useToast();
  // A guest's view of a hub (the keys members hold): without self.list the
  // viewer has no rating or expectation of the franchise and no "my rating"
  // to sort by, so neither is drawn; without view.character there is no
  // Characters tab, and HubCharacters never asks /api/character/ for one.
  const { ownData } = useViewScope();
  const showCharacters = has("view.character");

  // ── data ──────────────────────────────────────────────────────────────────
  const [franchise, setFranchise] = useState(null);
  const [parentCollection, setParentCollection] = useState(null);
  const [seriesList, setSeriesList] = useState([]);
  const [animeList, setAnimeList] = useState([]);
  const [animeMovieList, setAnimeMovieList] = useState([]);
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
  const [plannedTypes, setPlannedTypes] = useState(new Set());
  const [rewatchMarked, setRewatchMarked] = useState(new Set());

  // ── tab ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState(null);

  // ── media tabs: each tab's sort, filters and grouping ─────────────────────
  const { viewOf, updateView } = useHubTabViews("franchise");

  // Everything past the lookup still speaks UUIDs; only the URL segment
  // changed. Resolved from the fetched row so the two can never disagree.
  const system_id = franchise?.system_id;
  const saveMyRating = useMyRatingSaver("franchise", system_id, setFranchise);

  useCanonicalPath("franchise", franchise);

  // ── fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    // Navigating hub -> hub reuses this component: reset the view and drop
    // any response that lands after the id has already changed.
    let cancelled = false;
    setLoading(true);
    setError(null);
    setActiveTab(null);
    async function load() {
      try {
        // The detail call takes the id straight from the URL, which is now a
        // public_id. Every list below filters on franchise_id, which is still
        // a UUID, so they have to wait for the row the detail call resolves
        // rather than run beside it.
        const fRes = await fetch(
          endpoints.resource("franchise").detail(publicId),
          { credentials: "include" },
        );
        if (!fRes.ok) throw new Error("Franchise not found");
        const franchiseData = await fRes.json();
        const resolvedId = franchiseData.system_id;
        // Only a franchise of the restricted family (H-Comic, Hentai, H-Game)
        // holds h-comics, hentai and h-games - an entry of any of them never
        // sits in any other, and the three may share one - and a session that
        // cannot see a gated type never reaches one. So each list is asked
        // for only where it can exist.
        const inRestrictedFamily = inFranchiseFamily(
          franchiseData.franchise_type,
          RESTRICTED_FAMILY,
        );
        const hComicFetch = inRestrictedFamily
          ? fetch(
              buildUrl(endpoints.resource("h-comic").list(), {
                franchise_id: resolvedId,
              }),
              { credentials: "include" },
            ).then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]);
        const hentaiFetch = inRestrictedFamily
          ? fetch(
              buildUrl(endpoints.resource("hentai").list(), {
                franchise_id: resolvedId,
              }),
              { credentials: "include" },
            ).then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]);
        const hGameFetch = inRestrictedFamily
          ? fetch(
              buildUrl(endpoints.resource("h-game").list(), {
                franchise_id: resolvedId,
              }),
              { credentials: "include" },
            ).then((r) => (r.ok ? r.json() : []))
          : Promise.resolve([]);
        const [
          sRes,
          aRes,
          amRes,
          mRes,
          tvRes,
          cRes,
          mgRes,
          nvRes,
          cmRes,
          gmRes,
          pnRes,
        ] =
          await Promise.all([
            fetch(buildUrl(endpoints.resource("series").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("anime").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("anime-movie").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("movie").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("tv-show").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("cartoon").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("manga").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("book").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("comic").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch(buildUrl(endpoints.resource("game").list(), { franchise_id: resolvedId }), {
              credentials: "include",
            }),
            fetch("/api/plan-next/?scope=franchise", { credentials: "include" }),
          ]);
        const [s, a, am, m, tv, c, mg, nv, cm, gm, pn] = await Promise.all([
          sRes.json(),
          aRes.json(),
          amRes.json(),
          mRes.json(),
          tvRes.json(),
          cRes.json(),
          mgRes.json(),
          nvRes.json(),
          cmRes.json(),
          gmRes.json(),
          pnRes.ok ? pnRes.json() : [],
        ]);
        const hc = await hComicFetch;
        const hg = await hGameFetch;
        const ht = await hentaiFetch;
        if (cancelled) return;
        setFranchise(franchiseData);
        setSeriesList(s);
        setAnimeList(a);
        setAnimeMovieList(am);
        setMovieList(m);
        setTvShowList(tv);
        setCartoonList(c);
        setMangaList(mg);
        setBookList(nv);
        setComicList(cm);
        setGameList(gm);
        setHComicList(hc);
        setHGameList(hg);
        setHentaiList(ht);
        setPlannedTypes(
          new Set(
            pn
              .filter(
                (row) =>
                  row.target_id === resolvedId &&
                  (row.kind ?? "next") === "next",
              )
              .map((row) => row.media_type),
          ),
        );
        setRewatchMarked(
          new Set(
            pn
              .filter(
                (row) =>
                  row.target_id === resolvedId && row.kind === "rewatch",
              )
              .map((row) => row.media_type),
          ),
        );
        setRating(franchiseData.my_rating || "");
        setExpectation(franchiseData.franchise_expectation || "");
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

  // ── type flags ────────────────────────────────────────────────────────────
  const types = useMemo(
    () => parseTypes(franchise?.franchise_type),
    [franchise],
  );
  const hasAnime = useMemo(() => types.includes("Anime"), [types]);
  const hasManga = useMemo(() => types.includes("Manga"), [types]);
  const hasBook = useMemo(
    () => types.includes("Book") || hasAnime || hasManga,
    [types, hasAnime, hasManga],
  );
  const hasAnimeMovie = useMemo(() => types.includes("Anime Movie"), [types]);
  const hasMovie = useMemo(() => types.includes("Movie"), [types]);
  const hasTV = useMemo(() => types.includes("TV"), [types]);
  const hasCartoon = useMemo(() => types.includes("Cartoon"), [types]);
  const hasComic = useMemo(() => types.includes("Comic"), [types]);
  const hasGame = useMemo(() => types.includes("Game"), [types]);
  // The restricted family: an h-comic, a hentai or an h-game may sit in a
  // franchise of any of its three types, so each tab asks the family rather
  // than its own type.
  const inRestrictedFamily = useMemo(
    () => inFranchiseFamily(franchise?.franchise_type, RESTRICTED_FAMILY),
    [franchise?.franchise_type],
  );
  const hasHComic = inRestrictedFamily;
  const hasHentai = inRestrictedFamily;
  const hasHGame = inRestrictedFamily;

  // Media types this franchise actually holds entries for, driven by the
  // per-type entry lists rather than franchise_type (which is multi-valued
  // and bundles types together: Anime alone covers anime, anime movies and
  // books).
  const franchiseMediaTypes = useMemo(() => {
    const list = [];
    if (animeList.length) list.push("anime");
    if (animeMovieList.length) list.push("anime-movie");
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
    animeMovieList,
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

  // The plan-next rows offered are the types the franchise's type offers,
  // that it holds entries for, and that may be queued at franchise scope
  // (ALLOWED_SCOPES["next"]) - so a franchise that is not an Anime franchise
  // never shows an Anime toggle.
  const franchisePlanNextTypes = useMemo(() => {
    const offered = {
      anime: hasAnime,
      "anime-movie": hasAnime || hasAnimeMovie,
      movie: hasMovie,
      "tv-show": hasTV,
      cartoon: hasCartoon,
      manga: hasManga,
      book: hasBook,
      comic: hasComic,
      game: hasGame,
      "h-comic": hasHComic,
      "h-game": hasHGame,
      hentai: hasHentai,
    };
    return applicableTypes(
      "next",
      "franchise",
      franchiseMediaTypes.filter((t) => offered[t]),
    );
  }, [
    franchiseMediaTypes,
    hasAnime,
    hasAnimeMovie,
    hasMovie,
    hasTV,
    hasCartoon,
    hasManga,
    hasBook,
    hasComic,
    hasGame,
    hasHComic,
    hasHGame,
    hasHentai,
  ]);

  const franchiseApplicableRewatchTypes = useMemo(
    () => applicableTypes("rewatch", "franchise", franchiseMediaTypes),
    [franchiseMediaTypes],
  );

  // Only this group filters which media entries are listed. It is shown under
  // its own label, apart from the extras below, because mixing the two in one
  // row made "Memes" read as just another entry type. Each row names its tab,
  // its media type, the list behind it and whether the franchise's type
  // offers it; the tab's count and the hero's totals come from the same rows.
  // Game is the last ungated tab; the gated types follow it.
  const mediaRows = useMemo(
    () =>
      franchise
        ? [
            { label: "Anime", type: "anime", entries: animeList, setEntries: setAnimeList, offered: hasAnime },
            {
              label: "Anime Movies",
              type: "anime-movie",
              entries: animeMovieList,
              setEntries: setAnimeMovieList,
              offered: hasAnime || hasAnimeMovie,
            },
            { label: "Manga", type: "manga", entries: mangaList, setEntries: setMangaList, offered: hasManga },
            { label: "Book", type: "book", entries: bookList, setEntries: setBookList, offered: hasBook },
            { label: "Comic", type: "comic", entries: comicList, setEntries: setComicList, offered: hasComic },
            { label: "Movies", type: "movie", entries: movieList, setEntries: setMovieList, offered: hasMovie },
            { label: "TV Shows", type: "tv-show", entries: tvShowList, setEntries: setTvShowList, offered: hasTV },
            { label: "Cartoons", type: "cartoon", entries: cartoonList, setEntries: setCartoonList, offered: hasCartoon },
            { label: "Game", type: "game", entries: gameList, setEntries: setGameList, offered: hasGame },
            // Gated types last, after every ungated one.
            { label: "H-Comic", type: "h-comic", entries: hComicList, setEntries: setHComicList, offered: hasHComic },
            { label: "H-Game", type: "h-game", entries: hGameList, setEntries: setHGameList, offered: hasHGame },
            { label: "Hentai", type: "hentai", entries: hentaiList, setEntries: setHentaiList, offered: hasHentai },
          ]
        : [],
    [
      franchise,
      hasAnime,
      hasManga,
      hasBook,
      hasComic,
      hasGame,
      hasHComic,
      hasHGame,
      hasHentai,
      hasAnimeMovie,
      hasMovie,
      hasTV,
      hasCartoon,
      animeList,
      animeMovieList,
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
      franchise
        ? [
            ...(showCharacters ? ["Characters"] : []),
            "Order",
            "Relations",
            "Notes",
          ]
        : [],
    [franchise, showCharacters],
  );

  const tabs = useMemo(
    () => [...mediaTabs, ...extraTabs],
    [mediaTabs, extraTabs],
  );

  useEffect(() => {
    if (tabs.length > 0 && activeTab === null) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  // The media row the open tab shows, if the open tab is a media one.
  const activeRow = mediaTabs.includes(activeTab)
    ? mediaRows.find((row) => row.label === activeTab)
    : null;

  // Optional parent tier: resolve the collection name for the breadcrumb.
  useEffect(() => {
    const cid = franchise?.collection_id;
    if (!cid) {
      setParentCollection(null);
      return;
    }
    let cancelled = false;
    fetch(endpoints.resource("collection").detail(cid), {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (!cancelled) setParentCollection(c);
      })
      .catch(() => {
        if (!cancelled) setParentCollection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [franchise?.collection_id]);

  async function saveField(field, value) {
    try {
      const res = await fetch(endpoints.resource("franchise").patch(system_id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value === "" ? null : value }),
        credentials: "include",
      });
      if (res.ok) {
        setFranchise(await res.json());
        showToast("success", "Franchise updated successfully");
      } else {
        showToast("error", "Save failed");
      }
    } catch {
      showToast("error", "Network error. Reverting.");
    }
  }

  // Shared by both plan kinds at franchise scope: only the kind, the target
  // state Set, and the resulting toast differ.
  async function handleTogglePlanKind(kind, mediaType, next) {
    if (!franchise) return;
    try {
      if (next) {
        const res = await fetch("/api/plan-next/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            media_type: mediaType,
            scope: "franchise",
            kind,
            target_id: franchise.system_id,
          }),
        });
        if (!res.ok && res.status !== 409) return;
      } else {
        const params = new URLSearchParams({
          scope: "franchise",
          media_type: mediaType,
          kind,
          target_id: franchise.system_id,
        });
        const res = await fetch(`/api/plan-next/target?${params}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 404) return;
      }
      const setter = kind === "rewatch" ? setRewatchMarked : setPlannedTypes;
      setter((prev) => {
        const nextSet = new Set(prev);
        if (next) nextSet.add(mediaType);
        else nextSet.delete(mediaType);
        return nextSet;
      });
    } catch {
      showToast("error", "Network error.");
    }
  }

  const handleTogglePlan = (mediaType, next) =>
    handleTogglePlanKind("next", mediaType, next);
  const handleRewatchToggle = (mediaType, next) =>
    handleTogglePlanKind("rewatch", mediaType, next);

  function handleOverride(mediaType, key) {
    const nextManual = { ...(franchise?.size_group_manual || {}) };
    if (key) nextManual[mediaType] = key;
    else delete nextManual[mediaType];
    saveField(
      "size_group_manual",
      Object.keys(nextManual).length > 0 ? nextManual : null,
    );
  }


  // ── Completion ────────────────────────────────────────────────────────────
  // totalEntries and completedCount come from the media tab rows above.
  const completionPct =
    totalEntries > 0 ? Math.round((completedCount / totalEntries) * 100) : 0;

  // ── loading / error ───────────────────────────────────────────────────────
  // The heading's title, which the browser tab shows too.
  const mainTitle = franchise
    ? franchise.franchise_name_cn ||
      franchise.franchise_name_en ||
      franchise.franchise_name_alt ||
      franchise.franchise_name_roman ||
      franchise.franchise_name_jp ||
      "Unknown Franchise"
    : null;
  usePageTitle(loading || error ? null : mainTitle);

  if (loading) return <HubLoading label="Loading Franchise Hub..." />;

  if (error)
    return (
      <HubError
        title="Error Loading Franchise"
        message={error}
        backTo="/library/franchise"
        backLabel="Franchise Library"
      />
    );

  // Combined flat entry list, used only for hero cover resolution. Every entry
  // loaded here already belongs to this franchise, so the by-franchise map the
  // shared helper expects is a single bucket. Each list is tagged with the
  // media type it was fetched as: covers live in owner-typed folders, so the
  // cover fallback cannot name a file without it.
  const allEntries = [
    ...withMediaType(animeList, "anime"),
    ...withMediaType(animeMovieList, "anime-movie"),
    ...withMediaType(movieList, "movie"),
    ...withMediaType(tvShowList, "tv-show"),
    ...withMediaType(cartoonList, "cartoon"),
    ...withMediaType(mangaList, "manga"),
    ...withMediaType(bookList, "book"),
    ...withMediaType(comicList, "comic"),
    ...withMediaType(gameList, "game"),
    ...withMediaType(hComicList, "h-comic"),
    ...withMediaType(hGameList, "h-game"),
    ...withMediaType(hentaiList, "hentai"),
  ];
  const cover = getFranchiseCover(
    franchise,
    Object.fromEntries(allEntries.map((e) => [e.system_id, e])),
    { [franchise.system_id]: allEntries },
  );

  const subTitles = [
    { label: "EN", value: franchise.franchise_name_en },
    { label: "JP", value: franchise.franchise_name_jp },
    { label: "Romaji", value: franchise.franchise_name_roman },
    { label: "Alt", value: franchise.franchise_name_alt },
  ].filter(({ value }) => value && value !== mainTitle);

  // A franchise sits under its collection when it has one.
  const trail = [
    { to: "/library/franchise", label: "Franchise" },
    ...(parentCollection
      ? [
          {
            to: entityPath("collection", parentCollection),
            label: getDisplayName(parentCollection, "collection"),
          },
        ]
      : []),
  ];

  const eyebrow = [
    "Franchise",
    ...types,
    `${totalEntries} ${totalEntries === 1 ? "entry" : "entries"}`,
  ].join("  ·  ");

  return (
    <HubShell>
      <Crumbs
        trail={trail}
        current={mainTitle}
        action={
          <div className="flex shrink-0 items-center gap-3">
            <NeedsWorkBadge ownerType="franchise" ownerId={system_id} />
            <ReportProblemButton
              targetType="franchise"
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
            rating={ownData ? franchise.my_rating : null}
            done={completedCount}
            total={totalEntries}
            pct={completionPct}
          />
        </div>

        <div className="lg:col-span-3 space-y-6">
          <header>
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-3">
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

            {/* Lineage: the collection above, the series within. Each is
                drawn only when there is one - a franchise outside every
                collection, or with no series, says nothing about it. */}
            {(parentCollection || seriesList.length > 0) && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6 text-sm pt-3 border-t border-border">
                {parentCollection && (
                  <div className="flex items-baseline gap-2">
                    <Eyebrow>Collection</Eyebrow>
                    <Link
                      to={entityPath("collection", parentCollection)}
                      className="text-text underline decoration-border-strong underline-offset-4 hover:decoration-brand hover:text-brand transition"
                    >
                      {getDisplayName(parentCollection, "collection")}
                    </Link>
                  </div>
                )}
                {seriesList.length > 0 && (
                  <div className="flex items-baseline gap-2">
                    <Eyebrow>Series</Eyebrow>
                    <span className="text-text">{seriesList.length}</span>
                  </div>
                )}
              </div>
            )}

            {/* A franchise's labels hide the franchise AND every entry in
                it, so they are said in their own row rather than mixed into
                the curation chips below. */}
            <ContentLabelChips
              labels={franchise.content_labels}
              note="Hides this franchise and every series and entry in it."
              className="mt-4"
            />

            {((ownData && franchise.franchise_expectation) ||
              plannedTypes.size > 0 ||
              rewatchMarked.size > 0) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {ownData && franchise.franchise_expectation && (
                  <Chip>Expectation · {franchise.franchise_expectation}</Chip>
                )}
                {Array.from(plannedTypes).map((mediaType) => {
                  const bucket = effectiveBucket(
                    franchise.size_group_derived,
                    franchise.size_group_manual,
                    mediaType,
                  );
                  const label = (SIZE_GROUPS[mediaType] || []).find(
                    (g) => g.key === bucket,
                  )?.label;
                  return (
                    <Chip key={mediaType}>
                      Plan next · {mediaType.replace("-", " ")}
                      {label ? ` (${label})` : ""}
                    </Chip>
                  );
                })}
                {Array.from(rewatchMarked).map((mediaType) => (
                  <Chip key={`rewatch-${mediaType}`}>
                    {REDO_LABEL} ·{" "}
                    {mediaType.replace("-", " ")}
                  </Chip>
                ))}
              </div>
            )}
          </header>

          {/* The rating and expectation are the viewer's own (self.list);
              the plan and rewatch controls stay the catalogue manager's. */}
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
                {isAdmin && (
                  <>
                    {franchisePlanNextTypes.length > 0 && (
                      <Field label="Plan next" className="sm:col-span-2">
                        <SizeGroupControls
                          mediaTypes={franchisePlanNextTypes}
                          planned={plannedTypes}
                          derived={franchise.size_group_derived}
                          manual={franchise.size_group_manual}
                          onTogglePlan={handleTogglePlan}
                          onOverride={handleOverride}
                        />
                      </Field>
                    )}
                    {franchiseApplicableRewatchTypes.length > 0 && (
                      <Field
                        label={REDO_LABEL}
                        className="sm:col-span-2"
                      >
                        <PlanKindToggles
                          kind="rewatch"
                          scope="franchise"
                          mediaTypes={franchiseMediaTypes}
                          marked={rewatchMarked}
                          onToggle={handleRewatchToggle}
                        />
                      </Field>
                    )}
                  </>
                )}
              </div>
            </Slip>
          )}
        </div>
      </div>

      {/* Franchises related to this one, each with this side's remark. Whole
          franchises, not the entry-to-entry relations the Relations tab
          draws. */}
      <RelatedRecords type="franchise" recordId={franchise.system_id} isAdmin={isAdmin} />

      {/* Series list */}
      {seriesList.length > 0 && (
        <Slip
          title="Series"
          actions={
            <span className="font-mono text-[11px] text-text-faint">
              {seriesList.length}
            </span>
          }
        >
          <div className="flex flex-wrap gap-2">
            {seriesList.map((s) => {
              const name =
                s.series_name_cn ||
                s.series_name_en ||
                s.series_name_alt ||
                "Unknown Series";
              return (
                <Link
                  key={s.system_id}
                  to={entityPath("series", s)}
                  className="border border-border-strong px-2.5 py-1 text-sm text-text hover:border-brand hover:text-brand transition"
                >
                  {name}
                </Link>
              );
            })}
          </div>
        </Slip>
      )}

      {/*
        Tab bar, in two labelled groups: "Media" picks which entries the list
        below shows, "Extras" opens material that belongs to the franchise as a
        whole. The Media group disappears for a franchise with no entries yet.
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
          scope="franchise"
          entries={activeRow.entries}
          seriesList={seriesList}
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
          <HubCharacters scope="franchise" tierId={system_id} />
        </Section>
      )}

      {/* ── Order tab content ──────────────────────────────────────── */}
      {activeTab === "Order" && (
        <Section
          title="Order"
        >
          <OrderSection franchiseId={system_id} />
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
              the way there, already scoped to this franchise. */}
          {isAdmin && (
            <div className="flex justify-end mb-2">
              <Link
                to={`/relations?owner=franchise:${system_id}`}
                className="text-xs font-medium text-text-muted hover:text-text whitespace-nowrap"
              >
                Edit relations
              </Link>
            </div>
          )}
          <RelationGraph readOnly scopeType="franchise" scopeId={system_id} />
        </Section>
      )}

      {/* ── Notes tab content ─────────────────────────────────────────────── */}
      {activeTab === "Notes" && (
        <Section
          title="Notes"
        >
          <FranchiseNotes
            franchise={franchise}
          />
        </Section>
      )}

      {/* No content at all */}
      {tabs.length === 0 && !loading && (
        <section className="border border-dashed border-border-strong px-4 py-6 text-center">
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-text-muted mb-1">
            No entries
          </div>
          <p className="text-sm text-text-faint">
            Nothing is filed under this franchise yet. Assign entries to it from the Modify page.
          </p>
        </section>
      )}
    </HubShell>
  );
}

