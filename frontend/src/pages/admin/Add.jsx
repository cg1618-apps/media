// Frontend: page component file for Add.
import { useState, useEffect } from "react";
import { useToast } from "../../hooks/useToast";
import {
  getDisplayName,
  cleanString,
  buildAnimePayload,
  buildAnimeMoviePayload,
  buildCreditsPayload,
  cartoonFieldsPayload,
  comicFieldsPayload,
  gameFieldsPayload,
  hComicFieldsPayload,
  hGameFieldsPayload,
  hentaiFieldsPayload,
  mangaFieldsPayload,
  movieFieldsPayload,
  bookFieldsPayload,
  tvShowFieldsPayload,
} from "../../utils/media";
import { clearedForRegion } from "../../lib/hComicRegion";
import { mergeHComicAutofill } from "../../lib/restrictedSources";
import { RestrictedPrefillProvider } from "../../contexts/RestrictedPrefillContext";
import { hComicSourceFields } from "../../lib/hComicForm";
import { hGameSourceFields } from "../../lib/hGameForm";
import { hentaiSourceFields } from "../../lib/hentaiForm";
import {
  requiredLabelsForFranchiseType,
  requiredLabelsForType,
} from "../../lib/gatedTypes";
import { useGroupQuickCreate } from "../../hooks/useGroupQuickCreate";
import { entryGroupNames, SERIES_AUTOFILL_KEYS } from "../../lib/groupQuickCreate";
import CollectionAddTab, {
  defaultCollection,
} from "../add-tabs/CollectionAddTab";
import FranchiseAddTab, { defaultFranchise } from "../add-tabs/FranchiseAddTab";
import SeriesAddTab, { defaultSeries } from "../add-tabs/SeriesAddTab";
import {
  categoryHasAliases,
  cleanAliases,
} from "../../components/forms/AliasPicker";
import AliasTab from "../../components/forms/AliasTab";
import { categoryHasUsages } from "../../components/forms/UsagePicker";
import OptionsAddTab from "../add-tabs/OptionsAddTab";
import PersonAddTab, { defaultPerson } from "../add-tabs/PersonAddTab";
import IdentityAddTab from "../add-tabs/IdentityAddTab";
import CharacterAddTab, {
  defaultCharacter,
} from "../add-tabs/CharacterAddTab";
import StudioAddTab, { defaultStudio } from "../add-tabs/StudioAddTab";
import PublisherAddTab, {
  defaultPublisher,
} from "../add-tabs/PublisherAddTab";
import QuoteAddTab from "../add-tabs/QuoteAddTab";
import MemeAddTab from "../add-tabs/MemeAddTab";
import { emptyQuote, toQuotePayload } from "../../components/forms/QuoteForm";
import { emptyMeme, toMemePayload } from "../../components/forms/MemeForm";
import { attachUploadedImage } from "../../components/forms/ImagePicker";
import { endpoints } from "../../api/endpoints";
import { useEntryLists, GROUP_LIST_TYPES } from "../../hooks/useEntryLists";
import { ADD_TAB_LISTS, listsForTab } from "../../config/adminEntryLists";
import ContentLabelPicker, {
  GROUP_SCOPE_NOTES,
  LABELLABLE_TABS,
  saveCollectionLabels,
  saveEntryLabels,
  saveFranchiseLabels,
  saveSeriesLabels,
} from "../../components/forms/ContentLabelPicker";
import { fetchJson, jsonBody } from "../../api/client";
import { ensureSourceValues as ensureSourceValuesLib } from "../../lib/ensureSourceValues";
import { genreLabelSourceFields } from "../../lib/genreLabelFields";
import { useReplaceCasting } from "../../hooks/useCasting";
import { castIdentityProblem } from "../../lib/castOrder";
import MangaAddTab, { defaultManga } from "../add-tabs/MangaAddTab";
import BookAddTab, { defaultBook } from "../add-tabs/BookAddTab";
import ComicAddTab, { defaultComic } from "../add-tabs/ComicAddTab";
import GameAddTab, { defaultGame } from "../add-tabs/GameAddTab";
import HComicAddTab, {
  H_COMIC_FRANCHISE_TYPE,
  defaultHComic,
} from "../add-tabs/HComicAddTab";
import HGameAddTab, {
  H_GAME_FRANCHISE_TYPE,
  defaultHGame,
} from "../add-tabs/HGameAddTab";
import HentaiAddTab, {
  HENTAI_FRANCHISE_TYPE,
  defaultHentai,
} from "../add-tabs/HentaiAddTab";
import CartoonAddTab, { defaultCartoon } from "../add-tabs/CartoonAddTab";
import TvShowAddTab, { defaultTvShow } from "../add-tabs/TvShowAddTab";
import MovieAddTab, { defaultMovie } from "../add-tabs/MovieAddTab";
import AnimeMovieAddTab, {
  defaultAnimeMovie,
} from "../add-tabs/AnimeMovieAddTab";
import AnimeAddTab, { defaultAnime } from "../add-tabs/AnimeAddTab";
import AddedEntryNotes from "../add-tabs/AddedEntryNotes";
import {
  autofillFields,
  fetchFormDefaults,
  prefillPicks,
  resolveDefaults,
} from "../../hooks/useFormDefaults";
import { buildAutofillPatch } from "../../lib/autofill";
import {
  makeExternalPick,
  makeMalPick,
  makeTmdbPick,
  toIntId,
  toStringId,
} from "../../lib/externalPick";
import { ADMIN_TABS } from "../../config/adminTabs";
import { useFormRatingSaver } from "../../api/mutations/useMyRatingMutations";
import { PERSON_NAME_FIELDS, STUDIO_NAME_FIELDS } from "../../lib/naming";
import { CHARACTER_NAME_FIELDS } from "../add-tabs/CharacterAddTab";
import { OPTION_CATEGORIES } from "../../config/fieldOptions";
import AdminTabBar from "../../components/layout/AdminTabBar";
import { fetchAllSources } from "../../lib/sources";
import { withMediaType } from "../../lib/suggestionOrder";
import { characterTagsPayload, firstsPayload } from "../../lib/characterForm";
import { enrichEntry } from "../../lib/enrich";
import useLabelTagSync from "../../hooks/useLabelTagSync";
import NeedsWorkAddField, {
  EMPTY_NEEDS_WORK,
} from "../../components/needs-work/NeedsWorkAddField";
import { useSetNeedsWork } from "../../api/mutations/useNeedsWork";
import { NEEDS_WORK_OWNER_TYPES } from "../../lib/needsWork";
import { countriesPayload } from "../../lib/countries";

