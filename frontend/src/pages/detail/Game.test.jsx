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
            is_admin: isAdmin,
            username: isAdmin ? "admin" : null,
            role: isAdmin ? "admin" : "guest",
            is_root: isAdmin,
            permissions: [],
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
