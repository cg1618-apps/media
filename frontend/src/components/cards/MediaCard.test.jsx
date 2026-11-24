// Regression coverage for Finding 2 (book-units final review): MediaCard's
// book progress branch must agree with getBookProgress / BookDashboardCard
// on which pair a book renders, via the shared effectiveProgressDisplay
// helper (frontend/src/lib/bookUnits.js), rather than branching on the raw
// progress_display column directly.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import MediaCard from "./MediaCard";

// `permissions` is what /me answers; every other request answers `{}`, and
// each request is recorded so a test can say which route a write took.
function mockAuthFetch(permissions = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).startsWith("/api/auth/me")
              ? {
                  is_admin: false,
                  username: permissions.length ? "reader" : null,
                  role: permissions.length ? "user" : "guest",
                  permissions,
                }
              : {},
          ),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(data, type = "book", isAdmin = false, variant = "library", extra = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <MediaCard
              type={type}
              data={data}
              isAdmin={isAdmin}
              variant={variant}
              {...extra}
            />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("MediaCard — book progress (Decision G)", () => {
  it("a 網路小說 with arc rows and no stored progress_display renders the two-stage position, not a volume counter", async () => {
    mockAuthFetch();
    mount({
      system_id: "n1",
      type: "網路小說",
      progress_display: "",
      book_name_en: "Test Book",
      reading_status: "Reading",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      ch_total: 212,
      ch_fin: 201,
      vol_fin: 0,
      vol_total_original: null,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    });

    expect(await screen.findByText("arc 2 · 101/112 CH")).toBeInTheDocument();
  });
});


// The Bahamut badge must come from the one shared predicate in
// lib/formatters.js (kind "access" AND bucket "main"), not from a name match
// re-implemented here - a typed free-form row named "動畫瘋" is somebody's
// note, not the platform.
describe("MediaCard - the Bahamut badge", () => {
  const base = {
    system_id: "a1",
    anime_name_en: "Test Anime",
    watching_status: "Active Watching",
  };

  it("shows for a main access row marked available", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "main", name: "動畫瘋", available: true },
        ],
      },
      "anime",
    );
    expect(await screen.findByAltText("動畫瘋")).toBeInTheDocument();
  });

  it("shows every available main platform with an icon, not only 動畫瘋", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "main", name: "Netflix", available: true },
          { kind: "access", bucket: "main", name: "Disney+", available: false },
        ],
      },
      "tv-show",
    );
    expect(await screen.findByAltText("Netflix")).toBeInTheDocument();
    expect(screen.queryByAltText("Disney+")).toBeNull();
  });

  it("does not show for a free-form row typed '動畫瘋'", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "other", name: "動畫瘋", available: true },
        ],
      },
      "anime",
    );
    await screen.findByText("Test Anime");
    expect(screen.queryByAltText("動畫瘋")).toBeNull();
  });
});


