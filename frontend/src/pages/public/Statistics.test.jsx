// /statistics in both versions.
//
// With a list, the personal page - built from the viewer's own lists
// (useStatisticsData), with Favourite Media, the franchise summary and game
// spend - and the catalogue sections below it, with a table of contents on
// the right. Without one, the catalogue sections
// alone, from /api/statistics/catalogue: the personal sections are absent -
// not drawn empty - and their data is never asked for.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Statistics from "./Statistics";

const auth = vi.hoisted(() => ({ held: new Set(["self.list"]), gated: [] }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAdmin: false,
    has: (p) => auth.held.has(p),
    visibleGatedTypes: auth.gated,
  }),
}));

const personalData = vi.hoisted(() => vi.fn());
vi.mock("../statistics/useStatisticsData", () => ({ default: personalData }));
// The favourites section keeps its real heading and anchor; only the grids,
// which need the whole favourites pool, are stood in for.
vi.mock("../statistics/StatsFavoriteGrids", () => ({
  StatsFavoriteSection: ({ section }) => (
    <section id={section.id}>
      <h2>{section.label}</h2>
      {section.grids.map((grid) => (
        <div key={grid.id} id={grid.id}>
          {grid.title}
        </div>
      ))}
    </section>
  ),
}));
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
    imdb: [
      { media_type: "movie", bucket: 7, entry_count: 3 },
      { media_type: "tv-show", bucket: 8, entry_count: 6 },
    ],
    metacritic: [{ media_type: "game", bucket: 90, entry_count: 8 }],
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
      auth.gated = [];
    });

    it("draws the personal sections from the viewer's own data", () => {
      renderPage();
      expect(personalData).toHaveBeenCalled();
      expect(screen.getByRole("heading", { level: 2, name: "Favourite Media" })).toBeInTheDocument();
      expect(screen.getByText("Game spend", { selector: "section" })).toBeInTheDocument();
    });

    it("has no page header above the first section", () => {
      renderPage();
      expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
      expect(screen.queryByText(/franchises tracked/)).toBeNull();
      expect(screen.queryByText("Archive")).toBeNull();
    });

    it("lists every section in the contents column, each favourite grid under its section", () => {
      renderPage();
      const contents = screen.getByRole("navigation", { name: "Contents" });
      const rows = within(contents).getAllByRole("button").map((b) => b.textContent);
      expect(rows.slice(0, 2)).toEqual(["Favourite Media", "AniManga"]);
      expect(rows).toContain("Game spend");
      expect(rows.at(-1)).toBe("Catalogue ratings");
      // A gated grid is left out for a session that cannot see its type.
      expect(rows).toContain("Game entries");
      expect(rows).not.toContain("H-Game entries");
    });

    it("lists a gated grid for a session that can see its type", () => {
      auth.gated = ["h-game"];
      renderPage();
      const contents = screen.getByRole("navigation", { name: "Contents" });
      const rows = within(contents).getAllByRole("button").map((b) => b.textContent);
      expect(rows).toContain("H-Game entries");
    });

    it("chips only the main sections below xl", () => {
      renderPage();
      const bar = screen.getByRole("navigation", { name: "Sections" });
      const chips = within(bar).getAllByRole("button").map((b) => b.textContent);
      expect(chips[0]).toBe("Favourite Media");
      expect(chips).not.toContain("AniManga");
    });

    it("draws the catalogue sections below the personal ones", async () => {
      renderPage();
      expect(await screen.findByRole("table", { name: "Entries by type" })).toBeInTheDocument();
      expect(screen.getByRole("table", { name: "Anime by season" })).toBeInTheDocument();
      expect(fetchedUrls()).toContain("/api/statistics/catalogue");
      expect(screen.getByText("Game spend", { selector: "section" })).toBeInTheDocument();
    });
  });

  // Favourite Entity draws studios and people, so it needs both view
  // permissions. The refusal case holds view.studio alone, so a gate that only
  // checked one of the two would let it through.
  describe("Favourite Entity", () => {
    const contentsRows = () =>
      within(screen.getByRole("navigation", { name: "Contents" }))
        .getAllByRole("button")
        .map((b) => b.textContent);

    it("is drawn, listed and fetched for a viewer holding both", () => {
      auth.held = new Set(["self.list", "view.studio", "view.person"]);
      renderPage();
      expect(screen.getByRole("heading", { level: 2, name: "Favourite Entity" })).toBeInTheDocument();
      expect(document.getElementById("female-seiyuu")).toHaveTextContent("Female seiyuu");
      expect(contentsRows()).toContain("Favourite Entity");
      expect(fetchedUrls()).toEqual(expect.arrayContaining(["/api/studio/", "/api/person/"]));
    });

    it("is absent, unlisted and unfetched without view.person", () => {
      auth.held = new Set(["self.list", "view.studio"]);
      renderPage();
      expect(screen.queryByRole("heading", { level: 2, name: "Favourite Entity" })).toBeNull();
      expect(contentsRows()).not.toContain("Favourite Entity");
      expect(fetchedUrls()).not.toContain("/api/studio/");
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

    it("charts the IMDb rating and the Metacritic score beside MAL and AniList", async () => {
      renderPage();
      const imdb = await screen.findByRole("combobox", { name: "IMDb rating media type" });
      expect(screen.getByText("9 scored")).toBeInTheDocument();
      expect(screen.getByText("8 scored")).toBeInTheDocument();
      expect(
        screen.getByRole("combobox", { name: "Metacritic score media type" }),
      ).toBeInTheDocument();
      fireEvent.change(imdb, { target: { value: "movie" } });
      expect(screen.getByText("3 scored")).toBeInTheDocument();
    });

    it("leaves the personal sections out, and never asks for their data", async () => {
      renderPage();
      await screen.findByRole("table", { name: "Entries by type" });
      expect(personalData).not.toHaveBeenCalled();
      expect(screen.queryByRole("heading", { name: "Favourite Media" })).toBeNull();
      expect(screen.queryByText("Game spend")).toBeNull();
      // The personal summary's mock renders this text; the catalogue's own
      // chart is headed "Rating distribution" too, so ask for the mock's tag.
      expect(screen.queryByText("Rating distribution", { selector: "section" })).toBeNull();
      expect(fetchedUrls().some((u) => u.startsWith("/api/seasonal"))).toBe(false);
    });
  });
});
