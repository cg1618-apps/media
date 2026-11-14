// /library/:type renders the matching config; an unknown type is not a crash.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Library from "./Library";
import { LIBRARY_CONFIGS } from "./configs";

// What /api/auth/me grants; a test that needs a list holder sets it.
let permissions = [];

function respond(url) {
  if (url.startsWith("/api/auth/me")) {
    return { is_admin: false, username: null, role: "guest", permissions };
  }
  if (url.startsWith("/api/anime-movie/"))
    return [
      {
        system_id: "m1",
        anime_movie_name_en: "Suzume",
        franchise_id: "f1",
        airing_status: "Finished Airing",
        mal_rating: "7.81",
        watching_status: "Completed",
        my_rating: "A",
        watch_next: false,
        to_rewatch: true,
      },
    ];
  if (url.startsWith("/api/anime/"))
    return [
      {
        system_id: "a1",
        anime_name_en: "Frieren",
        franchise_id: "f1",
        mal_rating: "8.64",
        anilist_rating: 85,
        anilist_popularity_rank: 364,
      },
    ];
  if (url.startsWith("/api/franchise/")) return [{ system_id: "f1", franchise_name_en: "Frieren Franchise" }];
  return [];
}

beforeEach(() => {
  permissions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(respond(String(url))) }))
  );
});
afterEach(() => vi.unstubAllGlobals());

function mount(path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route path="/library/:type" element={<Library />} />
              <Route path="/under-development" element={<div>Not here yet</div>} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

it("has a config for every media type that has a library", () => {
  expect(Object.keys(LIBRARY_CONFIGS).sort()).toEqual(
    [
      "anime",
      "anime-movie",
      "cartoon",
      "comic",
      "game",
      "h-comic",
      "h-game",
      "hentai",
      "manga",
      "movie",
      "novel",
      "tv-show",
    ]
  );
  for (const cfg of Object.values(LIBRARY_CONFIGS)) {
    expect(cfg.tableColumns.length).toBeGreaterThan(3);
    expect(cfg.sortDefs.some((s) => s.key === "my_rating")).toBe(true);
  }
});

it("renders the anime library from its config", async () => {
  mount("/library/anime");
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
  expect(screen.getByPlaceholderText(LIBRARY_CONFIGS.anime.searchPlaceholder)).toBeInTheDocument();
});

it("sends an unknown type to the under-development page", async () => {
  mount("/library/hologram");
  await waitFor(() => expect(screen.getByText("Not here yet")).toBeInTheDocument());
});

// The four AniList types sort on the AniList figures, and choosing one of
// those sorts repoints the grid card's score slot - the wiring that runs from
// the sortDef's `cardScoreField`, through LibraryLayout, to MediaCard. Each
// half is unit-tested where it lives; this is the only test that proves they
// are actually connected.
it("sorting an anime library by AniList repoints the card's score slot", async () => {
  mount("/library/anime");
  await waitFor(() => expect(screen.getByText("Frieren")).toBeInTheDocument());
  expect(screen.getByText("8.64")).toBeInTheDocument();

  fireEvent.change(screen.getByRole("combobox"), { target: { value: "anilist_rating" } });
  await waitFor(() => expect(screen.getByText("85")).toBeInTheDocument());
  expect(screen.queryByText("8.64")).not.toBeInTheDocument();

  // Sorting by popularity shows the score too: a card has one score slot,
  // and the score is the figure worth reading there.
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "anilist_popularity_rank" },
  });
  await waitFor(() => expect(screen.getByText("85")).toBeInTheDocument());
});

it("every AniList type offers both AniList sorts, and no other type does", () => {
  const ANILIST_TYPES = ["anime", "anime-movie", "manga", "novel"];
  for (const [type, cfg] of Object.entries(LIBRARY_CONFIGS)) {
    const keys = cfg.sortDefs.map((s) => s.key);
    const expected = ANILIST_TYPES.includes(type);
    expect(keys.includes("anilist_rating")).toBe(expected);
    expect(keys.includes("anilist_popularity_rank")).toBe(expected);
  }
});

it("the three restricted types sort by usefulness, and no other type does", () => {
  const RESTRICTED_TYPES = ["h-comic", "h-game", "hentai"];
  for (const [type, cfg] of Object.entries(LIBRARY_CONFIGS)) {
    const keys = cfg.sortDefs.map((s) => s.key);
    expect(keys.includes("usefulness")).toBe(RESTRICTED_TYPES.includes(type));
  }
});

// docs/viewers.md, "Libraries": a viewer without self.list is shown the
// catalogue parts only - no personal filter, sort or column, not empty ones.
// The same data for both viewers, so the difference is the scope alone; the
// list holder is the mirror that proves the guest's absences are the scope
// doing the dropping and not the defs failing to render.
describe("a library for a viewer without a list", () => {
  async function openAnimeMovieLibrary() {
    mount("/library/anime-movie");
    await waitFor(() => expect(screen.getByText("Suzume")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
  }

  const sortLabels = () =>
    Array.from(screen.getByRole("combobox").options).map((o) => o.textContent);

  async function openTable() {
    fireEvent.click(screen.getByRole("button", { name: "Table view" }));
    await waitFor(() => expect(screen.getByRole("columnheader", { name: "Title" })).toBeInTheDocument());
    return screen.getAllByRole("columnheader").map((th) => th.textContent);
  }

  it("shows a guest no status filter, my-rating sort, status or plan-flag column", async () => {
    await openAnimeMovieLibrary();
    expect(screen.getByText("Airing Status")).toBeInTheDocument();
    expect(screen.queryByText("Watch Status")).not.toBeInTheDocument();

    expect(sortLabels()).toContain("Sort: MAL Rating");
    expect(sortLabels()).not.toContain("Sort: My Rating");

    const headers = await openTable();
    expect(headers).toContain("MAL");
    for (const personal of ["My", "Watch", "Watch Next", "To Rewatch"]) {
      expect(headers).not.toContain(personal);
    }
  });

  it("shows a self.list holder every one of them, on the same data", async () => {
    permissions = ["self.list"];
    await openAnimeMovieLibrary();
    await waitFor(() => expect(screen.getByText("Watch Status")).toBeInTheDocument());
    expect(screen.getByText("Airing Status")).toBeInTheDocument();

    expect(sortLabels()).toContain("Sort: My Rating");

    const headers = await openTable();
    for (const personal of ["MAL", "My", "Watch", "Watch Next", "To Rewatch"]) {
      expect(headers).toContain(personal);
    }
  });
});