// The card is a real link, not a div with an onClick. A middle click, a
// ctrl-click and "open in new tab" all need an <a href> to act on, and the
// href has to be the same pretty URL every other Link on the site uses -
// entityPath(), not the raw system_id UUID the old navigate() call passed.
describe("MediaCard - the card is a link", () => {
  const base = {
    system_id: "0f8c3a52-1f2b-4d2e-9a3c-6b7d8e9f0a1b",
    public_id: 47,
    anime_name_en: "Test Anime",
    watching_status: "Active Watching",
  };

  it("renders the title as an anchor pointing at the entityPath URL", async () => {
    mockAuthFetch();
    mount(base, "anime");
    const link = await screen.findByRole("link", { name: /Test Anime/ });
    expect(link).toHaveAttribute("href", "/anime/47/test-anime");
  });

  it("falls back to the system_id path when the row carries no public_id", async () => {
    mockAuthFetch();
    const { public_id: _omit, ...noPublicId } = base;
    mount(noPublicId, "anime");
    const link = await screen.findByRole("link", { name: /Test Anime/ });
    expect(link).toHaveAttribute(
      "href",
      `/anime/${base.system_id}`,
    );
  });

  // Only the "future" variant renders the Bahamut badge as a real <a>; in the
  // library variant it is a plain div. An <a> inside an <a> is invalid markup
  // and the browser would break the card link apart to recover, so the
  // stretched-link shape has to keep them siblings.
  it("keeps the Bahamut link out of the card anchor, so it is not a nested <a>", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          {
            kind: "access",
            bucket: "main",
            name: "動畫瘋",
            available: true,
            url: "https://ani.gamer.com.tw/x",
          },
        ],
      },
      "anime",
      false,
      "future",
    );
    const cardLink = await screen.findByRole("link", { name: /Test Anime/ });
    const baha = screen.getByAltText("動畫瘋").closest("a");
    expect(baha).not.toBeNull();
    expect(cardLink.contains(baha)).toBe(false);
  });

  it("does not nest the status button inside the card anchor", async () => {
    mockAuthFetch(["self.list"]);
    mount(base, "anime");
    const cardLink = await screen.findByRole("link", { name: /Test Anime/ });
    expect(await screen.findByTitle(/Active Watching →/)).toBeInTheDocument();
    expect(cardLink.querySelector("button")).toBeNull();
  });
});

