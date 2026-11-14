// Frontend: the game detail page's progress block.
//
// A game has no episode counter. Its progress is playtime against the
// main-story estimate, plus achievements when the game reports a total —
// so the block must render nothing at all rather than a misleading "0 h".
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Game, { GameCopiesSection, GameProgress, outOf, yesNo } from "./Game";

describe("GameProgress", () => {
  it("shows playtime against the main-story estimate", () => {
    render(<GameProgress game={{ hours_played: 32.5, hltb_main: 45 }} />);
    expect(screen.getByText(/32\.5 h/)).toBeInTheDocument();
    expect(screen.getByText(/45 h/)).toBeInTheDocument();
  });

  it("shows achievements only when a total is known", () => {
    const { rerender } = render(
      <GameProgress game={{ achievements_earned: 12, achievements_total: 40 }} />
    );
    expect(screen.getByText(/12 \/ 40/)).toBeInTheDocument();

    rerender(<GameProgress game={{ achievements_earned: 12 }} />);
    expect(screen.queryByText(/12 \/ 40/)).not.toBeInTheDocument();
  });

  it("renders nothing rather than a zero when there is no playtime", () => {
    const { container } = render(<GameProgress game={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// The renderer for steam_progress_sync, the one boolean left in the card. The
// four completion axes moved to GameCompletionBlock, which has its own tests.
describe("yesNo", () => {
  it("renders the two answers and drops the unknown", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
    expect(yesNo(null)).toBeNull();
    expect(yesNo(undefined)).toBeNull();
  });
});

// The two Metacritic figures sit on different scales — critics out of 100,
// users out of 10 — so each carries its denominator, and an unscored game
// shows the card's em dash rather than a zero.
describe("outOf", () => {
  it("keeps each score on its own scale", () => {
    expect(outOf(96, 100)).toBe("96 / 100");
    expect(outOf(8.6, 10)).toBe("8.6 / 10");
  });

  it("drops a missing or unreadable score", () => {
    expect(outOf(null, 100)).toBeNull();
    expect(outOf("", 10)).toBeNull();
    expect(outOf("n/a", 100)).toBeNull();
  });
});

// The copies a game is owned in are stored and saved by the form, but the
// detail page used to count them in the Info card and never show them. This
// section is the missing display.
describe("GameCopiesSection", () => {
  const steam = {
    system_id: "c1",
    position: 1,
    storefront: "Steam",
    ownership: "Owned",
    copy_format: "Digital",
    acquisition: "Bought",
    price_paid: "9.99",
    price_currency: "USD",
    acquired_date: "2024-05-17",
    remark: "summer sale",
  };

  it("shows every field of a copy", () => {
    render(<GameCopiesSection copies={[steam]} />);
    expect(screen.getByText("Steam")).toBeInTheDocument();
    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("Digital")).toBeInTheDocument();
    expect(screen.getByText("Bought")).toBeInTheDocument();
    expect(screen.getByText("USD 9.99")).toBeInTheDocument();
    expect(screen.getByText("2024-05-17")).toBeInTheDocument();
    expect(screen.getByText("summer sale")).toBeInTheDocument();
  });

  it("orders the rows by position", () => {
    const { container } = render(
      <GameCopiesSection
        copies={[
          { system_id: "b", position: 2, storefront: "GOG" },
          { system_id: "a", position: 1, storefront: "Steam" },
        ]}
      />
    );
    expect(container.textContent.indexOf("Steam")).toBeLessThan(
      container.textContent.indexOf("GOG")
    );
  });

  // A price with no currency beside it is still worth showing; a currency
  // with no price is not.
  it("drops an empty price instead of printing a bare currency", () => {
    render(
      <GameCopiesSection copies={[{ system_id: "c", storefront: "GOG", price_currency: "USD" }]} />
    );
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it("renders nothing when the game has no copies", () => {
    const { container } = render(<GameCopiesSection copies={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// The admin toolbar's Replace: the single-entry Replace route runs IGDB
// (fill-only) then Steam (playtime, achievements and the store figures
// drift), and the page is where an admin refreshes one entry.
describe("Game detail page — Replace", () => {
  const GAME = {
    system_id: "g1",
    game_name_en: "Test Game",
    franchise_id: null,
    series_id: null,
    cover_image_file: null,
  };

  function mockFetch({ isAdmin, game = GAME }) {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) => {
        const u = String(url);
        calls.push({ url: u, method: init?.method || "GET" });
        let body = [];
        if (u.startsWith("/api/auth/me")) {
          body = {
            // The catalogue editor is super (manage.catalog); the admin role
            // does not hold it.
            is_admin: isAdmin,
            username: isAdmin ? "cg1618" : null,
            role: isAdmin ? "super" : "guest",
            permissions: isAdmin ? ["manage.catalog", "manage.pipelines"] : [],
          };
        } else if (u.startsWith("/api/game/g1")) {
          body = game;
        } else if (u.startsWith("/api/data-control/replace/")) {
          body = { status: "success", message: "done" };
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      })
    );
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={["/game/g1"]}>
              <Routes>
                <Route path="/game/:publicId/:slug?" element={<Game />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  it("posts the single-entry Replace for this game", async () => {
    const calls = mockFetch({ isAdmin: true });
    mount();

    fireEvent.click(await screen.findByRole("button", { name: "Autofill & update" }));

    await waitFor(() =>
      expect(calls).toContainEqual({
        url: "/api/data-control/replace/game/g1",
        method: "POST",
      })
    );
  });

  // Mirror case: the same page, a guest, and no toolbar - so the admin test
  // above is finding the button because of isAdmin, not because it is always there.
  it("offers no Replace to a guest", async () => {
    mockFetch({ isAdmin: false });
    mount();

    await screen.findByRole("heading", { name: "Test Game" });
    expect(screen.queryByRole("button", { name: "Autofill & update" })).not.toBeInTheDocument();
  });

  // The vocabularies are media_tag rows the API returns as comma-joined
  // strings. Genre, theme and label have a card of their own; the modes stay
  // in Information beside Platform, since they say what kind of game it is.
  it("splits the game's facts across Information, Genres, Production & Release, Reception and Library", async () => {
    mockFetch({
      isAdmin: false,
      game: {
        ...GAME,
        game_platform: "PC",
        game_genre: "角色扮演, 冒險",
        game_theme: "奇幻",
        game_mode: "單人, 多人",
        combat_mode: "PvE",
        label: "神作",
        studio: "FromSoftware",
        release_status: "Released",
        current_patch: "1.12",
        metacritic_score: 96,
        ownership: "Owned",
        steam_progress_sync: true,
      },
    });
    mount();

    const card = async (title) =>
      within((await screen.findByRole("heading", { name: title })).closest("section"));

    const info = await card("Information");
    expect(info.getByText("PC")).toBeInTheDocument();
    expect(info.getByText("單人, 多人")).toBeInTheDocument();
    expect(info.getByText("PvE")).toBeInTheDocument();
    expect(info.queryByText("角色扮演, 冒險")).toBeNull();
    expect(info.queryByText("Released")).toBeNull();

    const genres = await card("Genres");
    expect(genres.getByText("角色扮演, 冒險")).toBeInTheDocument();
    expect(genres.getByText("奇幻")).toBeInTheDocument();
    expect(genres.getByText("神作")).toBeInTheDocument();

    const production = await card("Production & Release");
    expect(production.getByText("FromSoftware")).toBeInTheDocument();
    expect(production.getByText("Released")).toBeInTheDocument();
    expect(production.getByText("1.12")).toBeInTheDocument();

    expect((await card("Reception")).getByText("96 / 100")).toBeInTheDocument();

    const library = await card("Library");
    expect(library.getByText("Owned")).toBeInTheDocument();
    expect(library.getByText("Steam Progress Sync")).toBeInTheDocument();
  });

  // The three IGDB time-to-beat figures, in hours. Only the ones recorded get
  // a row; with none recorded the card is left out.
  it("shows the recorded time-to-beat figures on a Time to Beat card", async () => {
    mockFetch({
      isAdmin: false,
      game: { ...GAME, hltb_main: 45, hltb_main_extra: 72.5, hltb_completionist: null },
    });
    mount();

    const ttb = within(
      (await screen.findByRole("heading", { name: "Time to Beat" })).closest("section"),
    );
    expect(ttb.getByText("Main")).toBeInTheDocument();
    expect(ttb.getByText("45 h")).toBeInTheDocument();
    expect(ttb.getByText("Main + Extra")).toBeInTheDocument();
    expect(ttb.getByText("72.5 h")).toBeInTheDocument();
    expect(ttb.queryByText("Completionist")).toBeNull();
  });

  it("leaves the Time to Beat card out when no figure is recorded", async () => {
    mockFetch({ isAdmin: false });
    mount();

    await screen.findByRole("heading", { name: "Test Game" });
    expect(screen.queryByRole("heading", { name: "Time to Beat" })).toBeNull();
  });
});

// The playing status, rating and To Replay are the viewer's own list row:
// drawn and enabled for a holder of self.list who is not an editor, written
// through /api/me and never the catalogue PATCH, and not drawn without it.
// The completion axes are columns on the game, so they stay an editor's.
describe("Game detail page own tracker", () => {
  const GAME = {
    system_id: "g1",
    game_name_en: "Test Game",
    franchise_id: null,
    series_id: null,
    cover_image_file: null,
    playing_status: "Active Playing",
    my_rating: null,
    to_replay: false,
    completion_level: "Main Story",
    all_endings: "No",
  };

  function mockFetch({ admin = false, permissions = [] } = {}) {
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init) => {
        const u = String(url);
        let body = [];
        if (init?.method === "PUT" && u.startsWith("/api/me/list/")) {
          body = { media_id: "g1", media_type: "game", ...JSON.parse(init.body) };
        } else if (init?.method === "PUT" && u.startsWith("/api/me/plan-flags/")) {
          body = JSON.parse(init.body);
        } else if (init?.method === "PATCH") {
          body = { ...GAME, ...JSON.parse(init.body) };
        } else if (u.startsWith("/api/auth/me")) {
          body = { is_admin: admin, username: "reader", role: admin ? "super" : "user", permissions };
        } else if (u.startsWith("/api/game/g1")) {
          body = GAME;
        }
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
      }),
    );
  }

  afterEach(() => vi.unstubAllGlobals());

  function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={["/game/g1"]}>
              <Routes>
                <Route path="/game/:publicId/:slug?" element={<Game />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  }

  const puts = (prefix) =>
    fetch.mock.calls.filter(([url, init]) => init?.method === "PUT" && String(url).startsWith(prefix));
  const patches = () => fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

  it("saves the playing status through /api/me/list for a list holder", async () => {
    mockFetch({ permissions: ["self.list"] });
    mount();
    const status = await screen.findByRole("combobox", { name: "Playing Status" });
    expect(status).toBeEnabled();
    fireEvent.change(status, { target: { value: "Completed" } });
    await waitFor(() => expect(puts("/api/me/list/")).toHaveLength(1));
    expect(puts("/api/me/list/")[0][0]).toBe("/api/me/list/g1");
    expect(JSON.parse(puts("/api/me/list/")[0][1].body)).toEqual({ playing_status: "Completed" });
    expect(patches()).toHaveLength(0);
  });

  it("saves To Replay through /api/me/plan-flags", async () => {
    mockFetch({ permissions: ["self.list"] });
    mount();
    fireEvent.click(await screen.findByRole("checkbox", { name: "To Replay" }));
    await waitFor(() => expect(puts("/api/me/plan-flags/")).toHaveLength(1));
    expect(puts("/api/me/plan-flags/")[0][0]).toBe("/api/me/plan-flags/g1");
    expect(JSON.parse(puts("/api/me/plan-flags/")[0][1].body)).toEqual({ to_replay: true });
    expect(patches()).toHaveLength(0);
  });

  it("reads the completion axes without editing them, for a list holder who is not an editor", async () => {
    mockFetch({ permissions: ["self.list"] });
    mount();
    await screen.findByRole("combobox", { name: "Playing Status" });
    expect(screen.queryByLabelText("All Endings")).not.toBeInTheDocument();
    expect(screen.getByText("Main Story")).toBeInTheDocument();
  });

  it("draws no tracker without self.list", async () => {
    mockFetch({ permissions: [] });
    mount();
    await screen.findByRole("heading", { name: "Test Game" });
    expect(screen.queryByText("My tracker")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Playing Status" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "To Replay" })).toBeNull();
  });

  it("gives an editor without self.list the completion axes, through the PATCH, and no tracker", async () => {
    mockFetch({ admin: true, permissions: ["manage.catalog"] });
    mount();
    const endings = await screen.findByLabelText("All Endings");
    expect(screen.queryByText("My tracker")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Playing Status" })).toBeNull();
    fireEvent.change(endings, { target: { value: "Yes" } });
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(String(patches()[0][0])).toBe("/api/game/g1");
    expect(JSON.parse(patches()[0][1].body)).toEqual({ all_endings: "Yes" });
    expect(puts("/api/me/")).toHaveLength(0);
  });
});
