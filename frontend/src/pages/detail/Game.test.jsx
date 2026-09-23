// Frontend: the game detail page's progress block.
//
// A game has no episode counter. Its progress is playtime against the
// main-story estimate, plus achievements when the game reports a total —
// so the block must render nothing at all rather than a misleading "0 h".
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
// drops the row rather than showing a zero.
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

// The admin toolbar's Replace: the single-entry Replace route has been
// registered for game all along (Steam only - playtime, achievements and the
// store figures drift), and the page is where an admin refreshes one entry.
describe("Game detail page — Replace", () => {
  const GAME = {
    system_id: "g1",
    game_name_en: "Test Game",
    franchise_id: null,
    series_id: null,
    cover_image_file: null,
  };

  function mockFetch({ isAdmin }) {
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
          body = GAME;
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
});
