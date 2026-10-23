// Frontend: the entry-form layout across all twelve media types.
//
// Every type's Add and Modify tabs render one shared <T>FormBody, so the two
// pages must lay out the same fields in the same order. This pins, per type,
// the canonical section order (the detail page's) and that the ordered field
// labels are identical on both pages. Add's search boxes carry no <label>,
// and Modify's Structured Notes are stubbed out, so neither enters the
// comparison; Modify's extra "Structured Notes" header is asserted on its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AnimeAddTab from "./AnimeAddTab";
import AnimeMovieAddTab from "./AnimeMovieAddTab";
import CartoonAddTab from "./CartoonAddTab";
import ComicAddTab from "./ComicAddTab";
import GameAddTab from "./GameAddTab";
import HComicAddTab from "./HComicAddTab";
import HGameAddTab from "./HGameAddTab";
import HentaiAddTab from "./HentaiAddTab";
import MangaAddTab from "./MangaAddTab";
import MovieAddTab from "./MovieAddTab";
import NovelAddTab from "./NovelAddTab";
import TvShowAddTab from "./TvShowAddTab";
import AnimeModifyTab from "../modify-tabs/AnimeModifyTab";
import AnimeMovieModifyTab from "../modify-tabs/AnimeMovieModifyTab";
import CartoonModifyTab from "../modify-tabs/CartoonModifyTab";
import ComicModifyTab from "../modify-tabs/ComicModifyTab";
import GameModifyTab from "../modify-tabs/GameModifyTab";
import HComicModifyTab from "../modify-tabs/HComicModifyTab";
import HGameModifyTab from "../modify-tabs/HGameModifyTab";
import HentaiModifyTab from "../modify-tabs/HentaiModifyTab";
import MangaModifyTab from "../modify-tabs/MangaModifyTab";
import MovieModifyTab from "../modify-tabs/MovieModifyTab";
import NovelModifyTab from "../modify-tabs/NovelModifyTab";
import TvShowModifyTab from "../modify-tabs/TvShowModifyTab";
import {
  defaultAnime,
  defaultAnimeMovie,
  defaultCartoon,
  defaultComic,
  defaultGame,
  defaultHComic,
  defaultHGame,
  defaultHentai,
  defaultManga,
  defaultMovie,
  defaultNovel,
  defaultTvShow,
} from "../../config/formFactories";

// The game forms read the session for their Copies gate, the gated forms for
// the visible gated types.
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: () => true,
    visibleGatedTypes: ["h-comic", "h-game", "hentai"],
  }),
}));
// The pickers fetch on mount; the layout only needs them to be there.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: () => <div data-testid="image-picker" />,
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: () => <div data-testid="cast-editor" />,
}));
// Structured Notes is Modify-only and not part of the shared body.
const { notes } = vi.hoisted(() => ({
  notes: () => ({ default: () => null }),
}));
vi.mock("../detail/AnimeNotes", notes);
vi.mock("../detail/AnimeMovieNotes", notes);
vi.mock("../detail/MovieNotes", notes);
vi.mock("../detail/TVShowNotes", notes);
vi.mock("../detail/CartoonNotes", notes);
vi.mock("../detail/MangaNotes", notes);
vi.mock("../detail/NovelNotes", notes);
vi.mock("../detail/ComicNotes", notes);
vi.mock("../detail/GameNotes", notes);
vi.mock("../detail/HGameNotes", notes);
vi.mock("../detail/HComicNotes", notes);
vi.mock("../detail/HentaiNotes", notes);

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };
const common = { franchiseCollections: {}, allFranchises: [], sources: SOURCES };
const noop = () => {};

