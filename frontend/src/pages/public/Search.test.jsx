// The search page's three tabs: Media (groups, seasonal and every media
// type), People & companies (people, studios, publishers) and Characters,
// each counted, each hidden while empty, the active one held in `?tab=`.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Search, { SCOPE_LABELS } from "./Search";

const EMPTY_BUCKETS = {
  collection: [],
  franchise: [],
  series: [],
  anime: [],
  "anime-movie": [],
  movie: [],
  "tv-show": [],
  cartoon: [],
  manga: [],
  novel: [],
  comic: [],
  game: [],
  seasonal: [],
  person: [],
  studio: [],
  publisher: [],
};

const RESULTS = {
  query: "ghibli",
  scope: "all",
  related_franchises: [],
  results: {
    ...EMPTY_BUCKETS,
    anime: [
      {
        system_id: "a1",
        public_id: "a1",
        anime_name_en: "Ghibli Anime",
        airing_type: "TV",
        franchise_id: "f1",
      },
    ],
    person: [
      {
        system_id: "p1",
        public_id: "p1",
        name_jp: "宮崎駿",
        display_name: "宮崎駿",
        credit_count: 4,
      },
    ],
    game: [
      {
        system_id: "g1",
        public_id: "g1",
        game_name_cn: "魔女宅急便",
        game_name_en: "Ghibli Game",
        playing_status: "Might Play",
      },
    ],
    studio: [
      {
        system_id: "s1",
        public_id: "s1",
        name_en: "Studio Ghibli",
        display_name: "Studio Ghibli",
        credit_count: 12,
      },
    ],
    publisher: [
      {
        system_id: "pb1",
        public_id: "pb1",
        name_en: "Ghibli Publishing",
        display_name: "Ghibli Publishing",
        credit_count: 3,
      },
    ],
    character: [
      {
        system_id: "c1",
        public_id: "c1",
        name_en: "Kiki",
        display_name: "Kiki",
        casting_count: 2,
        identities: [],
      },
    ],
  },
};

// What the stubbed /api/search/ answers; a test may swap it before rendering.
let searchPayload = RESULTS;
let searchUrls = [];

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  searchPayload = RESULTS;
  searchUrls = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const isSearch = String(url).startsWith("/api/search/");
      if (isSearch) searchUrls.push(String(url));
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            isSearch
              ? searchPayload
              : { is_admin: false, username: null, role: "guest", is_root: false, permissions: [] },
          ),
      });
    }),
  );
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.search}</div>;
}

function tabButton(label) {
  return screen.queryAllByRole("button").find((b) => b.textContent.startsWith(label));
}

function h2s() {
  return screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
}

function renderPage(path = "/search?q=ghibli") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <Search />
            <LocationProbe />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Search page — tabs", () => {
  it("asks the API for the character bucket", async () => {
    renderPage();
    await screen.findByText("Ghibli Anime");
    expect(searchUrls[0]).toContain("characters=true");
  });

  it("opens on Media, showing only the media sections", async () => {
    renderPage();
    await screen.findByText("Ghibli Anime");
    expect(h2s()).toEqual(["Anime", "Game"]);
    expect(screen.queryByText("Studio Ghibli")).not.toBeInTheDocument();
    expect(screen.queryByText("Kiki")).not.toBeInTheDocument();
  });

  it("counts each tab", async () => {
    renderPage();
    await screen.findByText("Ghibli Anime");
    expect(tabButton("Media")).toHaveTextContent("Media2");
    expect(tabButton("People & companies")).toHaveTextContent("People & companies3");
    expect(tabButton("Characters")).toHaveTextContent("Characters1");
  });

  it("puts people, studios and publishers on their own tab, and records it in the URL", async () => {
    renderPage();
    await screen.findByText("Ghibli Anime");
    fireEvent.click(tabButton("People & companies"));
    expect(h2s()).toEqual(["People", "Studios", "Publishers"]);
    expect(screen.getByText("12 credits")).toBeInTheDocument();
    expect(screen.queryByText("Ghibli Anime")).not.toBeInTheDocument();
    const search = new URLSearchParams(screen.getByTestId("location").textContent);
    expect(search.get("tab")).toBe("people");
    expect(search.get("q")).toBe("ghibli");
  });

  it("links a person and a studio to their detail pages", async () => {
    renderPage("/search?q=ghibli&tab=people");
    expect(
      (await screen.findByText("宮崎駿")).closest("a"),
    ).toHaveAttribute("href", "/person/p1");
    expect(screen.getByText("Studio Ghibli").closest("a")).toHaveAttribute(
      "href",
      "/studio/s1/studio-ghibli",
    );
  });

  it("shows characters on the Characters tab with the character card", async () => {
    renderPage("/search?q=ghibli&tab=characters");
    const name = await screen.findByText("Kiki");
    expect(h2s()).toEqual(["Characters"]);
    expect(name.closest("a")).toHaveAttribute("href", "/character/c1/kiki");
    expect(screen.getByText("2 castings")).toBeInTheDocument();
  });

  it("falls back to the first non-empty tab when Media has nothing", async () => {
    searchPayload = {
      ...RESULTS,
      results: { ...EMPTY_BUCKETS, character: RESULTS.results.character },
    };
    renderPage();
    expect(await screen.findByText("Kiki")).toBeInTheDocument();
    // Only the tab with results is drawn.
    expect(tabButton("Media")).toBeUndefined();
    expect(tabButton("People & companies")).toBeUndefined();
    expect(tabButton("Characters")).toBeDefined();
  });

  it("ignores a ?tab= naming an empty tab", async () => {
    searchPayload = {
      ...RESULTS,
      results: { ...RESULTS.results, character: [] },
    };
    renderPage("/search?q=ghibli&tab=characters");
    expect(await screen.findByText("Ghibli Anime")).toBeInTheDocument();
    expect(tabButton("Characters")).toBeUndefined();
  });

  it("opens the People & companies tab for a staff scope", async () => {
    searchPayload = {
      ...RESULTS,
      scope: "person",
      results: { ...EMPTY_BUCKETS, person: RESULTS.results.person },
    };
    renderPage("/search?q=ghibli&scope=person");
    expect(await screen.findByText("宮崎駿")).toBeInTheDocument();
    expect(h2s()).toEqual(["People"]);
  });

  it("draws no tabs when nothing matches", async () => {
    searchPayload = { ...RESULTS, results: EMPTY_BUCKETS };
    renderPage();
    expect(await screen.findByText(/Nothing matches/)).toBeInTheDocument();
    expect(tabButton("Media")).toBeUndefined();
  });

  it("counts every section in the result summary", async () => {
    renderPage();
    await screen.findByText("Ghibli Anime");
    // The counts are split across nested spans, so read the rendered text.
    expect(document.body.textContent).toContain("1 people");
    expect(document.body.textContent).toContain("1 studios");
    expect(document.body.textContent).toContain("1 characters");
  });
});