// A game on the future variant sits on the PLAY axis, not the watch one, and
// its bolt moves release_status rather than airing_status - the column a game
// carries instead. Both were hard-coded to anime's vocabulary before games
// reached the Future releases page.
describe("MediaCard - the future variant on a game", () => {
  const game = {
    system_id: "3c1d5e77-2a4b-4c6d-8e9f-0a1b2c3d4e5f",
    public_id: 12,
    game_name_en: "Test Game",
    playing_status: "Plan to Play",
    release_status: "Unreleased",
    release_date: "2027-03",
  };

  it("offers the playing statuses, not the watching ones", async () => {
    mockAuthFetch(["self.list"]);
    mount(game, "game", false, "future");
    await screen.findByText("Test Game");
    const select = screen.getByRole("combobox");
    expect(
      [...select.options].map((o) => o.value),
    ).toEqual(["Might Play", "Plan to Play", "Play When Released"]);
  });

  it("titles the bolt with the release status it sets", async () => {
    mockAuthFetch();
    mount(game, "game", true, "future");
    await screen.findByText("Test Game");
    expect(screen.getByTitle("Mark as Released")).toBeInTheDocument();
  });

  it("gives an editor without a list the bolt and no status select", async () => {
    // Marking the work released is a catalogue edit; the status is a list's.
    mockAuthFetch();
    mount(game, "game", true, "future");
    await screen.findByText("Test Game");
    expect(screen.getByTitle("Mark as Released")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("gives a member with a list the status select and no bolt", async () => {
    mockAuthFetch(["self.list"]);
    mount(game, "game", false, "future");
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByTitle("Mark as Released")).toBeNull();
  });

  it("shows the release date on the meta line", async () => {
    mockAuthFetch();
    mount(game, "game", false, "future");
    expect(await screen.findByText("2027-03")).toBeInTheDocument();
  });
});

// The score slot on a card follows the library's sort (LibraryLayout passes
// `scoreField`), so that sorting by an AniList figure and reading a MAL one
// off the card cannot happen. The mirror matters as much as the positive
// case: with no prop the card must still show MAL, because five of the nine
// media types have no AniList figure at all and never pass one.
describe("MediaCard - which outside score the card shows", () => {
  const anime = {
    system_id: "a1",
    anime_name_en: "Test Anime",
    mal_rating: "8.64",
    anilist_rating: 85,
  };

  it("shows the MAL score by default", async () => {
    mockAuthFetch();
    mount(anime, "anime");
    expect(await screen.findByTitle("MAL score")).toHaveTextContent("8.64");
    expect(screen.queryByText("85")).not.toBeInTheDocument();
  });

  it("shows the AniList score when the sort points at it", async () => {
    mockAuthFetch();
    mount(anime, "anime", false, "library", { scoreField: "anilist_rating" });
    expect(await screen.findByTitle("AniList score")).toHaveTextContent("85");
    expect(screen.queryByText("8.64")).not.toBeInTheDocument();
  });

  // An anime movie carries its score as a stamp on the cover rather than on
  // the meta line, so it is a second code path and not a second case of one.
  it("follows the sort on an anime movie's cover stamp too", async () => {
    mockAuthFetch();
    mount(
      { system_id: "am1", anime_movie_name_en: "Test Movie", mal_rating: "8.2", anilist_rating: 79 },
      "anime-movie",
      false,
      "library",
      { scoreField: "anilist_rating" },
    );
    expect(await screen.findByTitle("AniList score")).toHaveTextContent("79");
  });

  // A manga with no AniList score shows nothing there rather than falling
  // back to the MAL figure the sort was not asking for.
  it("shows no figure when the entry has no AniList score", async () => {
    mockAuthFetch();
    mount(
      { system_id: "m1", manga_name_en: "Test Manga", mal_rating: "7.9", anilist_rating: null },
      "manga",
      false,
      "library",
      { scoreField: "anilist_rating" },
    );
    await screen.findByText("Test Manga");
    expect(screen.queryByText("7.9")).not.toBeInTheDocument();
  });
});

// A TV show's library line is the release date and the airing status, as a
// cartoon's leads with its date. The season is not on the card.
describe("MediaCard — TV show library line", () => {
  it("shows the release date beside the airing status, not the season", async () => {
    mockAuthFetch();
    const { container } = mount(
      {
        system_id: "t1",
        tv_name_cn: "七王國的騎士",
        season_part: "Season 1",
        release_date: "2026-01-18",
        airing_status: "Finished Airing",
      },
      "tv-show",
    );
    await screen.findByText("七王國的騎士");
    expect(screen.getByText("2026-01-18")).toBeInTheDocument();
    expect(screen.getByText("Finished Airing")).toBeInTheDocument();
    expect(container.textContent).not.toContain("Season 1");
  });

  it("shows TBD when the show has no release date", async () => {
    mockAuthFetch();
    mount(
      { system_id: "t2", tv_name_cn: "未定", release_date: null, airing_status: "Not Yet Aired" },
      "tv-show",
    );
    await screen.findByText("未定");
    expect(screen.getByText("TBD")).toBeInTheDocument();
  });
});

describe("MediaCard — hentai progress", () => {
  it("counts episodes as a cartoon card does", async () => {
    mockAuthFetch();
    const { container } = mount(
      { system_id: "h1", hentai_name_cn: "名", ep_fin: 1, ep_total: 2, watching_status: "Active Watching" },
      "hentai",
    );
    await screen.findByText("名");
    expect(container.textContent).toMatch(/1\s*\/\s*2\s*ep/i);
  });
});

// The status control writes the viewer's own list, so it follows self.list
// (useViewScope().ownData), not manage.catalog, and goes to /api/me/list.
describe("MediaCard - the status control is the viewer's own", () => {
  const movie = {
    system_id: "m1",
    public_id: 5,
    movie_name_en: "Test Movie",
    watching_status: "Plan to Watch",
  };

  it("draws the status button for a holder of self.list, movies included", async () => {
    mockAuthFetch(["self.list"]);
    mount(movie, "movie");
    expect(await screen.findByTitle(/Plan to Watch →/)).toBeInTheDocument();
  });

  it("draws no status at all for an editor without a list", async () => {
    // The mirror: same card, a catalogue editor's flag, no self.list.
    mockAuthFetch();
    mount(movie, "movie", true);
    await screen.findByText("Test Movie");
    expect(screen.queryByTitle(/Plan to Watch/)).toBeNull();
    expect(screen.queryByText("Plan to Watch")).toBeNull();
  });

  it("writes the status through /api/me/list, not the catalogue PATCH", async () => {
    mockAuthFetch(["self.list"]);
    mount(movie, "movie");
    const button = await screen.findByTitle(/Plan to Watch →/);
    button.click();
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => url === "/api/me/list/m1")).toBe(true),
    );
    const [, options] = fetch.mock.calls.find(([url]) => url === "/api/me/list/m1");
    expect(options.method).toBe("PUT");
    expect(Object.keys(JSON.parse(options.body))).toEqual(["watching_status"]);
    expect(fetch.mock.calls.some(([, o]) => o?.method === "PATCH")).toBe(false);
  });

  it("hands its own row back with the new status, so a group page keeps the title", async () => {
    // A franchise or series page holds its entries in page state, not in the
    // media-list cache, and replaces the row with whatever onUpdated gets. A
    // fresh QueryClient makes the cache empty, which is that case: a result
    // built from the cache alone would carry no name.
    mockAuthFetch(["self.list"]);
    const onUpdated = vi.fn();
    mount(movie, "movie", false, "library", { onUpdated });
    (await screen.findByTitle(/Plan to Watch →/)).click();
    await vi.waitFor(() => expect(onUpdated).toHaveBeenCalled());
    expect(onUpdated.mock.calls[0][0]).toMatchObject({
      system_id: "m1",
      movie_name_en: "Test Movie",
    });
  });
});