export default function Add() {
  const { showToast } = useToast();

  // The new record's 待補充 mark, when the field asked for one. A failure is
  // reported rather than thrown: the record itself is saved, and the mark can
  // be set from its page. The field resets either way, so the next record
  // does not inherit it.
  async function saveNeedsWork(ownerType, ownerId) {
    if (!needsWork.flagged) return;
    setNeedsWork(EMPTY_NEEDS_WORK);
    try {
      await setNeedsWorkMark.mutateAsync({ ownerType, ownerId, note: needsWork.note });
    } catch {
      showToast(
        "error",
        "Saved, but its 待補充 mark failed to save - mark it from its page.",
      );
    }
  }

  // The viewer's own rating (and a group's expectation) of a record just
  // created, which the create call does not carry: PUT to /api/me/ratings
  // with the new id, and only the values the form chose. A failure leaves
  // the record created, and the toast says so.
  const saveFormRating = useFormRatingSaver();
  async function saveMyRating(ownerType, ownerId, form, noun) {
    await saveFormRating(ownerType, ownerId, form, null, noun);
  }
  const replaceCasting = useReplaceCasting();

  // Entry lists are fetched per tab, not all twelve up front - see
  // hooks/useEntryLists.js. The aliases below keep every reader in this file
  // reading the same names it always has.
  const { lists, ensure, setList, isLoading } = useEntryLists();
  const allAnime = lists.anime;
  const allCollections = lists.collection;
  const allFranchises = lists.franchise;
  const allSeries = lists.series;
  const allAnimeMovies = lists["anime-movie"];
  const allMovies = lists.movie;
  const allTvShows = lists["tv-show"];
  const allCartoons = lists.cartoon;
  const allMangas = lists.manga;
  const allBooks = lists.book;
  const allComics = lists.comic;
  const allGames = lists.game;
  const allHComics = lists["h-comic"];
  const allHGames = lists["h-game"];
  const allHentai = lists.hentai;
  // Every submit handler appends its newly created row to the list it came
  // from, so the picker offers it without a refetch.
  const setAllAnime = (v) => setList("anime", v);
  const setAllCollections = (v) => setList("collection", v);
  const setAllFranchises = (v) => setList("franchise", v);
  const setAllSeries = (v) => setList("series", v);
  // The franchise and series an entry's save creates when the form names
  // ones that do not exist: one confirmation, names editable.
  const { createMissingGroups, groupCreateModal } = useGroupQuickCreate({
    showToast,
    onFranchiseCreated: (nf) => setAllFranchises((prev) => [...prev, nf]),
    onSeriesCreated: (ns) => setAllSeries((prev) => [...prev, ns]),
  });
  const setAllAnimeMovies = (v) => setList("anime-movie", v);
  const setAllMovies = (v) => setList("movie", v);
  const setAllTvShows = (v) => setList("tv-show", v);
  const setAllCartoons = (v) => setList("cartoon", v);
  const setAllMangas = (v) => setList("manga", v);
  const setAllBooks = (v) => setList("book", v);
  const setAllComics = (v) => setList("comic", v);
  const setAllGames = (v) => setList("game", v);
  const setAllHComics = (v) => setList("h-comic", v);
  const setAllHGames = (v) => setList("h-game", v);
  const setAllHentai = (v) => setList("hentai", v);
  const [sources, setSources] = useState({ options: [], studios: [], people: {} });
  // Admin-configured form defaults, keyed by media type. {} = use the built-ins.
  const [formDefaults, setFormDefaults] = useState({});
  // for entry lists too is what made this page slow to first paint.
  const [sourcesLoading, setSourcesLoading] = useState(true);

  // Content labels are the same eight keys for every media type, so they
  // live on the page rather than in each per-type form object.
  const [contentLabels, setContentLabels] = useState([]);
  // The 待補充 mark, page-level for the same reason: one field for the twelve
  // media tabs and the three group tabs. Saved by saveNeedsWork once the
  // create has answered with the new record's id.
  const [needsWork, setNeedsWork] = useState(EMPTY_NEEDS_WORK);
  const setNeedsWorkMark = useSetNeedsWork();
  const [activeTab, setActiveTab] = useState("anime");
  const [submitting, setSubmitting] = useState(false);
  const [lastAdded, setLastAddedName] = useState(null);
  // The media entry behind the "Added" banner, as { ownerType, entry }, so the
  // page can show that entry's notes. Every banner change clears it, and only
  // a media create handler sets it again, right after - so a collection or a
  // person added since never leaves a stale entry's notes on screen.
  const [lastCreated, setLastCreated] = useState(null);
  const setLastAdded = (name) => {
    setLastAddedName(name);
    setLastCreated(null);
  };

  // Modals (callbacks stored in state)
  const [duplicateModal, setDuplicateModal] = useState(null); // {name, onProceed, onCancel}

  // Forms
  const [af, setAf] = useState(defaultAnime());
  const [colf, setColf] = useState(defaultCollection());
  const [ff, setFf] = useState(defaultFranchise());
  const [sf, setSf] = useState(defaultSeries());
  const [amf, setAmf] = useState(defaultAnimeMovie());
  const [mf, setMf] = useState(defaultMovie());
  const [tvf, setTvf] = useState(defaultTvShow());
  const [cf, setCf] = useState(defaultCartoon());
  const [mgf, setMgf] = useState(defaultManga());
  const [nvf, setNvf] = useState(defaultBook());
  const [cmf, setCmf] = useState(defaultComic());
  const [gmf, setGmf] = useState(defaultGame());
  const [hcf, setHcf] = useState(defaultHComic());
  const [hgf, setHgf] = useState(defaultHGame());
  const [htf, setHtf] = useState(defaultHentai());
  // Quote is not a media entry, so like System Options it keeps its own
  // form state instead of going through the media form factories.
  const [qf, setQf] = useState(emptyQuote({ media_type: "", entry_id: null }));
  const uq = (patch) => setQf((prev) => ({ ...prev, ...patch }));
  const [memf, setMemf] = useState(
    emptyMeme({ owner_type: "", owner_id: null }),
  );
  const umeme = (patch) => setMemf((prev) => ({ ...prev, ...patch }));

  const [optCategory, setOptCategory] = useState("");
  const [optValues, setOptValues] = useState([""]);
  // Which media types the new values are offered in. Empty = everywhere.
  // Explicit because a save no longer derives it - see Ruling R27 and
  // components/forms/ScopePicker.jsx.
  const [optScopes, setOptScopes] = useState([]);
  // Which picker (watch / origin) new Platform values are offered in. Empty =
  // both. Explicit for the same reason as optScopes - see Ruling R27 and
  // components/forms/UsagePicker.jsx.
  const [optUsages, setOptUsages] = useState([]);
  // What external APIs call the new value. Only offered when a single value
  // is being added: the form creates N values at once and an alias belongs to
  // one value, not to the category. See components/forms/AliasPicker.jsx.
  const [optAliases, setOptAliases] = useState([]);

  // The Options tab has two sub-tabs (Options / Tags) sharing one "System
  // Options" nav entry. Person and Studio are top-level tabs under the Entity
  // group (see adminTabs.js), each with its own form state below.
  const [optionsSubTab, setOptionsSubTab] = useState("options");
  const [personRoles, setPersonRoles] = useState([]);
  // The three entity forms start from their factories in config/formFactories.js
  // like every other tab, so the admin's /defaults overrides reach them through
  // the same freshForm() path.
  const [personForm, setPersonForm] = useState(defaultPerson());
  const [studioForm, setStudioForm] = useState(defaultStudio());
  const [publisherForm, setPublisherForm] = useState(defaultPublisher());
  const [characterForm, setCharacterForm] = useState(defaultCharacter());
  const upf = (k, v) => setPersonForm((p) => ({ ...p, [k]: v }));
  const usf = (k, v) => setStudioForm((p) => ({ ...p, [k]: v }));
  // `upf` is already the person updater on this page, so the publisher one is
  // named for its state and passed in as the tab's `upf` prop.
  const upubf = (k, v) => setPublisherForm((p) => ({ ...p, [k]: v }));
  const ucf = (k, v) => setCharacterForm((p) => ({ ...p, [k]: v }));

  // The 標籤 Label field and the content-label picker, kept in step on every
  // type with that field (hooks/useLabelTagSync.js). A tab switch or a reset
  // after a create brings the labels to the open form's tags, so the picker
  // shows what this tab will save.
  const { editLabels, syncUpdater } = useLabelTagSync({
    mediaType: activeTab,
    forms: {
      anime: [af, setAf],
      "anime-movie": [amf, setAmf],
      movie: [mf, setMf],
      "tv-show": [tvf, setTvf],
      cartoon: [cf, setCf],
      manga: [mgf, setMgf],
      book: [nvf, setNvf],
      comic: [cmf, setCmf],
      game: [gmf, setGmf],
    },
    labels: contentLabels,
    setLabels: setContentLabels,
    onRefused: (message) => showToast("warning", message),
    reconcileOnChange: true,
  });

  const ua = syncUpdater("anime", (k, v) => setAf((p) => ({ ...p, [k]: v })));
  const ucol = (k, v) => setColf((p) => ({ ...p, [k]: v }));
  const uf = (k, v) => setFf((p) => ({ ...p, [k]: v }));
  const us = (k, v) => setSf((p) => ({ ...p, [k]: v }));
  const uam = syncUpdater("anime-movie", (k, v) =>
    setAmf((p) => ({ ...p, [k]: v })),
  );
  const umf = syncUpdater("movie", (k, v) =>
    setMf((p) => ({ ...p, [k]: v })),
  );
  const utf = syncUpdater("tv-show", (k, v) =>
    setTvf((p) => ({ ...p, [k]: v })),
  );
  const uc = syncUpdater("cartoon", (k, v) =>
    setCf((p) => ({ ...p, [k]: v })),
  );
  const umg = syncUpdater("manga", (k, v) =>
    setMgf((p) => ({ ...p, [k]: v })),
  );
  const unv = syncUpdater("book", (k, v) =>
    setNvf((p) => ({ ...p, [k]: v })),
  );
  const ucm = syncUpdater("comic", (k, v) =>
    setCmf((p) => ({ ...p, [k]: v })),
  );
  const ugm = syncUpdater("game", (k, v) =>
    setGmf((p) => ({ ...p, [k]: v })),
  );
  const uhc = (k, v) => setHcf((p) => ({ ...p, [k]: v }));
  const uhg = (k, v) => setHgf((p) => ({ ...p, [k]: v }));
  const uht = (k, v) => setHtf((p) => ({ ...p, [k]: v }));

  // A blank form for `type` with the admin's configured defaults applied.
  const freshForm = (type) => resolveDefaults(type, formDefaults);

  // Splits a tags field's comma-joined string into trimmed, non-empty names.
  const splitTags = (raw) =>
    (raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  // Creates whatever named values the user typed that aren't in `sources` yet
  // (see lib/ensureSourceValues.js — shared with Modify.jsx), then refreshes
  // `sources` so the just-created value is selectable immediately.
  async function ensureSourceValues(fields) {
    await ensureSourceValuesLib(fields, sources);
    setSources(await fetchAllSources());
  }

  // Attaches an image that was picked before its owner row existed - an Add
  // tab's ImagePicker has no ownerId yet (see ImagePicker.jsx's module
  // comment), so it hands the image id up as `pending_image_id` instead of
  // attaching at pick time. Called once the row is saved and has an id, the
  // same way QuoteForm/MemeForm's post-save attach works in submitQuote()/
  // submitMeme() above. A no-op when nothing was picked. Failure is surfaced,
  // not swallowed: the row itself already saved, so silently dropping the
  // image would leave it attached to nothing and later show as Unused on
  // /images, where the unused-only Delete would remove a file this row
  // still names.
  async function attachPendingImage(imageId, ownerType, ownerId, role, label) {
    if (!imageId) return;
    try {
      await attachUploadedImage(imageId, ownerType, ownerId, role);
    } catch (err) {
      showToast(
        "error",
        err.message || `${label} saved, but attaching the image failed.`,
      );
    }
  }

  // Saves a form's credits/tags via PUT /api/credits/{media_type}/{entry_id},
  // once the entry exists and its system_id is known. Surfaces a failure the
  // same way an entry save failure is surfaced - the entry itself is already
  // saved at this point, so a credits failure must not be silent.
  async function saveCredits(mediaType, entryId, form) {
    const res = await fetch(endpoints.credits.update(mediaType, entryId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCreditsPayload(mediaType, form)),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail
          ? JSON.stringify(err.detail)
          : "Entry saved, but credits/tags failed to save.",
      );
    }
    try {
      await saveEntryLabels(mediaType, entryId, contentLabels);
    } catch {
      // The entry saved; only its visibility did not. Say so rather than
      // letting the admin believe an entry is restricted when it is not.
      showToast(
        "error",
        "Entry saved, but its content labels failed to save.",
      );
    }
  }

  // Saves a form's cast via PUT /api/casting/{media_type}/{entry_id}. Cast is
  // never part of the entry payload (see docs/superpowers/specs/
  // 2026-09-05-seiyuu-character-design.md, Decision A) - it can only be sent
  // once the entry exists and its system_id is known, same as saveCredits.
  // Surfaces a failure rather than swallowing it: the entry itself is
  // already saved at this point.
  async function saveCast(mediaType, entryId, form) {
    try {
      await replaceCasting.mutateAsync({
        mediaType,
        entryId,
        cast: form.cast || [],
      });
    } catch (err) {
      showToast(
        "error",
        err.message || "Entry saved, but cast failed to save.",
      );
    }
  }

  // The active tab's own list goes out FIRST, before the twenty-odd source
  // requests, so it wins the browser's connection limit and is almost always
  // there by the time the page paints.
  useEffect(() => {
    ensure([...GROUP_LIST_TYPES, ...listsForTab(ADD_TAB_LISTS, activeTab)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching tabs fetches that tab's list if this is the first time it has
  // been opened, and nothing at all afterwards.
  useEffect(() => {
    ensure(listsForTab(ADD_TAB_LISTS, activeTab));
  }, [activeTab, ensure]);

  useEffect(() => {
    async function load() {
      // Form defaults and suggestion sources start together with the entry
      // lists above rather than after them: nothing here reads an entry list,
      // so sequencing the two only ever cost a round trip.
      const [fd, srcData] = await Promise.all([
        fetchFormDefaults().catch(() => ({})),
        fetchAllSources().catch(() => ({
          options: [],
          studios: [],
          publishers: {},
          people: {},
        })),
      ]);
      setSources(srcData);
      // Seed every form from the configured defaults. Safe to do here rather
      // than in the useState initializers: the page renders a spinner until
      // sourcesLoading flips, so the first paint of the form already has these.
      setFormDefaults(fd);
      setAf(resolveDefaults("anime", fd));
      setAmf(resolveDefaults("anime-movie", fd));
      setMf(resolveDefaults("movie", fd));
      setTvf(resolveDefaults("tv-show", fd));
      setCf(resolveDefaults("cartoon", fd));
      setMgf(resolveDefaults("manga", fd));
      setNvf(resolveDefaults("book", fd));
      setCmf(resolveDefaults("comic", fd));
      setGmf(resolveDefaults("game", fd));
      setHcf(resolveDefaults("h-comic", fd));
      setHgf(resolveDefaults("h-game", fd));
      setHtf(resolveDefaults("hentai", fd));
      setColf(resolveDefaults("collection", fd));
      setFf(resolveDefaults("franchise", fd));
      setSf(resolveDefaults("series", fd));
      setStudioForm(resolveDefaults("studio", fd));
      setPublisherForm(resolveDefaults("publisher", fd));
      setPersonForm(resolveDefaults("person", fd));
      setCharacterForm(resolveDefaults("character", fd));
      setSourcesLoading(false);
    }
    load();
  }, []);

  // One auto-fill handler per tab. Which fields get copied comes from the
  // admin's /defaults configuration, falling back to the built-in field sets.
  // `merge` folds the patch into the form; a tab whose fields depend on each
  // other (h-comic's region and sources) passes its own.
  const applyEntryAutofill =
    (setter, type, merge = (p, patch) => ({ ...p, ...patch })) =>
    (item) => {
      const patch = buildAutofillPatch(
        item,
        type,
        autofillFields(type, formDefaults),
        { allFranchises, allSeries, allCollections, defaults: freshForm(type) },
      );
      setter((p) => merge(p, patch));
      showToast("success", "Auto-filled fields from existing entry.");
    };
  const applyHComicEntryAutofill = applyEntryAutofill(
    setHcf,
    "h-comic",
    (p, patch) =>
      mergeHComicAutofill(p, patch, prefillPicks("h-comic", formDefaults)),
  );
  const applyHGameEntryAutofill = applyEntryAutofill(setHgf, "h-game");
  const applyHentaiEntryAutofill = applyEntryAutofill(setHtf, "hentai");

  const applyAnimeEntryAutofill = applyEntryAutofill(setAf, "anime");
  const applyAnimeMovieEntryAutofill = applyEntryAutofill(setAmf, "anime-movie");
  const applyMovieEntryAutofill = applyEntryAutofill(setMf, "movie");
  const applyTvShowEntryAutofill = applyEntryAutofill(setTvf, "tv-show");
  const applyCartoonEntryAutofill = applyEntryAutofill(setCf, "cartoon");
  const applyMangaEntryAutofill = applyEntryAutofill(setMgf, "manga");
  const applyBookEntryAutofill = applyEntryAutofill(setNvf, "book");
  const applyComicEntryAutofill = applyEntryAutofill(setCmf, "comic");
  const applyGameEntryAutofill = applyEntryAutofill(setGmf, "game");

  // The external search under each tab's auto-fill box (ExternalSearchBox).
  // A pick always writes the id and link (lib/externalPick.js) and writes a
  // name only where the admin left it blank, and only into the column that
  // name actually is:
  //   - MAL's title is the romaji one, so anime, anime movie, manga and book
  //     get it in their Romaji column. Their pick then fetches the type's
  //     mal-prefill (makeMalPick) and fills every field still blank with what
  //     the save's MAL autofill would write - plus the English and Japanese
  //     titles, the synonyms as the alternative name, and the studio or
  //     author credits, which the autofill never puts on the form - so the
  //     admin sees MAL's values before saving.
  //   - Person and character get MAL's native name in name_jp, which is
  //     exactly what their create-time MAL autofill writes. MAL's `title` is
  //     family-name-first ("Hanazawa, Kana"), not the western-order name_en
  //     that autofill derives, so it is not written.
  //   - TMDB, Open Library, Comic Vine and IGDB titles are the English ones.
  const applyAnimeMalPick = makeMalPick(setAf, showToast, {
    nameField: "anime_name_roman",
    prefillUrl: endpoints.anime.malPrefill,
    defaults: freshForm("anime"),
  });
  const applyAnimeMovieMalPick = makeMalPick(setAmf, showToast, {
    nameField: "anime_movie_name_roman",
    prefillUrl: endpoints.animeMovie.malPrefill,
    defaults: freshForm("anime-movie"),
  });
  const applyMangaMalPick = makeMalPick(setMgf, showToast, {
    nameField: "manga_name_roman",
    prefillUrl: endpoints.manga.malPrefill,
    defaults: freshForm("manga"),
  });
  const applyBookMalPick = makeMalPick(setNvf, showToast, {
    nameField: "book_name_roman",
    prefillUrl: endpoints.book.malPrefill,
    defaults: freshForm("book"),
  });
  const applyBookOpenLibraryPick = makeExternalPick(setNvf, showToast, {
    source: "Open Library",
    idField: "openlibrary_id",
    cast: toStringId,
    linkField: "openlibrary_link",
    nameField: "book_name_en",
  });
  // Person and character forms carry only mal_link; the server derives
  // mal_id from it on save.
  const entityMalPick = (setter) =>
    makeExternalPick(setter, showToast, {
      source: "MAL",
      linkField: "mal_link",
      nameField: "name_jp",
      nameOf: (result) => result.title_alt,
    });
  const applyPersonMalPick = entityMalPick(setPersonForm);
  const applyCharacterMalPick = entityMalPick(setCharacterForm);
  const applyMovieTmdbPick = makeTmdbPick(setMf, showToast, {
    resolveUrl: endpoints.movie.tmdbImdbId,
    nameField: "movie_name_en",
  });
  const applyTvShowTmdbPick = makeTmdbPick(setTvf, showToast, {
    resolveUrl: endpoints.tvShow.tmdbImdbId,
    nameField: "tv_name_en",
  });
  const applyCartoonTmdbPick = makeTmdbPick(setCf, showToast, {
    resolveUrl: endpoints.cartoon.tmdbImdbId,
    nameField: "cartoon_name_en",
  });
  // comicvine_id is written beside the link: the save path does not derive
  // it (only Fill does), and Fill runs on the id.
  const applyComicVinePick = makeExternalPick(setCmf, showToast, {
    source: "Comic Vine",
    idField: "comicvine_id",
    cast: toIntId,
    linkField: "comicvine_link",
    nameField: "comic_name_en",
  });
  // IGDB's public link carries a slug, so the id travels on its own.
  const igdbPick = (setter, nameField) =>
    makeExternalPick(setter, showToast, {
      source: "IGDB",
      idField: "igdb_id",
      cast: toIntId,
      linkField: "igdb_link",
      nameField,
    });
  const applyGameIgdbPick = igdbPick(setGmf, "game_name_en");
  const applyHGameIgdbPick = igdbPick(setHgf, "h_game_name_en");

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    // Checked before the entry is saved: an identity row with no identity
    // would otherwise save as a second main row of its character, and the
    // cast is only sent once the entry exists.
    const castForm = {
      anime: af,
      "anime-movie": amf,
      manga: mgf,
      book: nvf,
      "h-comic": hcf,
      hentai: htf,
      game: gmf,
    }[activeTab];
    const castProblem = castForm && castIdentityProblem(castForm.cast);
    if (castProblem) {
      showToast("warning", castProblem);
      return;
    }
    setSubmitting(true);
    try {
      if (activeTab === "anime") await submitAnime();
      else if (activeTab === "collection") await submitCollection();
      else if (activeTab === "franchise") await submitFranchise();
      else if (activeTab === "series") await submitSeries();
      else if (activeTab === "anime-movie") await submitAnimeMovie();
      else if (activeTab === "movie") await submitMovie();
      else if (activeTab === "tv-show") await submitTvShow();
      else if (activeTab === "cartoon") await submitCartoon();
      else if (activeTab === "manga") await submitManga();
      else if (activeTab === "book") await submitBook();
      else if (activeTab === "comic") await submitComic();
      else if (activeTab === "game") await submitGame();
      else if (activeTab === "h-comic") await submitHComic();
      else if (activeTab === "h-game") await submitHGame();
      else if (activeTab === "hentai") await submitHentai();
      else if (activeTab === "quote") await submitQuote();
      else if (activeTab === "meme") await submitMeme();
      else if (activeTab === "options") await submitOptions();
      else if (activeTab === "studio") await submitStudio();
      else if (activeTab === "publisher") await submitPublisher();
      else if (activeTab === "person") await submitPerson();
      else if (activeTab === "character") await submitCharacter();
    } catch (e) {
      showToast("error", e?.message || "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAnime() {
    if (!af.anime_name_en && !af.anime_name_cn && !af.anime_name_roman) {
      showToast("warning", "At least one Anime Name must be provided.");
      return;
    }
    if (!af.franchise_id && !af.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    // Validate episode count
    const epTotal = af.ep_total !== "" ? parseFloat(af.ep_total) : null;
    const epFin = af.ep_fin !== "" ? parseFloat(af.ep_fin) : null;
    if (epTotal !== null && epFin !== null && epFin > epTotal) {
      showToast(
        "error",
        `EP Finished (${epFin}) cannot exceed EP Total (${epTotal}).`,
      );
      return;
    }

    // Duplicate check
    const checkName = af.anime_name_en || af.anime_name_cn || "";
    const isDup = allAnime.some(
      (a) =>
        cleanString(a.anime_name_en || "") === cleanString(checkName) ||
        cleanString(a.anime_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    // Create the franchise and series the form names but that do not exist
    let franchiseId = af.franchise_id;
    let seriesId = af.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId
        ? { names: entryGroupNames(af, "anime"), type: "Anime" }
        : null,
      series: !seriesId && af.series_text.trim()
        ? { names: entryGroupNames(af, "anime", SERIES_AUTOFILL_KEYS), text: af.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    // Create anime entry
    const payload = buildAnimePayload(af, { franchiseId, seriesId });
    const res = await fetch("/api/anime/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      af.pending_image_id,
      "anime",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("anime", af, splitTags));
    await saveCredits("anime", created.system_id, af);
    await saveCast("anime", created.system_id, af);

    // Replace (enrich from MAL)
    const enriched = await enrichEntry("anime", created.system_id);

    window.scrollTo(0, 0);

    if (enriched) showToast("success", "Entry appended and enriched successfully.");

    else showToast("warning", "Entry appended successfully. Enrichment failed - run Replace later.");
    setLastAdded(created.anime_name_en || created.anime_name_cn || "New Entry");
    setAf(freshForm("anime"));
    setLastCreated({ ownerType: "anime", entry: created });
    await saveNeedsWork("anime", created.system_id);
    setContentLabels([]);
    setAllAnime((prev) => [...prev, created]);
  }

  async function submitCollection() {
    if (
      !colf.collection_name_en &&
      !colf.collection_name_cn &&
      !colf.collection_name_roman &&
      !colf.collection_name_jp &&
      !colf.collection_name_alt
    ) {
      showToast("warning", "At least one Collection Name must be provided.");
      return;
    }
    const res = await fetch("/api/collection/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        collection_name_en: colf.collection_name_en || null,
        collection_name_cn: colf.collection_name_cn || null,
        collection_name_roman: colf.collection_name_roman || null,
        collection_name_jp: colf.collection_name_jp || null,
        collection_name_alt: colf.collection_name_alt || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Collection appended successfully.");
      setLastAdded(
        created.collection_name_cn ||
          created.collection_name_en ||
          "New Collection",
      );
      // The rating goes before the labels: a label can hide the new
      // collection from this session's mode, and the PUT would be refused.
      await saveMyRating("collection", created.system_id, colf, "Collection");
      await saveNeedsWork("collection", created.system_id);
      try {
        await saveCollectionLabels(created.system_id, contentLabels);
      } catch {
        // The collection saved; only its visibility did not. Say so rather
        // than letting the admin believe a collection is restricted when it
        // and everything under it is not.
        showToast(
          "error",
          "Collection saved, but its content labels failed to save.",
        );
      }
      setColf(freshForm("collection"));
      setContentLabels([]);
      setAllCollections((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create collection");
    }
  }

  async function submitFranchise() {
    if (
      !ff.franchise_name_en &&
      !ff.franchise_name_cn &&
      !ff.franchise_name_roman &&
      !ff.franchise_name_jp &&
      !ff.franchise_name_alt
    ) {
      showToast("warning", "At least one Franchise Name must be provided.");
      return;
    }
    const res = await fetch("/api/franchise/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_name_en: ff.franchise_name_en || null,
        franchise_name_cn: ff.franchise_name_cn || null,
        franchise_name_roman: ff.franchise_name_roman || null,
        franchise_name_jp: ff.franchise_name_jp || null,
        franchise_name_alt: ff.franchise_name_alt || null,
        franchise_type: ff.franchise_type || null,
        collection_id: ff.collection_id || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Franchise appended successfully.");
      setLastAdded(
        created.franchise_name_cn ||
          created.franchise_name_en ||
          "New Franchise",
      );
      // Before the labels, as in submitCollection.
      await saveMyRating("franchise", created.system_id, ff, "Franchise");
      await saveNeedsWork("franchise", created.system_id);
      try {
        await saveFranchiseLabels(
          created.system_id,
          contentLabels,
          ff.franchise_type,
        );
      } catch {
        // The franchise saved; only its visibility did not. Say so rather
        // than letting the admin believe a franchise is restricted when it
        // and everything under it is not.
        showToast(
          "error",
          "Franchise saved, but its content labels failed to save.",
        );
      }
      setFf(freshForm("franchise"));
      setContentLabels([]);
      setAllFranchises((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create franchise");
    }
  }

  async function submitSeries() {
    if (
      !sf.series_name_en &&
      !sf.series_name_cn &&
      !sf.series_name_alt &&
      !sf.series_name_roman &&
      !sf.series_name_jp
    ) {
      showToast("warning", "At least one Series Name must be provided.");
      return;
    }
    if (!sf.franchise_id) {
      showToast("warning", "An existing Franchise must be selected.");
      return;
    }

    const res = await fetch("/api/series/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        franchise_id: sf.franchise_id,
        series_name_en: sf.series_name_en || null,
        series_name_cn: sf.series_name_cn || null,
        series_name_roman: sf.series_name_roman || null,
        series_name_jp: sf.series_name_jp || null,
        series_name_alt: sf.series_name_alt || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      window.scrollTo(0, 0);
      showToast("success", "Series appended successfully.");
      setLastAdded(
        created.series_name_cn || created.series_name_en || "New Series",
      );
      // Before the labels, as in submitCollection.
      await saveMyRating("series", created.system_id, sf, "Series");
      await saveNeedsWork("series", created.system_id);
      try {
        await saveSeriesLabels(created.system_id, contentLabels);
      } catch {
        // The series saved; only its visibility did not. Say so rather than
        // letting the admin believe a series is restricted when it and its
        // entries are not.
        showToast(
          "error",
          "Series saved, but its content labels failed to save.",
        );
      }
      setSf(freshForm("series"));
      setContentLabels([]);
      setAllSeries((prev) => [...prev, created]);
    } else {
      showToast("error", "Failed to create series");
    }
  }

  async function submitQuote() {
    if (!qf.media_type || !qf.entry_id) {
      showToast("warning", "A media entry must be selected.");
      return;
    }
    if (!qf.text?.trim() && !qf.image_file?.trim()) {
      showToast("warning", "A quote needs text or an image.");
      return;
    }
    try {
      const created = await fetchJson(endpoints.quotes.create(), {
        method: "POST",
        ...jsonBody(
          toQuotePayload(qf, {
            media_type: qf.media_type,
            entry_id: qf.entry_id,
          }),
        ),
      });
      // The quote had no id yet when the image was picked, so ImagePicker
      // could not attach it there - do it now that the row exists.
      if (qf.pending_image_id) {
        try {
          await attachUploadedImage(
            qf.pending_image_id,
            "quote",
            created.system_id,
            "quote",
          );
        } catch (err) {
          showToast(
            "error",
            err.message || "Quote saved, but attaching the image failed.",
          );
        }
      }
      showToast("success", "Quote appended.");
      setLastAdded(qf.text?.trim() || qf.image_file);
      // Keep the entry selected: quotes are usually added several at a time.
      setQf(emptyQuote({ media_type: qf.media_type, entry_id: qf.entry_id }));
    } catch (err) {
      showToast("error", err.message || "Failed to append quote.");
    }
  }

  async function submitMeme() {
    if (!memf.owner_type || !memf.owner_id) {
      showToast("warning", "An owner must be selected.");
      return;
    }
    if (!memf.text?.trim() && !memf.image_file?.trim()) {
      showToast("warning", "A meme needs text or an image.");
      return;
    }
    try {
      const created = await fetchJson(endpoints.memes.create(), {
        method: "POST",
        ...jsonBody(
          toMemePayload(memf, {
            owner_type: memf.owner_type,
            owner_id: memf.owner_id,
          }),
        ),
      });
      // The meme had no id yet when the image was picked, so ImagePicker
      // could not attach it there - do it now that the row exists.
      if (memf.pending_image_id) {
        try {
          await attachUploadedImage(
            memf.pending_image_id,
            "meme",
            created.system_id,
            "cover",
          );
        } catch (err) {
          showToast(
            "error",
            err.message || "Meme saved, but attaching the image failed.",
          );
        }
      }
      showToast("success", "Meme appended.");
      setLastAdded(memf.text?.trim() || memf.image_file);
      // Keep the entry selected: memes are usually added several at a time.
      setMemf(
        emptyMeme({ owner_type: memf.owner_type, owner_id: memf.owner_id }),
      );
    } catch (err) {
      showToast("error", err.message || "Failed to append meme.");
    }
  }

  async function submitOptions() {
    if (!optCategory.trim()) {
      showToast("warning", "Category is required.");
      return;
    }
    const vals = optValues.filter((v) => v.trim());
    if (vals.length === 0) {
      showToast("warning", "At least one option value is required.");
      return;
    }

    const results = await Promise.allSettled(
      vals.map((val) =>
        fetch(endpoints.options.create(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category: optCategory.trim(),
            value: val.trim(),
            scopes: optScopes,
            // Same as aliases below: switching off Platform hides the picker
            // but keeps what was picked in state, and sending it would 422.
            usages: categoryHasUsages(optCategory.trim()) ? optUsages : [],
            // vals.length > 1 disables the picker, so this is empty in the
            // bulk case rather than copied onto every value. The category
            // check matters too: switching the category hides the picker but
            // leaves what was typed in state, and sending it would 422.
            aliases:
              vals.length === 1 && categoryHasAliases(optCategory.trim())
                ? cleanAliases(optAliases)
                : [],
          }),
          credentials: "include",
        }),
      ),
    );
    const succeeded = results.filter(
      (r) => r.status === "fulfilled" && r.value.ok,
    ).length;
    const failed = vals.length - succeeded;
    if (succeeded > 0) {
      showToast("success", `Successfully appended ${succeeded} option(s).`);
      setLastAdded(`${succeeded} option(s) in "${optCategory}"`);
      if (failed === 0) {
        setOptCategory("");
        setOptValues([""]);
        setOptScopes([]);
        setOptUsages([]);
        setOptAliases([]);
      }
      setSources(await fetchAllSources());
    }
    if (failed > 0) showToast("warning", `${failed} option(s) failed to save.`);
  }

  async function submitPerson() {
    const hasName = PERSON_NAME_FIELDS.some(
      ({ field }) => personForm[field]?.trim(),
    );
    if (!hasName) {
      showToast("warning", "A person needs at least one name.");
      return;
    }
    const res = await fetch(endpoints.person.create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name_en: personForm.name_en.trim() || null,
        name_cn: personForm.name_cn.trim() || null,
        name_jp: personForm.name_jp.trim() || null,
        name_alt: personForm.name_alt.trim() || null,
        display_name_field: personForm.display_name_field || null,
        gender: personForm.gender || null,
        photo_file: personForm.photo_file || null,
        photo_focus: personForm.photo_focus || null,
        mal_link: personForm.mal_link?.trim() || null,
        remark: personForm.remark || null,
        roles: personRoles,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      // Before anything that could hide the new row from this session.
      await saveMyRating("person", created.system_id, personForm, "Person");
      await attachPendingImage(
        personForm.pending_image_id,
        "staff",
        created.system_id,
        "cover",
        "Person",
      );
      showToast("success", "Person appended successfully.");
      setLastAdded(created.display_name);
      setPersonForm(freshForm("person"));
      setPersonRoles([]);
      setSources(await fetchAllSources());
    } else {
      showToast("error", "Failed to create person");
    }
  }

  // POST /api/character always creates a new row, unlike POST /api/person's
  // find-or-create: character names legitimately recur across unrelated
  // works, so there is no dedupe/reuse step here to silently collapse into.
  async function submitCharacter() {
    const hasName = CHARACTER_NAME_FIELDS.some(
      ({ field }) => characterForm[field]?.trim(),
    );
    if (!hasName) {
      showToast("warning", "A character needs at least one name.");
      return;
    }
    const res = await fetch(endpoints.character.create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name_en: characterForm.name_en.trim() || null,
        name_cn: characterForm.name_cn.trim() || null,
        name_jp: characterForm.name_jp.trim() || null,
        name_alt: characterForm.name_alt.trim() || null,
        display_name_field: characterForm.display_name_field || null,
        role: characterForm.role || null,
        gender: characterForm.gender || null,
        photo_file: characterForm.photo_file || null,
        photo_focus: characterForm.photo_focus || null,
        mal_link: characterForm.mal_link?.trim() || null,
        remark: characterForm.remark || null,
        ...firstsPayload(characterForm),
        // Unknown values are created by the character write itself, so no
        // ensureSourceValues here; the refetch below makes them selectable.
        ...characterTagsPayload(characterForm),
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      // Before anything that could hide the new row from this session.
      await saveMyRating("character", created.system_id, characterForm, "Character");
      await attachPendingImage(
        characterForm.pending_image_id,
        "character",
        created.system_id,
        "cover",
        "Character",
      );
      showToast("success", "Character appended successfully.");
      setLastAdded(created.display_name);
      setCharacterForm(freshForm("character"));
      setSources(await fetchAllSources());
    } else {
      showToast("error", "Failed to create character");
    }
  }

  async function submitStudio() {
    const hasName = STUDIO_NAME_FIELDS.some(
      ({ field }) => studioForm[field]?.trim(),
    );
    if (!hasName) {
      showToast("warning", "A studio needs at least one name.");
      return;
    }
    const res = await fetch(endpoints.studio.create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name_en: studioForm.name_en.trim() || null,
        name_cn: studioForm.name_cn.trim() || null,
        name_jp: studioForm.name_jp.trim() || null,
        name_alt: studioForm.name_alt.trim() || null,
        display_name_field: studioForm.display_name_field || null,
        logo_file: studioForm.logo_file || null,
        logo_focus: studioForm.logo_focus || null,
        countries: countriesPayload(studioForm.countries),
        website_url: studioForm.website_url || null,
        founded_date: studioForm.founded_date || null,
        defunct_date: studioForm.defunct_date || null,
        mal_id: studioForm.mal_id ? parseInt(studioForm.mal_id, 10) : null,
        mal_link: studioForm.mal_link || null,
        remark: studioForm.remark || null,
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      // Before anything that could hide the new row from this session.
      await saveMyRating("studio", created.system_id, studioForm, "Studio");
      await attachPendingImage(
        studioForm.pending_image_id,
        "studio",
        created.system_id,
        "cover",
        "Studio",
      );
      showToast("success", "Studio appended successfully.");
      setLastAdded(created.display_name);
      setStudioForm(freshForm("studio"));
      setSources(await fetchAllSources());
    } else {
      showToast("error", "Failed to create studio");
    }
  }

  // Mirrors submitStudio() minus the two MAL columns - a publisher has no
  // MAL record to carry.
  async function submitPublisher() {
    const hasName = STUDIO_NAME_FIELDS.some(
      ({ field }) => publisherForm[field]?.trim(),
    );
    if (!hasName) {
      showToast("warning", "A publisher needs at least one name.");
      return;
    }
    const res = await fetch(endpoints.publisher.create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name_en: publisherForm.name_en.trim() || null,
        name_cn: publisherForm.name_cn.trim() || null,
        name_jp: publisherForm.name_jp.trim() || null,
        name_alt: publisherForm.name_alt.trim() || null,
        display_name_field: publisherForm.display_name_field || null,
        logo_file: publisherForm.logo_file || null,
        logo_focus: publisherForm.logo_focus || null,
        country: publisherForm.country || null,
        website_url: publisherForm.website_url || null,
        founded_date: publisherForm.founded_date || null,
        defunct_date: publisherForm.defunct_date || null,
        remark: publisherForm.remark || null,
        // Which media types offer this publisher. POST is additive, so this
        // can only widen a publisher that already exists under this name.
        scopes: publisherForm.scopes || [],
      }),
      credentials: "include",
    });
    if (res.ok) {
      const created = await res.json();
      // Before anything that could hide the new row from this session.
      await saveMyRating("publisher", created.system_id, publisherForm, "Publisher");
      await attachPendingImage(
        publisherForm.pending_image_id,
        "publisher",
        created.system_id,
        "cover",
        "Publisher",
      );
      showToast("success", "Publisher appended successfully.");
      setLastAdded(created.display_name);
      setPublisherForm(freshForm("publisher"));
      setSources(await fetchAllSources());
    } else {
      showToast("error", "Failed to create publisher");
    }
  }

  async function submitAnimeMovie() {
    if (
      !amf.anime_movie_name_en &&
      !amf.anime_movie_name_cn &&
      !amf.anime_movie_name_roman
    ) {
      showToast("warning", "At least one Anime Movie Name must be provided.");
      return;
    }
    if (!amf.franchise_id && !amf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    const checkName = amf.anime_movie_name_en || amf.anime_movie_name_cn || "";
    const isDup = allAnimeMovies.some(
      (m) =>
        cleanString(m.anime_movie_name_en || "") === cleanString(checkName) ||
        cleanString(m.anime_movie_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = amf.franchise_id;
    const groups = await createMissingGroups({
      franchiseId,
      franchise: !franchiseId
        ? { names: entryGroupNames(amf, "anime_movie"), type: "Anime" }
        : null,
    });
    if (!groups) return;
    franchiseId = groups.franchiseId;

    const res = await fetch("/api/anime-movie/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildAnimeMoviePayload(amf, { franchiseId })),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      amf.pending_image_id,
      "anime-movie",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("anime-movie", amf, splitTags));
    await saveCredits("anime-movie", created.system_id, amf);
    await saveCast("anime-movie", created.system_id, amf);

    const enriched = await enrichEntry("anime-movie", created.system_id);

    window.scrollTo(0, 0);

    if (enriched) showToast("success", "Anime movie appended and enriched successfully.");

    else showToast("warning", "Anime movie appended successfully. Enrichment failed - run Replace later.");
    setLastAdded(
      created.anime_movie_name_en ||
        created.anime_movie_name_cn ||
        "New Anime Movie",
    );
    setAmf(freshForm("anime-movie"));
    setLastCreated({ ownerType: "anime-movie", entry: created });
    await saveNeedsWork("anime-movie", created.system_id);
    setContentLabels([]);
    setAllAnimeMovies((prev) => [...prev, created]);
  }

  async function submitMovie() {
    if (!mf.movie_name_en && !mf.movie_name_cn && !mf.movie_name_alt) {
      showToast("warning", "At least one Movie Name must be provided.");
      return;
    }

    const checkName = mf.movie_name_en || mf.movie_name_cn || "";
    const isDup = allMovies.some(
      (m) =>
        cleanString(m.movie_name_en || "") === cleanString(checkName) ||
        cleanString(m.movie_name_cn || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = mf.franchise_id;
    let seriesId = mf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && mf.franchise_text.trim()
        ? { names: entryGroupNames(mf, "movie"), type: "Movie" }
        : null,
      series: !seriesId && mf.series_text.trim()
        ? { names: entryGroupNames(mf, "movie", SERIES_AUTOFILL_KEYS), text: mf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    const payload = {
      ...movieFieldsPayload(mf, {
        defaultStatus: freshForm("movie").watching_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/movies/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      mf.pending_image_id,
      "movie",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("movie", mf, splitTags));
    await saveCredits("movie", created.system_id, mf);
    window.scrollTo(0, 0);
    showToast("success", "Movie appended successfully.");
    setLastAdded(created.movie_name_en || created.movie_name_cn || "New Movie");
    setMf(freshForm("movie"));
    setLastCreated({ ownerType: "movie", entry: created });
    await saveNeedsWork("movie", created.system_id);
    setContentLabels([]);
    setAllMovies((prev) => [...prev, created]);
  }

  async function submitTvShow() {
    if (!tvf.tv_name_en && !tvf.tv_name_cn && !tvf.tv_name_alt) {
      showToast("warning", "At least one TV Show Name must be provided.");
      return;
    }

    const checkName = tvf.tv_name_cn || tvf.tv_name_en || "";
    const isDup = allTvShows.some(
      (t) =>
        cleanString(t.tv_name_cn || "") === cleanString(checkName) ||
        cleanString(t.tv_name_en || "") === cleanString(checkName),
    );
    if (isDup && checkName) {
      const proceed = await new Promise((resolve) => {
        setDuplicateModal({
          name: checkName,
          onProceed: () => {
            setDuplicateModal(null);
            resolve(true);
          },
          onCancel: () => {
            setDuplicateModal(null);
            resolve(false);
          },
        });
      });
      if (!proceed) return;
    }

    let franchiseId = tvf.franchise_id;
    let seriesId = tvf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && tvf.franchise_text.trim()
        ? { names: entryGroupNames(tvf, "tv"), type: "TV" }
        : null,
      series: !seriesId && tvf.series_text.trim()
        ? { names: entryGroupNames(tvf, "tv", SERIES_AUTOFILL_KEYS), text: tvf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    const payload = {
      ...tvShowFieldsPayload(tvf, {
        defaultStatus: freshForm("tv-show").watching_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/tv-shows/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      tvf.pending_image_id,
      "tv-show",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("tv-show", tvf, splitTags));
    await saveCredits("tv-show", created.system_id, tvf);
    window.scrollTo(0, 0);
    showToast("success", "TV Show appended successfully.");
    setLastAdded(created.tv_name_cn || created.tv_name_en || "New TV Show");
    setTvf(freshForm("tv-show"));
    setLastCreated({ ownerType: "tv-show", entry: created });
    await saveNeedsWork("tv-show", created.system_id);
    setContentLabels([]);
    setAllTvShows((prev) => [...prev, created]);
  }

  async function submitCartoon() {
    if (!cf.cartoon_name_cn && !cf.cartoon_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!cf.franchise_id && !cf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = cf.franchise_id;
    let seriesId = cf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && cf.franchise_text.trim()
        ? { names: entryGroupNames(cf, "cartoon"), type: "Cartoon" }
        : null,
      series: !seriesId && cf.series_text.trim()
        ? { names: entryGroupNames(cf, "cartoon", SERIES_AUTOFILL_KEYS), text: cf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    const payload = {
      ...cartoonFieldsPayload(cf, {
        defaultStatus: freshForm("cartoon").watching_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/cartoon/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      cf.pending_image_id,
      "cartoon",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("cartoon", cf, splitTags));
    await saveCredits("cartoon", created.system_id, cf);
    window.scrollTo(0, 0);
    showToast("success", "Cartoon appended successfully.");
    setLastAdded(
      created.cartoon_name_cn || created.cartoon_name_en || "New Cartoon",
    );
    setCf(freshForm("cartoon"));
    setLastCreated({ ownerType: "cartoon", entry: created });
    await saveNeedsWork("cartoon", created.system_id);
    setContentLabels([]);
    setAllCartoons((prev) => [...prev, created]);
  }

  async function submitManga() {
    if (!mgf.manga_name_cn && !mgf.manga_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!mgf.franchise_id && !mgf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = mgf.franchise_id;
    let seriesId = mgf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && mgf.franchise_text.trim()
        ? { names: entryGroupNames(mgf, "manga"), type: "Manga" }
        : null,
      series: !seriesId && mgf.series_text.trim()
        ? { names: entryGroupNames(mgf, "manga", SERIES_AUTOFILL_KEYS), text: mgf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    const payload = {
      ...mangaFieldsPayload(mgf, {
        defaultStatus: freshForm("manga").reading_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/manga/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      mgf.pending_image_id,
      "manga",
      created.system_id,
      "cover",
      "Entry",
    );
    await ensureSourceValues(genreLabelSourceFields("manga", mgf, splitTags));
    await saveCredits("manga", created.system_id, mgf);
    await saveCast("manga", created.system_id, mgf);
    window.scrollTo(0, 0);
    showToast("success", "Manga appended successfully.");
    setLastAdded(created.manga_name_cn || created.manga_name_en || "New Manga");
    setMgf(freshForm("manga"));
    setLastCreated({ ownerType: "manga", entry: created });
    await saveNeedsWork("manga", created.system_id);
    setContentLabels([]);
    setAllMangas((prev) => [...prev, created]);
  }

  async function submitBook() {
    if (!nvf.book_name_cn && !nvf.book_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!nvf.franchise_id && !nvf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = nvf.franchise_id;
    let seriesId = nvf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && nvf.franchise_text.trim()
        ? { names: entryGroupNames(nvf, "book"), type: "Book" }
        : null,
      series: !seriesId && nvf.series_text.trim()
        ? { names: entryGroupNames(nvf, "book", SERIES_AUTOFILL_KEYS), text: nvf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    // Auto-create missing entities for author, illustrator and the publisher
    await ensureSourceValues([
      {
        source: { kind: "person", role: "author", scope: "book" },
        values: splitTags(nvf.author),
      },
      {
        source: { kind: "person", role: "illustrator", scope: "book" },
        values: splitTags(nvf.illustrator),
      },
      {
        source: { kind: "publisher", scope: "book" },
        values: splitTags(nvf.publisher_tw),
      },
      ...genreLabelSourceFields("book", nvf, splitTags),
    ]);

    const payload = {
      ...bookFieldsPayload(nvf, {
        defaultStatus: freshForm("book").reading_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/book/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      nvf.pending_image_id,
      "book",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("book", created.system_id, nvf);
    await saveCast("book", created.system_id, nvf);
    window.scrollTo(0, 0);
    showToast("success", "Book appended successfully.");
    setLastAdded(created.book_name_cn || created.book_name_en || "New Book");
    setNvf(freshForm("book"));
    setLastCreated({ ownerType: "book", entry: created });
    await saveNeedsWork("book", created.system_id);
    setContentLabels([]);
    setAllBooks((prev) => [...prev, created]);
  }

  async function submitComic() {
    if (!cmf.comic_name_en && !cmf.comic_name_cn) {
      showToast("error", "Please provide at least an EN or CN title.");
      return;
    }
    if (!cmf.franchise_id && !cmf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = cmf.franchise_id;
    let seriesId = cmf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && cmf.franchise_text.trim()
        ? { names: entryGroupNames(cmf, "comic"), type: "Comic" }
        : null,
      series: !seriesId && cmf.series_text.trim()
        ? { names: entryGroupNames(cmf, "comic", SERIES_AUTOFILL_KEYS), text: cmf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    // Auto-create missing entities for every comic credit/tag field.
    await ensureSourceValues([
      {
        source: { kind: "person", role: "author", scope: "comic" },
        values: splitTags(cmf.writer),
      },
      {
        source: { kind: "person", role: "illustrator", scope: "comic" },
        values: splitTags(cmf.artist),
      },
      {
        source: { kind: "publisher", scope: "comic" },
        values: splitTags(cmf.publisher),
      },
      {
        source: { kind: "option", category: "Comic Imprint", scope: "comic" },
        values: splitTags(cmf.imprint),
      },
      {
        source: { kind: "option", category: "Comic Continuity", scope: "comic" },
        values: splitTags(cmf.continuity),
      },
      {
        source: { kind: "option", category: "Comic Era", scope: "comic" },
        values: splitTags(cmf.era),
      },
      {
        source: { kind: "option", category: "Comic Event", scope: "comic" },
        values: Array.isArray(cmf.events) ? cmf.events.filter(Boolean) : [],
      },
      ...genreLabelSourceFields("comic", cmf, splitTags),
    ]);

    const payload = {
      ...comicFieldsPayload(cmf, {
        defaultStatus: freshForm("comic").reading_status,
      }),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch("/api/comic/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      cmf.pending_image_id,
      "comic",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("comic", created.system_id, cmf);
    window.scrollTo(0, 0);
    showToast("success", "Comic appended successfully.");
    setLastAdded(created.comic_name_en || created.comic_name_cn || "New Comic");
    setCmf(freshForm("comic"));
    setLastCreated({ ownerType: "comic", entry: created });
    await saveNeedsWork("comic", created.system_id);
    setContentLabels([]);
    setAllComics((prev) => [...prev, created]);
  }

  async function submitGame() {
    if (!gmf.game_name_cn && !gmf.game_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!gmf.franchise_id && !gmf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    let franchiseId = gmf.franchise_id;
    let seriesId = gmf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && gmf.franchise_text.trim()
        ? { names: entryGroupNames(gmf, "game"), type: "Game" }
        : null,
      series: !seriesId && gmf.series_text.trim()
        ? { names: entryGroupNames(gmf, "game", SERIES_AUTOFILL_KEYS), text: gmf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    // Auto-create missing entities for every game credit/tag field. Developer
    // and publisher resolve to entity rows; the four vocabularies do not.
    await ensureSourceValues([
      { source: { kind: "studio" }, values: splitTags(gmf.studio) },
      { source: { kind: "publisher" }, values: splitTags(gmf.publisher) },
      {
        source: { kind: "person", role: "director", scope: "game" },
        values: splitTags(gmf.director),
      },
      {
        source: { kind: "person", role: "composer", scope: "game" },
        values: splitTags(gmf.composer),
      },
      {
        source: { kind: "option", category: "Game Genre", scope: "game" },
        values: splitTags(gmf.game_genre),
      },
      {
        source: { kind: "option", category: "Game Theme", scope: "game" },
        values: splitTags(gmf.game_theme),
      },
      {
        source: { kind: "option", category: "Game Mode", scope: "game" },
        values: splitTags(gmf.game_mode),
      },
      {
        source: { kind: "option", category: "Combat Mode", scope: "game" },
        values: splitTags(gmf.combat_mode),
      },
      {
        source: { kind: "option", category: "Game Platform", scope: "game" },
        values: splitTags(gmf.game_platform),
      },
      {
        source: { kind: "option", category: "Label", scope: "game" },
        values: splitTags(gmf.label),
      },
    ]);

    const payload = {
      ...gameFieldsPayload(gmf),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
      playing_status: gmf.playing_status || freshForm("game").playing_status,
    };

    const res = await fetch("/api/game/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      gmf.pending_image_id,
      "game",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("game", created.system_id, gmf);
    await saveCast("game", created.system_id, gmf);
    window.scrollTo(0, 0);
    showToast("success", "Game appended successfully.");
    setLastAdded(created.game_name_cn || created.game_name_en || "New Game");
    setGmf(freshForm("game"));
    setLastCreated({ ownerType: "game", entry: created });
    await saveNeedsWork("game", created.system_id);
    setContentLabels([]);
    setAllGames((prev) => [...prev, created]);
  }

  async function submitHComic() {
    if (!hcf.region) {
      showToast("warning", "Choose a region first: JP or KR.");
      return;
    }
    if (!hcf.h_comic_name_cn && !hcf.h_comic_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!hcf.franchise_id && !hcf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    // An h-comic sits only in a franchise of the restricted family (the
    // server refuses any other), so a new one is created with the H-Comic
    // type - and with the h-comic label, which the server attaches on create.
    let franchiseId = hcf.franchise_id;
    let seriesId = hcf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && hcf.franchise_text.trim()
        ? { names: entryGroupNames(hcf, "h_comic"), type: H_COMIC_FRANCHISE_TYPE }
        : null,
      series: !seriesId && hcf.series_text.trim()
        ? { names: entryGroupNames(hcf, "h_comic", SERIES_AUTOFILL_KEYS), text: hcf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    // What the region does not use is blanked before anything is sent: the
    // server clears those columns anyway, and the KR-only author and official
    // source are this form's to clear (lib/hComicRegion.js).
    const form = clearedForRegion(hcf);
    await ensureSourceValues(hComicSourceFields(form, splitTags));

    const payload = {
      ...hComicFieldsPayload(form),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch(endpoints.resource("h-comic").create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      hcf.pending_image_id,
      "h-comic",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("h-comic", created.system_id, form);
    await saveCast("h-comic", created.system_id, hcf);
    window.scrollTo(0, 0);
    showToast("success", "H-Comic appended successfully.");
    setLastAdded(getDisplayName(created, "h-comic"));
    setHcf(freshForm("h-comic"));
    setLastCreated({ ownerType: "h-comic", entry: created });
    await saveNeedsWork("h-comic", created.system_id);
    setContentLabels([]);
    setAllHComics((prev) => [...prev, created]);
  }

  async function submitHGame() {
    if (!hgf.h_game_name_cn && !hgf.h_game_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!hgf.franchise_id && !hgf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    // An h-game sits only in a franchise of the restricted family (the
    // server refuses any other), so a new one is created with the H-Game
    // type - and with the h-game label, which the server attaches on create.
    let franchiseId = hgf.franchise_id;
    let seriesId = hgf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && hgf.franchise_text.trim()
        ? { names: entryGroupNames(hgf, "h_game"), type: H_GAME_FRANCHISE_TYPE }
        : null,
      series: !seriesId && hgf.series_text.trim()
        ? { names: entryGroupNames(hgf, "h_game", SERIES_AUTOFILL_KEYS), text: hgf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    await ensureSourceValues(hGameSourceFields(hgf, splitTags));

    const payload = {
      ...hGameFieldsPayload(hgf),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch(endpoints.resource("h-game").create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      hgf.pending_image_id,
      "h-game",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("h-game", created.system_id, hgf);
    window.scrollTo(0, 0);
    showToast("success", "H-Game appended successfully.");
    setLastAdded(getDisplayName(created, "h-game"));
    setHgf(freshForm("h-game"));
    setLastCreated({ ownerType: "h-game", entry: created });
    await saveNeedsWork("h-game", created.system_id);
    setContentLabels([]);
    setAllHGames((prev) => [...prev, created]);
  }

  async function submitHentai() {
    if (!htf.hentai_name_cn && !htf.hentai_name_en) {
      showToast("error", "Please provide at least a CN or EN title.");
      return;
    }
    if (!htf.franchise_id && !htf.franchise_text.trim()) {
      showToast("warning", "A Franchise must be selected or created.");
      return;
    }

    // A hentai sits only in a franchise of the restricted family (the server
    // refuses any other), so a new one is created with the Hentai type - and
    // with the hentai label, which the server attaches on create.
    let franchiseId = htf.franchise_id;
    let seriesId = htf.series_id;
    const groups = await createMissingGroups({
      franchiseId,
      seriesId,
      franchise: !franchiseId && htf.franchise_text.trim()
        ? { names: entryGroupNames(htf, "hentai"), type: HENTAI_FRANCHISE_TYPE }
        : null,
      series: !seriesId && htf.series_text.trim()
        ? { names: entryGroupNames(htf, "hentai", SERIES_AUTOFILL_KEYS), text: htf.series_text }
        : null,
    });
    if (!groups) return;
    ({ franchiseId, seriesId } = groups);

    await ensureSourceValues(hentaiSourceFields(htf, splitTags));

    const payload = {
      ...hentaiFieldsPayload(htf),
      franchise_id: franchiseId || null,
      series_id: seriesId || null,
    };

    const res = await fetch(endpoints.resource("hentai").create(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(
        "error",
        err.detail ? JSON.stringify(err.detail) : "Failed to create entry",
      );
      return;
    }
    const created = await res.json();
    await attachPendingImage(
      htf.pending_image_id,
      "hentai",
      created.system_id,
      "cover",
      "Entry",
    );
    await saveCredits("hentai", created.system_id, htf);
    await saveCast("hentai", created.system_id, htf);
    window.scrollTo(0, 0);
    showToast("success", "Hentai appended successfully.");
    setLastAdded(getDisplayName(created, "hentai"));
    setHtf(freshForm("hentai"));
    setLastCreated({ ownerType: "hentai", entry: created });
    await saveNeedsWork("hentai", created.system_id);
    setContentLabels([]);
    setAllHentai((prev) => [...prev, created]);
  }

  // franchise system_id -> the name of the collection it belongs to, so every
  // tab with a franchise picker can name the wider grouping.
  const franchiseCollections = Object.fromEntries(
    allFranchises
      .filter((f) => f.collection_id)
      .map((f) => [
        f.system_id,
        allCollections.find((c) => c.system_id === f.collection_id),
      ])
      .filter(([, c]) => c)
      .map(([id, c]) => [id, getDisplayName(c, "collection")]),
  );

  const collectionItems = allCollections.map((c) => ({
    id: c.system_id,
    label: getDisplayName(c, "collection"),
    searchText: [
      c.collection_name_cn,
      c.collection_name_en,
      c.collection_name_jp,
      c.collection_name_roman,
      c.collection_name_alt,
    ]
      .filter(Boolean)
      .join(" "),
  }));

  const franchiseItems = allFranchises.map((f) => ({
    id: f.system_id,
    label: getDisplayName(f, "franchise"),
    searchText: [
      f.franchise_name_cn,
      f.franchise_name_en,
      f.franchise_name_jp,
      f.franchise_name_roman,
      f.franchise_name_alt,
    ]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItems = (
    activeTab === "anime" && af.franchise_id
      ? allSeries.filter((s) => s.franchise_id === af.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));
  const seriesItemsForMovie = (
    mf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === mf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForTvShow = (
    tvf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === tvf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForCartoon = (
    cf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForManga = (
    mgf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === mgf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForBook = (
    nvf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === nvf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForGame = (
    gmf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === gmf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForHComic = (
    hcf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === hcf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForHGame = (
    hgf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === hgf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForHentai = (
    htf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === htf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  const seriesItemsForComic = (
    cmf.franchise_id
      ? allSeries.filter((s) => s.franchise_id === cmf.franchise_id)
      : allSeries
  ).map((s) => ({
    id: s.system_id,
    label: getDisplayName(s, "series"),
    searchText: [s.series_name_cn, s.series_name_en, s.series_name_alt]
      .filter(Boolean)
      .join(" "),
  }));

  // Declared categories first, then whatever else the stored options carry:
  // a category a tag field reads must be offered even before its first value
  // exists, or the field it backs renders an empty dropdown with no way in.
  const optionCategories = [
    ...new Set([
      ...OPTION_CATEGORIES,
      ...sources.options.map((o) => o.category),
    ]),
  ].sort();

  // The open tab's bag: its tags fields order by, and its studio field
  // scopes on, this media type's counts (lib/suggestionOrder.js).
  const formSources = withMediaType(sources, activeTab);

  if (sourcesLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-brand text-3xl mb-3"></i>
          <p className="text-text-faint font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <RestrictedPrefillProvider config={formDefaults}>
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-black text-text flex items-center gap-3">
          <i className="fas fa-plus-circle text-brand"></i> Append Database
        </h1>
        <p className="text-sm text-text-faint mt-1">
          Add new entries to the anime database.
        </p>
      </div>

      {/* Last added notification */}
      {lastAdded && (
        <div className="mb-4 bg-success/15 border border-success/40 rounded-xl px-4 py-3 flex items-center gap-3">
          <i className="fas fa-check-circle text-success"></i>
          <span className="text-sm font-bold text-success">
            Added: {lastAdded}
          </span>
          <button
            onClick={() => setLastAdded(null)}
            className="ml-auto text-success/70 hover:text-success"
          >
            <i className="fas fa-times text-xs"></i>
          </button>
        </div>
      )}

      {/* The just-created entry's notes, on its own tab only - they belong to
          that entry, not to whatever the next tab is adding. */}
      {lastCreated && lastCreated.ownerType === activeTab && (
        <AddedEntryNotes
          ownerType={lastCreated.ownerType}
          entry={lastCreated.entry}
          name={lastAdded}
        />
      )}

      {/* Tabs */}
      <AdminTabBar
        tabs={ADMIN_TABS}
        activeTab={activeTab}
        onSelect={setActiveTab}
      />

      <form onSubmit={handleSubmit}>
        {/* ═══ ANIME TAB ═══ */}
        {activeTab === "anime" && (
          <AnimeAddTab
            franchiseCollections={franchiseCollections}
            af={af}
            ua={ua}
            allAnime={allAnime}
            animeLoading={isLoading("anime")}
            applyAnimeEntryAutofill={applyAnimeEntryAutofill}
            applyMalPick={applyAnimeMalPick}
            allFranchises={allFranchises}
            seriesItemsForAnime={seriesItems}
            sources={formSources}
          />
        )}

        {/* ═══ ANIME MOVIE TAB ═══ */}
        {activeTab === "anime-movie" && (
          <AnimeMovieAddTab
            franchiseCollections={franchiseCollections}
            amf={amf}
            uam={uam}
            allAnimeMovies={allAnimeMovies}
            animeMoviesLoading={isLoading("anime-movie")}
            applyAnimeMovieEntryAutofill={applyAnimeMovieEntryAutofill}
            applyMalPick={applyAnimeMovieMalPick}
            allFranchises={allFranchises}
            sources={formSources}
          />
        )}

        {/* ═══ MOVIE TAB ═══ */}
        {activeTab === "movie" && (
          <MovieAddTab
            franchiseCollections={franchiseCollections}
            mf={mf}
            umf={umf}
            allMovies={allMovies}
            moviesLoading={isLoading("movie")}
            applyMovieEntryAutofill={applyMovieEntryAutofill}
            applyTmdbPick={applyMovieTmdbPick}
            allFranchises={allFranchises}
            seriesItemsForMovie={seriesItemsForMovie}
            sources={formSources}
          />
        )}

        {/* ═══ TV SHOW TAB ═══ */}
        {activeTab === "tv-show" && (
          <TvShowAddTab
            franchiseCollections={franchiseCollections}
            tvf={tvf}
            utf={utf}
            allTvShows={allTvShows}
            tvShowsLoading={isLoading("tv-show")}
            applyTvShowEntryAutofill={applyTvShowEntryAutofill}
            applyTmdbPick={applyTvShowTmdbPick}
            allFranchises={allFranchises}
            seriesItemsForTvShow={seriesItemsForTvShow}
            sources={formSources}
          />
        )}

        {/* ═══ CARTOON TAB ═══ */}
        {activeTab === "cartoon" && (
          <CartoonAddTab
            franchiseCollections={franchiseCollections}
            cf={cf}
            uc={uc}
            allCartoons={allCartoons}
            cartoonsLoading={isLoading("cartoon")}
            applyCartoonEntryAutofill={applyCartoonEntryAutofill}
            applyTmdbPick={applyCartoonTmdbPick}
            allFranchises={allFranchises}
            seriesItemsForCartoon={seriesItemsForCartoon}
            sources={formSources}
          />
        )}

        {/* ═══ MANGA TAB ═══ */}
        {activeTab === "manga" && (
          <MangaAddTab
            franchiseCollections={franchiseCollections}
            mgf={mgf}
            umg={umg}
            allMangas={allMangas}
            mangasLoading={isLoading("manga")}
            applyMangaEntryAutofill={applyMangaEntryAutofill}
            applyMalPick={applyMangaMalPick}
            allFranchises={allFranchises}
            seriesItemsForManga={seriesItemsForManga}
            sources={formSources}
          />
        )}

        {/* ═══ BOOK TAB ═══ */}
        {activeTab === "book" && (
          <BookAddTab
            franchiseCollections={franchiseCollections}
            nvf={nvf}
            unv={unv}
            allBooks={allBooks}
            booksLoading={isLoading("book")}
            applyBookEntryAutofill={applyBookEntryAutofill}
            applyMalPick={applyBookMalPick}
            applyOpenLibraryPick={applyBookOpenLibraryPick}
            allFranchises={allFranchises}
            seriesItemsForBook={seriesItemsForBook}
            sources={formSources}
          />
        )}

        {/* ═══ COMIC TAB ═══ */}
        {activeTab === "comic" && (
          <ComicAddTab
            franchiseCollections={franchiseCollections}
            cmf={cmf}
            ucm={ucm}
            allComics={allComics}
            comicsLoading={isLoading("comic")}
            applyComicEntryAutofill={applyComicEntryAutofill}
            applyComicVinePick={applyComicVinePick}
            allFranchises={allFranchises}
            seriesItemsForComic={seriesItemsForComic}
            sources={formSources}
          />
        )}

        {/* ═══ GAME TAB ═══ */}
        {activeTab === "game" && (
          <GameAddTab
            franchiseCollections={franchiseCollections}
            gmf={gmf}
            ugm={ugm}
            allFranchises={allFranchises}
            allGames={allGames}
            seriesItemsForGame={seriesItemsForGame}
            sources={formSources}
            gamesLoading={isLoading("game")}
            applyGameEntryAutofill={applyGameEntryAutofill}
            applyIgdbPick={applyGameIgdbPick}
          />
        )}

        {/* ═══ H-COMIC TAB ═══ (gated: AdminTabBar offers it only to a
            session that can see the type) */}
        {activeTab === "h-comic" && (
          <HComicAddTab
            franchiseCollections={franchiseCollections}
            hcf={hcf}
            uhc={uhc}
            allFranchises={allFranchises}
            allHComics={allHComics}
            hComicsLoading={isLoading("h-comic")}
            applyHComicEntryAutofill={applyHComicEntryAutofill}
            seriesItemsForHComic={seriesItemsForHComic}
            sources={formSources}
          />
        )}

        {/* ═══ H-GAME TAB ═══ (gated like the h-comic tab) */}
        {activeTab === "h-game" && (
          <HGameAddTab
            franchiseCollections={franchiseCollections}
            hgf={hgf}
            uhg={uhg}
            allFranchises={allFranchises}
            allHGames={allHGames}
            hGamesLoading={isLoading("h-game")}
            seriesItemsForHGame={seriesItemsForHGame}
            sources={formSources}
            applyIgdbPick={applyHGameIgdbPick}
            applyHGameEntryAutofill={applyHGameEntryAutofill}
          />
        )}

        {/* ═══ HENTAI TAB ═══ (gated like h-comic's) */}
        {activeTab === "hentai" && (
          <HentaiAddTab
            franchiseCollections={franchiseCollections}
            htf={htf}
            uht={uht}
            allFranchises={allFranchises}
            allHentai={allHentai}
            hentaiLoading={isLoading("hentai")}
            applyHentaiEntryAutofill={applyHentaiEntryAutofill}
            seriesItemsForHentai={seriesItemsForHentai}
            sources={formSources}
          />
        )}

        {/* ═══ FRANCHISE TAB ═══ */}
        {activeTab === "collection" && <CollectionAddTab cf={colf} uf={ucol} />}
        {activeTab === "franchise" && (
          <FranchiseAddTab ff={ff} uf={uf} collectionItems={collectionItems} />
        )}

        {/* ═══ SERIES TAB ═══ */}
        {activeTab === "series" && (
          <SeriesAddTab
            sf={sf}
            us={us}
            franchiseItems={franchiseItems}
            franchiseCollections={franchiseCollections}
          />
        )}

        {/* ═══ QUOTE TAB ═══ */}
        {activeTab === "quote" && <QuoteAddTab qf={qf} uq={uq} />}

        {/* ═══ MEME TAB ═══ */}
        {activeTab === "meme" && <MemeAddTab mf={memf} um={umeme} />}

        {/* ═══ ALIAS TAB ═══ */}
        {activeTab === "alias" && (
          <AliasTab
            options={sources.options}
            showToast={showToast}
            onSaved={(updated) =>
              setSources((prev) => ({
                ...prev,
                options: prev.options.map((o) =>
                  o.system_id === updated.system_id ? updated : o,
                ),
              }))
            }
          />
        )}

        {/* ═══ OPTIONS TAB ═══ */}
        {activeTab === "options" && (
          <OptionsAddTab
            optionsSubTab={optionsSubTab}
            setOptionsSubTab={setOptionsSubTab}
            optCategory={optCategory}
            setOptCategory={setOptCategory}
            optValues={optValues}
            setOptValues={setOptValues}
            optionCategories={optionCategories}
            optScopes={optScopes}
            setOptScopes={setOptScopes}
            optUsages={optUsages}
            setOptUsages={setOptUsages}
            optAliases={optAliases}
            setOptAliases={setOptAliases}
          />
        )}

        {/* ═══ STUDIO TAB ═══ */}
        {activeTab === "studio" && (
          <StudioAddTab studioForm={studioForm} usf={usf} />
        )}

        {/* ═══ PUBLISHER TAB ═══ */}
        {activeTab === "publisher" && (
          <PublisherAddTab publisherForm={publisherForm} upf={upubf} />
        )}

        {/* ═══ PERSON TAB ═══ */}
        {activeTab === "person" && (
          <div className="bg-surface rounded-2xl border border-border shadow-sm p-6">
            <PersonAddTab
              personForm={personForm}
              upf={upf}
              roles={personRoles}
              setRoles={setPersonRoles}
              applyMalPick={applyPersonMalPick}
            />
          </div>
        )}

        {/* ═══ CHARACTER TAB ═══ */}
        {activeTab === "character" && (
          <CharacterAddTab
            characterForm={characterForm}
            ucf={ucf}
            applyMalPick={applyCharacterMalPick}
            sources={formSources}
          />
        )}

        {/* ═══ IDENTITY TAB — self-contained, saves through its own button ═══ */}
        {activeTab === "identity" && <IdentityAddTab />}

        {/* Content labels - one control for every media tab, and for the
            collection, franchise and series tabs, whose labels cascade to
            everything under them. Only a franchise has required labels (its
            gated franchise type's); a collection or series has none.
            "game" belongs here: submitGame writes labels like every other
            type, and leaving the tab out of this list meant a game could
            never be labelled on the way in. */}
        {LABELLABLE_TABS.includes(activeTab) && (
          <div className="mt-6">
            <ContentLabelPicker
              value={contentLabels}
              onChange={setContentLabels}
              onEdit={editLabels}
              required={
                activeTab === "franchise"
                  ? requiredLabelsForFranchiseType(ff.franchise_type)
                  : requiredLabelsForType(activeTab)
              }
              scopeNote={GROUP_SCOPE_NOTES[activeTab]}
            />
          </div>
        )}

        {/* 待補充 Needs Work - every tab whose record can carry a mark: the
            twelve media types and the three grouping tiers. */}
        {NEEDS_WORK_OWNER_TYPES.has(activeTab) && (
          <div className="mt-6">
            <NeedsWorkAddField value={needsWork} onChange={setNeedsWork} />
          </div>
        )}

        {/* Submit button. Hidden on the Identity tab, which saves through
            its own button, and on the Alias tab, which does the same: an alias is a PUT on an option that already exists, so
            there is nothing for "Append Entry" to append. */}
        <div
          className="mt-6 flex justify-end"
          hidden={activeTab === "alias" || activeTab === "identity"}
        >
          <button
            type="submit"
            disabled={
              submitting ||
              activeTab === "identity" ||
              (activeTab === "studio" &&
                !STUDIO_NAME_FIELDS.some(
                  ({ field }) => studioForm[field]?.trim(),
                )) ||
              (activeTab === "publisher" &&
                !STUDIO_NAME_FIELDS.some(
                  ({ field }) => publisherForm[field]?.trim(),
                )) ||
              (activeTab === "person" &&
                !PERSON_NAME_FIELDS.some(
                  ({ field }) => personForm[field]?.trim(),
                )) ||
              (activeTab === "character" &&
                !CHARACTER_NAME_FIELDS.some(
                  ({ field }) => characterForm[field]?.trim(),
                ))
            }
            className="flex items-center gap-2 px-6 py-3 bg-brand text-on-brand rounded-xl font-black text-sm hover:bg-brand-hover transition disabled:opacity-60"
          >
            {submitting ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-plus-circle"></i>
            )}
            {submitting ? "Saving..." : "Append Entry"}
          </button>
        </div>
      </form>

      {/* ── DUPLICATE MODAL ── */}
      {duplicateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-surface rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-warning/15 border-b border-warning/40 px-6 py-4 flex items-center gap-3">
              <i className="fas fa-exclamation-triangle text-warning text-xl"></i>
              <h3 className="font-black text-text">Potential Duplicate</h3>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-text-muted">
                An entry with the name{" "}
                <span className="font-bold text-text">
                  "{duplicateModal.name}"
                </span>{" "}
                may already exist in the database.
              </p>
              <p className="text-sm text-text-faint mt-2">
                Are you sure you want to proceed and create a duplicate?
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-3 justify-end">
              <button
                onClick={duplicateModal.onCancel}
                className="px-4 py-2 border border-border rounded-lg text-sm font-bold text-text-muted hover:bg-surface-2 transition"
              >
                Cancel
              </button>
              <button
                onClick={duplicateModal.onProceed}
                className="px-4 py-2 bg-brand text-on-brand rounded-lg text-sm font-bold hover:bg-brand-hover transition"
              >
                Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FRANCHISE / SERIES CREATE CONFIRMATION ── */}
      {groupCreateModal}
    </div>
    </RestrictedPrefillProvider>
  );
}