describe("Search page — every type", () => {
  // Every media type and grouping tier the API searches has a section on
  // the Media tab. Gated types are included: the server sends their bucket
  // only to a session that may see them.
  const ROWS = {
    collection: { system_id: "col1", public_id: "col1", collection_name_en: "Zq Collection" },
    franchise: { system_id: "fr1", public_id: "fr1", franchise_name_en: "Zq Franchise" },
    series: { system_id: "se1", public_id: "se1", series_name_en: "Zq Series" },
    anime: { system_id: "an1", public_id: "an1", anime_name_en: "Zq Anime", airing_type: "TV" },
    "anime-movie": { system_id: "am1", public_id: "am1", anime_movie_name_en: "Zq Anime Movie" },
    movie: { system_id: "mo1", public_id: "mo1", movie_name_en: "Zq Movie" },
    "tv-show": { system_id: "tv1", public_id: "tv1", tv_name_en: "Zq TV" },
    cartoon: { system_id: "ca1", public_id: "ca1", cartoon_name_en: "Zq Cartoon" },
    manga: { system_id: "ma1", public_id: "ma1", manga_name_en: "Zq Manga" },
    novel: { system_id: "no1", public_id: "no1", novel_name_en: "Zq Novel" },
    comic: { system_id: "co1", public_id: "co1", comic_name_en: "Zq Comic" },
    game: { system_id: "ga1", public_id: "ga1", game_name_en: "Zq Game" },
    "h-comic": { system_id: "hc1", public_id: "hc1", h_comic_name_en: "Zq H-Comic" },
    hentai: { system_id: "he1", public_id: "he1", hentai_name_en: "Zq Hentai" },
    "h-game": { system_id: "hg1", public_id: "hg1", h_game_name_en: "Zq H-Game" },
  };

  it("renders a section for each of the twelve media types and the three tiers", async () => {
    searchPayload = {
      ...RESULTS,
      results: Object.fromEntries(
        Object.entries(ROWS).map(([key, row]) => [key, [row]]),
      ),
    };
    renderPage();
    await screen.findByText("Collections");
    expect(h2s()).toEqual([
      "Collections",
      "Franchises",
      "Series",
      "Anime",
      "Anime movies",
      "Movies",
      "TV shows",
      "Cartoons",
      "Manga",
      "Novel",
      "Comic",
      "Game",
      "H-Comic",
      "H-Game",
      "Hentai",
    ]);
    expect(tabButton("Media")).toHaveTextContent("Media15");
  });
});

describe("Search page — scopes", () => {
  it("offers game as a search scope", () => {
    expect(SCOPE_LABELS.game).toBe("Game");
  });

  it("offers publisher as a search scope, matching the API bucket", () => {
    expect(SCOPE_LABELS.publisher).toBe("Publisher");
  });

  it("shows matching publishers, linked to their detail page", async () => {
    renderPage("/search?q=ghibli&tab=people");
    const link = (await screen.findByText("Ghibli Publishing")).closest("a");
    expect(link).toHaveAttribute("href", "/publisher/pb1/ghibli-publishing");
  });
});