// A film waits with Watch When Released where the airing types wait with
// Watch When Airs, and its bolt sets release_status - a film has no airing.
describe("MediaCard - the future variant on a film", () => {
  const movie = {
    system_id: "6f1d5e77-2a4b-4c6d-8e9f-0a1b2c3d4e5f",
    public_id: 21,
    movie_name_en: "Test Film",
    watching_status: "Watch When Released",
    release_status: "Not Released",
  };

  it.each(["movie", "anime-movie"])("%s offers Watch When Released, not Watch When Airs", async (type) => {
    mockAuthFetch(["self.list"]);
    mount({ ...movie, anime_movie_name_en: "Test Film" }, type, false, "future");
    await screen.findByText("Test Film");
    expect([...screen.getByRole("combobox").options].map((o) => o.value)).toEqual([
      "Might Watch",
      "Plan to Watch",
      "Watch When Released",
    ]);
  });

  it("an anime keeps Watch When Airs", async () => {
    mockAuthFetch(["self.list"]);
    mount(
      { system_id: "a9", anime_name_en: "Test Show", watching_status: "Plan to Watch" },
      "anime",
      false,
      "future",
    );
    await screen.findByText("Test Show");
    expect([...screen.getByRole("combobox").options].map((o) => o.value)).toContain(
      "Watch When Airs",
    );
  });

  it("the bolt marks a waiting film Released and starts watching it", async () => {
    const user = userEvent.setup();
    mockAuthFetch(["self.list", "manage.catalog"]);
    mount({ ...movie, watching_status: "Watch When Released" }, "movie", true, "future");
    await user.click(await screen.findByTitle("Mark as Released"));
    const bodies = () =>
      fetch.mock.calls.filter(([, init]) => init?.body).map(([, init]) => JSON.parse(init.body));
    await waitFor(() =>
      expect(bodies()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ release_status: "Released" }),
          expect.objectContaining({ watching_status: "Active Watching" }),
        ]),
      ),
    );
    // The watching status is the viewer's own: it rides the /api/me write,
    // never the catalogue body that carries release_status.
    expect(bodies().some((b) => "release_status" in b && "watching_status" in b)).toBe(false);
  });

  it("the bolt marks a film on any other status Released and leaves the status", async () => {
    const user = userEvent.setup();
    mockAuthFetch(["self.list", "manage.catalog"]);
    mount({ ...movie, watching_status: "Plan to Watch" }, "movie", true, "future");
    await user.click(await screen.findByTitle("Mark as Released"));
    const bodies = () =>
      fetch.mock.calls.filter(([, init]) => init?.body).map(([, init]) => JSON.parse(init.body));
    await waitFor(() =>
      expect(bodies()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ release_status: "Released" }),
        ]),
      ),
    );
    expect(bodies().some((b) => "airing_status" in b)).toBe(false);
    expect(bodies().some((b) => "watching_status" in b)).toBe(false);
  });
});