// The canonical section order of each type, as the detail page shows it.
const TYPES = [
  {
    name: "Anime",
    factory: defaultAnime,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Cast", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <AnimeAddTab {...common} af={f} ua={noop} allAnime={[]} applyAnimeEntryAutofill={noop} applyMalPick={noop} seriesItemsForAnime={[]} />
    ),
    modify: (f) => (
      <AnimeModifyTab {...common} af={f} ua={noop} seriesItemsForAnime={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Anime Movie",
    factory: defaultAnimeMovie,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Cast", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <AnimeMovieAddTab {...common} amf={f} uam={noop} allAnimeMovies={[]} applyAnimeMovieEntryAutofill={noop} applyMalPick={noop} />
    ),
    modify: (f) => (
      <AnimeMovieModifyTab {...common} amf={f} uam={noop} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Movie",
    factory: defaultMovie,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <MovieAddTab {...common} mf={f} umf={noop} allMovies={[]} applyMovieEntryAutofill={noop} applyTmdbPick={noop} seriesItemsForMovie={[]} />
    ),
    modify: (f) => (
      <MovieModifyTab {...common} mmf={f} umm={noop} seriesItemsForMovie={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "TV Show",
    factory: defaultTvShow,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <TvShowAddTab {...common} tvf={f} utf={noop} allTvShows={[]} applyTvShowEntryAutofill={noop} applyTmdbPick={noop} seriesItemsForTvShow={[]} />
    ),
    modify: (f) => (
      <TvShowModifyTab {...common} tvmf={f} utv={noop} seriesItemsForTvShow={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Cartoon",
    factory: defaultCartoon,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <CartoonAddTab {...common} cf={f} uc={noop} allCartoons={[]} applyCartoonEntryAutofill={noop} applyTmdbPick={noop} seriesItemsForCartoon={[]} />
    ),
    modify: (f) => (
      <CartoonModifyTab {...common} cmf={f} uc={noop} seriesItemsForCartoon={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Manga",
    factory: defaultManga,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Cast", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <MangaAddTab {...common} mgf={f} umg={noop} allMangas={[]} applyMangaEntryAutofill={noop} applyMalPick={noop} seriesItemsForManga={[]} />
    ),
    modify: (f) => (
      <MangaModifyTab {...common} cmgf={f} umg={noop} seriesItemsForManga={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Novel",
    factory: defaultNovel,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Cast", "Read Order", "Units", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <NovelAddTab {...common} nvf={f} unv={noop} allNovels={[]} applyNovelEntryAutofill={noop} applyMalPick={noop} applyOpenLibraryPick={noop} seriesItemsForNovel={[]} />
    ),
    modify: (f) => (
      <NovelModifyTab {...common} cnvf={f} unv={noop} seriesItemsForNovel={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Comic",
    factory: defaultComic,
    sections: ["Titles & Naming", "My Tracker", "Information", "Genres & Labels", "Production", "Read Order", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <ComicAddTab {...common} cmf={f} ucm={noop} allComics={[]} applyComicEntryAutofill={noop} applyComicVinePick={noop} seriesItemsForComic={[]} />
    ),
    modify: (f) => (
      <ComicModifyTab {...common} ccmf={f} ucm={noop} seriesItemsForComic={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Game",
    factory: defaultGame,
    sections: ["Titles & Naming", "Scores", "My Tracker", "Information", "Genres & Labels", "Production", "Prices", "Copies", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <GameAddTab {...common} gmf={f} ugm={noop} allGames={[]} seriesItemsForGame={[]} applyGameEntryAutofill={noop} applyIgdbPick={noop} />
    ),
    modify: (f) => (
      <GameModifyTab {...common} cgmf={f} ugm={noop} allGames={[]} seriesItemsForGame={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "H-Game",
    factory: defaultHGame,
    sections: ["Titles & Naming", "My Tracker", "Information", "Genres", "Presentation", "Production", "Prices", "Copies", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <HGameAddTab {...common} hgf={f} uhg={noop} allHGames={[]} seriesItemsForHGame={[]} applyIgdbPick={noop} applyHGameEntryAutofill={noop} />
    ),
    modify: (f) => (
      <HGameModifyTab {...common} chgf={f} uhg={noop} allHGames={[]} seriesItemsForHGame={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "H-Comic",
    factory: defaultHComic,
    sections: ["Titles & Naming", "My Tracker", "Information", "Genres", "Production", "Cast", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <HComicAddTab {...common} hcf={f} uhc={noop} allHComics={[]} applyHComicEntryAutofill={noop} seriesItemsForHComic={[]} />
    ),
    modify: (f) => (
      <HComicModifyTab {...common} chcf={f} uhc={noop} seriesItemsForHComic={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
  {
    name: "Hentai",
    factory: defaultHentai,
    sections: ["Titles & Naming", "My Tracker", "Information", "Genres", "Production", "Cast", "Links & Sources", "Cover & Remark"],
    add: (f) => (
      <HentaiAddTab {...common} htf={f} uht={noop} allHentai={[]} applyHentaiEntryAutofill={noop} seriesItemsForHentai={[]} />
    ),
    modify: (f) => (
      <HentaiModifyTab {...common} chtf={f} uht={noop} seriesItemsForHentai={[]} editingItem={{ system_id: "e1" }} />
    ),
  },
];

function layout(ui) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
  const result = {
    sections: [...container.querySelectorAll("[data-form-section]")].map((el) =>
      el.getAttribute("data-form-section"),
    ),
    labels: [...container.querySelectorAll("label")].map((l) => l.textContent.trim()),
  };
  cleanup();
  return result;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe.each(TYPES)("$name form layout", ({ factory, sections, add, modify }) => {
  it("Add renders the canonical sections in order", () => {
    expect(layout(add(factory())).sections).toEqual(sections);
  });

  it("Modify renders the same sections, then Structured Notes", () => {
    expect(layout(modify(factory())).sections).toEqual([...sections, "Structured Notes"]);
  });

  it("Add and Modify label the same fields in the same order", () => {
    const addLabels = layout(add(factory())).labels;
    expect(addLabels.length).toBeGreaterThan(0);
    expect(layout(modify(factory())).labels).toEqual(addLabels);
  });
});

// The h-comic form shows region-specific fields once a region is chosen; both
// regions have to agree between the pages too.
describe.each(["JP", "KR"])("H-Comic form layout, region %s", (region) => {
  it("Add and Modify label the same fields in the same order", () => {
    const hcomic = TYPES.find((t) => t.name === "H-Comic");
    const f = { ...defaultHComic(), region };
    const addLabels = layout(hcomic.add(f)).labels;
    expect(addLabels.length).toBeGreaterThan(0);
    expect(layout(hcomic.modify(f)).labels).toEqual(addLabels);
  });
});
