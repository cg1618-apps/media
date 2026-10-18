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

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/franchise/FR001")) return jsonRes(FRANCHISE);
      if (u.startsWith("/api/game/")) return jsonRes(GAMES);
      return jsonRes([]);
    }),
  );
});

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