// The status toggle's ✓ on a Completed row sets it back to the default status;
// leaving Completed that way zeroes the row's finished counts too.
describe("MediaCard - the status toggle off Completed", () => {
  function listWrites() {
    return fetch.mock.calls.filter(
      ([url, opts]) => String(url).includes("/api/me/list") && opts?.method === "PUT",
    );
  }

  it("zeroes the finished counts when a Completed manga is toggled", async () => {
    mockAuthFetch(["self.list"]);
    mount(
      { system_id: "m1", manga_name_en: "Done Manga", reading_status: "Completed", ch_fin: 120, vol_fin: 12 },
      "manga",
    );
    await userEvent.setup().click(await screen.findByTitle(/Completed →/));
    await waitFor(() => expect(listWrites()).toHaveLength(1));
    const body = JSON.parse(listWrites()[0][1].body);
    expect(body).toMatchObject({ reading_status: "Might Read", vol_fin: 0, vol_fin_page: 0, ch_fin: 0 });
  });

  it("sends only the status when the toggled row was not Completed", async () => {
    mockAuthFetch(["self.list"]);
    mount(
      { system_id: "m2", manga_name_en: "Reading Manga", reading_status: "Active Reading", ch_fin: 40 },
      "manga",
    );
    await userEvent.setup().click(await screen.findByTitle(/Active Reading →/));
    await waitFor(() => expect(listWrites()).toHaveLength(1));
    const body = JSON.parse(listWrites()[0][1].body);
    expect(body).not.toHaveProperty("ch_fin");
    expect(body).not.toHaveProperty("vol_fin");
  });
});

// The status button keeps the footer's right edge. A game with no playtime
// and no HLTB estimate has no progress to show, and under the row's
// justify-between alone the button slid into the empty left slot.
describe("MediaCard - the library footer's status button", () => {
  const game = {
    system_id: "4d2e6f88-3b5c-4d7e-9f0a-1b2c3d4e5f60",
    public_id: 13,
    game_name_en: "Unplayed Game",
    playing_status: "Might Play",
  };

  it("stays right-aligned when a game has no playtime to show", async () => {
    mockAuthFetch(["self.list"]);
    mount(game, "game");
    await screen.findByText("Unplayed Game");
    const button = await screen.findByTitle(/^Might Play →/);
    expect(button.parentElement).toHaveClass("ml-auto");
  });
});

// No grid card names its type in a vertical spine down the cover's left edge.
describe("MediaCard spine", () => {
  it("draws no type spine", () => {
    mockAuthFetch();
    const { container } = mount({ system_id: "s", public_id: 5, anime_name_en: "Spineless" }, "anime");
    expect(container.querySelector('[style*="vertical-rl"]')).toBeNull();
  });
});

