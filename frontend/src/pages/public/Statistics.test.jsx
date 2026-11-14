// /statistics in both versions.
//
// With a list, the personal page: built from the viewer's own lists
// (useStatisticsData), with Favourites, the franchise summary and game
// spend. Without one, counts of the catalogue from /api/statistics/catalogue,
// and the personal sections are absent - not drawn empty - and their data is
// never asked for.
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Statistics from "./Statistics";

const auth = vi.hoisted(() => ({ held: new Set(["self.list"]) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, has: (p) => auth.held.has(p) }),
}));

const personalData = vi.hoisted(() => vi.fn());
vi.mock("../statistics/useStatisticsData", () => ({ default: personalData }));
vi.mock("../statistics/StatsSidebar", () => ({ default: () => <nav>Stats sidebar</nav> }));
vi.mock("../statistics/StatsFavoriteGrids", () => ({ default: () => <div>favourite grids</div> }));
vi.mock("../statistics/StatsFranchiseSummary", () => ({
  default: () => <section>Rating distribution</section>,
}));
vi.mock("../statistics/StatsGameSpend", () => ({ default: () => <section>Game spend</section> }));

const CATALOGUE = {
  by_type: { manga: 4, anime: 7 },
  by_season: [{ season: "SPR 2026", entry_count: 3 }],
  by_genre: [{ genre: "奇幻", entry_count: 5 }],
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Statistics />
    </QueryClientProvider>,
  );
}

const fetchedUrls = () => fetch.mock.calls.map(([url]) => String(url));

describe("Statistics", () => {
  beforeEach(() => {
    personalData.mockReset();
    personalData.mockReturnValue({ franchises: [{ system_id: "f1" }], loading: false, error: null });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => CATALOGUE,
        text: async () => JSON.stringify(CATALOGUE),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("with a list", () => {
    beforeEach(() => {
      auth.held = new Set(["self.list"]);
    });

    it("draws the personal sections from the viewer's own data", () => {
      renderPage();
      expect(personalData).toHaveBeenCalled();
      expect(screen.getByRole("heading", { level: 2, name: "Favourites" })).toBeInTheDocument();
      expect(screen.getByText("Game spend")).toBeInTheDocument();
      expect(screen.getByText("Stats sidebar")).toBeInTheDocument();
    });

    it("does not ask for the catalogue counts", () => {
      renderPage();
      expect(fetchedUrls()).not.toContain("/api/statistics/catalogue");
      expect(screen.queryByRole("heading", { name: "Entries by type" })).toBeNull();
    });
  });

  describe("without a list", () => {
    beforeEach(() => {
      auth.held = new Set();
    });

    it("counts the catalogue by type, season and genre", async () => {
      renderPage();
      const types = await screen.findByRole("table", { name: "Entries by type" });
      const rows = within(types).getAllByRole("row").slice(1);
      // The registry's order: anime before manga, whatever the payload's.
      expect(rows.map((r) => r.textContent)).toEqual(["Anime7", "Manga4"]);
      expect(
        within(screen.getByRole("table", { name: "Anime by season" })).getByText("SPR 2026"),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("table", { name: "Entries by genre" })).getByText("奇幻"),
      ).toBeInTheDocument();
      expect(screen.getByText("11 entries in the catalogue")).toBeInTheDocument();
      expect(fetchedUrls()).toContain("/api/statistics/catalogue");
    });

    it("leaves the personal sections out, and never asks for their data", async () => {
      renderPage();
      await screen.findByRole("table", { name: "Entries by type" });
      expect(personalData).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Favourites" })).toBeNull();
      expect(screen.queryByText("Game spend")).toBeNull();
      expect(screen.queryByText("Rating distribution")).toBeNull();
      expect(screen.queryByText("Stats sidebar")).toBeNull();
      expect(fetchedUrls().some((u) => u.startsWith("/api/seasonal"))).toBe(false);
    });
  });
});
