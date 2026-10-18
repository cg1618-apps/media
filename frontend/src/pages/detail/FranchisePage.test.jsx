// Frontend: the franchise hub's media tab counts.
//
// Every media tab carries the number of entries it lists. A tab whose label
// had no count showed "Game 0" beside a full list of games.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FranchisePage from "./FranchisePage";
import { ToastProvider } from "../../hooks/useToast";
import { AuthProvider } from "../../contexts/AuthContext";

const FRANCHISE = {
  system_id: "FR001",
  franchise_name_en: "Elden Ring",
  franchise_type: "Game",
};

const GAMES = [
  {
    system_id: "GM001",
    game_name_en: "Elden Ring",
    game_type: "Base Game",
    playing_status: "Completed",
  },
  {
    system_id: "GM002",
    game_name_en: "Shadow of the Erdtree",
    game_type: "DLC",
    playing_status: "Plan to Play",
  },
];

const H_GAMES = [
  {
    system_id: "HG001",
    h_game_name_en: "Doujin Game",
    playing_status: "Plan to Play",
  },
];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

let franchise = FRANCHISE;

beforeEach(() => {
  franchise = FRANCHISE;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/franchise/FR001")) return jsonRes(franchise);
      if (u.startsWith("/api/game/")) return jsonRes(GAMES);
      if (u.startsWith("/api/h-game/")) return jsonRes(H_GAMES);
      return jsonRes([]);
    }),
  );
});

const hGameFetched = () =>
  fetch.mock.calls.some(([url]) => String(url).startsWith("/api/h-game/"));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/franchise/FR001"]}>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route
                path="/franchise/:publicId/:slug?"
                element={<FranchisePage />}
              />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("FranchisePage tab counts", () => {
  it("counts the Game tab", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /^Game\s*2$/ }),
    ).toBeInTheDocument();
  });
});

// The header's entry total and completion are taken over every listed tab,
// each type judged by its own status field.
describe("FranchisePage header totals", () => {
  it("counts the games and their completion", async () => {
    renderPage();
    expect(
      await screen.findByText(/2 entries\s+·\s+50% completed/),
    ).toBeInTheDocument();
  });
});

// The restricted family: an h-game may sit in a franchise of any of its three
// types, so a franchise typed H-Comic or Hentai asks for its h-games too, and
// a mainstream franchise never does.
describe("FranchisePage restricted family", () => {
  it.each(["H-Comic", "Hentai", "H-Game", "H-Comic, Hentai, H-Game"])(
    "lists the h-games of a %s franchise",
    async (franchiseType) => {
      franchise = { ...FRANCHISE, franchise_type: franchiseType };
      renderPage();
      expect(
        await screen.findByRole("button", { name: /^H-Game\s*1$/ }),
      ).toBeInTheDocument();
      expect(hGameFetched()).toBe(true);
    },
  );

  it("does not ask a mainstream franchise for h-games", async () => {
    renderPage();
    await screen.findByRole("button", { name: /^Game\s*2$/ });
    expect(hGameFetched()).toBe(false);
    expect(screen.queryByRole("button", { name: /^H-Game/ })).toBeNull();
  });
});