// The hub variant: the franchise and series hubs' tabs. Every case mounts the
// same entry in the library variant too, so a pass shows the hub variant did
// the moving and the library card is untouched.
describe("MediaCard - the hub variant", () => {
  const atTopLeft = (el) =>
    el.className.includes("top-1") && el.className.includes("left-1");

  it("puts a movie's IMDb score on the meta line and the runtime under the TW date", async () => {
    mockAuthFetch();
    const movie = {
      system_id: "mv1",
      movie_name_en: "Film",
      imdb_rating: "7.4",
      length_min: 125,
      release_date_tw: "2024-03-01",
      release_date_usa: "2024-02-20",
    };
    mount(movie, "movie", false, "hub");
    const score = await screen.findByTitle("IMDb score");
    expect(score).toHaveTextContent("7.4");
    expect(atTopLeft(score)).toBe(false);
    expect(screen.getByText("2024-03-01")).toBeInTheDocument();
    expect(screen.getByText("2hr 5min")).toBeInTheDocument();
  });

  it("leaves the library movie card's IMDb stamp on the cover", async () => {
    mockAuthFetch();
    mount({ system_id: "mv1", movie_name_en: "Film", imdb_rating: "7.4" }, "movie");
    expect(atTopLeft(await screen.findByTitle("IMDb score"))).toBe(true);
  });

  it("shows an anime movie's JP date first, its MAL score and its runtime", async () => {
    mockAuthFetch();
    mount(
      {
        system_id: "am1",
        anime_movie_name_en: "Anime Film",
        mal_rating: "8.2",
        length_min: 90,
        release_date_jp: "2023-07-14",
        release_date_tw: "2023-09-01",
      },
      "anime-movie",
      false,
      "hub",
    );
    const score = await screen.findByTitle("MAL score");
    expect(score).toHaveTextContent("8.2");
    expect(atTopLeft(score)).toBe(false);
    expect(screen.getByText("2023-07-14")).toBeInTheDocument();
    expect(screen.queryByText("2023-09-01")).toBeNull();
    expect(screen.getByText("1hr 30min")).toBeInTheDocument();
  });

  it("puts a TV show's region top left and its score beside the date, with no airing status", async () => {
    mockAuthFetch();
    mount(
      {
        system_id: "t1",
        tv_name_cn: "劇",
        region: "US",
        imdb_rating: "8.8",
        release_date: "2026-01-18",
        airing_status: "Finished Airing",
      },
      "tv-show",
      false,
      "hub",
    );
    expect(atTopLeft(await screen.findByText("US"))).toBe(true);
    expect(atTopLeft(screen.getByTitle("IMDb score"))).toBe(false);
    expect(screen.getByText("2026-01-18")).toBeInTheDocument();
    expect(screen.queryByText("Finished Airing")).toBeNull();
  });

  it.each([
    ["manga", { manga_name_en: "Comic", region: "日漫" }],
    ["h-comic", { h_comic_name_en: "Doujin", region: "日漫" }],
    ["book", { book_name_en: "Novel", region: "日漫" }],
  ])("draws no region on a %s cover", async (type, fields) => {
    mockAuthFetch();
    mount({ system_id: "x1", ...fields }, type, false, "hub");
    await screen.findByRole("link");
    expect(screen.queryByText("日漫")).toBeNull();
  });

  it("still draws the region on a library manga cover", async () => {
    mockAuthFetch();
    mount({ system_id: "x1", manga_name_en: "Comic", region: "日漫" }, "manga");
    expect(await screen.findByText("日漫")).toBeInTheDocument();
  });

  it("puts a game's type top left, its date over the hours, and both Metacritic figures", async () => {
    mockAuthFetch();
    mount(
      {
        system_id: "g1",
        game_name_en: "Game",
        game_type: "DLC",
        release_date: "2024-06-21",
        hours_played: 12,
        metacritic_score: 94,
        metacritic_user_score: 8.1,
      },
      "game",
      false,
      "hub",
    );
    expect(atTopLeft(await screen.findByText("DLC"))).toBe(true);
    const date = screen.getByText("2024-06-21");
    const critic = screen.getByTitle("Metacritic score");
    const user = screen.getByTitle("Metacritic user score");
    expect(critic).toHaveTextContent("94");
    expect(user).toHaveTextContent("8.1");
    // Critics over users, in one column.
    expect(critic.parentElement).toBe(user.parentElement);
    expect(critic.compareDocumentPosition(user) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The date line sits above the hours row.
    const hours = screen.getByText(/^h$/i);
    expect(date.compareDocumentPosition(hours) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("draws no game type on a library game cover", async () => {
    mockAuthFetch();
    mount({ system_id: "g1", game_name_en: "Game", game_type: "DLC" }, "game");
    await screen.findByText("Game");
    expect(screen.queryByText("DLC")).toBeNull();
  });
});
