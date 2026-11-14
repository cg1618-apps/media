// /statistics in both versions.
//
// With a list, the personal page - built from the viewer's own lists
// (useStatisticsData), with Favourites, the franchise summary and game spend -
// and the catalogue sections below it. Without one, the catalogue sections
// alone, from /api/statistics/catalogue: the personal sections are absent -
// not drawn empty - and their data is never asked for.
import { fireEvent, render, screen, within } from "@testing-library/react";
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

// Fourteen seasons, newest first, so two of them sit past the twelve shown.
const SEASONS = Array.from({ length: 14 }, (_, i) => ({
  season: `SPR ${2026 - i}`,
  entry_count: i + 1,
}));

const CATALOGUE = {
  by_type: [
    { media_type: "manga", entry_count: 4, franchise_count: 3 },
    { media_type: "anime", entry_count: 7, franchise_count: 2 },
  ],
  by_season: SEASONS,
  scores: {
    mal: [
      { media_type: "anime", bucket: 8, entry_count: 5 },
      { media_type: "manga", bucket: 7, entry_count: 2 },
    ],
    anilist: [{ media_type: "anime", bucket: 80, entry_count: 4 }],
  },
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

    it("draws the catalogue sections below the personal ones", async () => {
      renderPage();
      expect(await screen.findByRole("table", { name: "Entries by type" })).toBeInTheDocument();
      expect(screen.getByRole("table", { name: "Anime by season" })).toBeInTheDocument();
      expect(fetchedUrls()).toContain("/api/statistics/catalogue");
      expect(screen.getByText("Game spend")).toBeInTheDocument();
    });
  });

  describe("without a list", () => {
    beforeEach(() => {
      auth.held = new Set();
    });

    it("counts franchises and entries per type, in registry order", async () => {
      renderPage();
      const types = await screen.findByRole("table", { name: "Entries by type" });
      const rows = within(types).getAllByRole("row");
      expect(rows[0].textContent).toBe("TypeFranchisesEntries");
      // The registry's order: anime before manga, whatever the payload's.
      expect(rows.slice(1).map((r) => r.textContent)).toEqual(["Anime27", "Manga34"]);
      expect(screen.getByText("11 entries in the catalogue")).toBeInTheDocument();
      expect(fetchedUrls()).toContain("/api/statistics/catalogue");
    });

    it("shows the twelve newest seasons, and every season behind Show all", async () => {
      renderPage();
      const seasons = await screen.findByRole("table", { name: "Anime by season" });
      const rows = within(seasons).getAllByRole("row").slice(1);
      expect(rows).toHaveLength(12);
      expect(rows[0].textContent).toBe("SPR 20261");
      expect(within(seasons).queryByText("SPR 2013")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Show all 14" }));
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByText("SPR 2013")).toBeInTheDocument();
      expect(within(dialog).getByText("SPR 2026")).toBeInTheDocument();

      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("has no genre table", async () => {
      renderPage();
      await screen.findByRole("table", { name: "Entries by type" });
      expect(screen.queryByText("Entries by genre")).toBeNull();
    });

    it("pools each score over every type, and narrows to the type picked", async () => {
      renderPage();
      const picker = await screen.findByRole("combobox", { name: "MAL rating media type" });
      expect(screen.getByText("7 scored")).toBeInTheDocument();
      fireEvent.change(picker, { target: { value: "manga" } });
      expect(screen.getByText("2 scored")).toBeInTheDocument();
      // AniList's chart keeps its own selection.
      expect(screen.getByText("4 scored")).toBeInTheDocument();
    });

    it("leaves the personal sections out, and never asks for their data", async () => {
      renderPage();
      await screen.findByRole("table", { name: "Entries by type" });
      expect(personalData).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Favourites" })).toBeNull();
      expect(screen.queryByText("Game spend")).toBeNull();
      // The personal summary's mock renders this text; the catalogue's own
      // chart is headed "Rating distribution" too, so ask for the mock's tag.
      expect(screen.queryByText("Rating distribution", { selector: "section" })).toBeNull();
      expect(screen.queryByText("Stats sidebar")).toBeNull();
      expect(fetchedUrls().some((u) => u.startsWith("/api/seasonal"))).toBe(false);
    });
  });
});
