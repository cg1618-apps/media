// /seasonal in both versions.
//
// With a list (self.list) the page is the viewer's own season: the anime
// split by watching status and the All Seasons table built from the viewer's
// seasonal rows. Without one it is the catalogue's: the season's anime in
// one grid and the All Seasons table from /api/seasonal/catalogue, with no
// read of /api/seasonal/ (a self.list route that refuses such a viewer).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SeasonalOverall from "./SeasonalOverall";

const auth = vi.hoisted(() => ({ held: new Set(["self.list"]) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, has: (p) => auth.held.has(p) }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../components/tracker/DashboardCard", () => ({
  default: ({ anime }) => <div data-testid="dashboard-card">{anime.display_name}</div>,
}));
vi.mock("../../components/cards/MediaCard", () => ({
  default: ({ data }) => <div data-testid="media-card">{data.display_name}</div>,
}));
vi.mock("../../components/info/RatingDistributionBlock", () => ({
  default: () => null,
}));

function anime(id, name, status, mal) {
  return {
    system_id: id,
    display_name: name,
    watching_status: status,
    franchise_id: null,
    my_rating: null,
    mal_rating: mal,
  };
}

// Both carry a status, so the list version has something to split on and
// the catalogue version's single grid is a choice, not an empty split.
const THIS_SEASON = [
  anime("a1", "葬送的芙莉蓮", "Completed", 9.3),
  anime("a2", "膽大黨", "Plan to Watch", 8.1),
];

const SEASONAL_ROWS = [{ seasonal: "SPR 2026", entry_completed: 1, entry_planned: 1 }];
const CATALOGUE_SEASONS = [
  { season: "SPR 2026", entry_count: 2 },
  { season: "FAL 2025", entry_count: 5 },
];

function respond(url) {
  if (url === "/api/seasonal/current-season") return { current_season: "SPR 2026" };
  if (url === "/api/seasonal/catalogue") return CATALOGUE_SEASONS;
  if (url === "/api/seasonal/") return SEASONAL_ROWS;
  if (url.startsWith("/api/anime/") && url.includes("SPR%202026")) return THIS_SEASON;
  return [];
}

function renderPage() {
  return render(
    <MemoryRouter>
      <SeasonalOverall />
    </MemoryRouter>,
  );
}

const fetchedUrls = () => fetch.mock.calls.map(([url]) => url);

describe("SeasonalOverall", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({ ok: true, status: 200, json: async () => respond(url) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("with a list", () => {
    beforeEach(() => {
      auth.held = new Set(["self.list"]);
    });

    it("splits the season's anime by the viewer's status", async () => {
      renderPage();
      expect(await screen.findByRole("heading", { level: 3, name: "Completed" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 3, name: "Planned" })).toBeInTheDocument();
      expect(screen.getAllByTestId("dashboard-card")).toHaveLength(2);
    });

    it("reads the viewer's own seasonal rows, not the catalogue's seasons", async () => {
      renderPage();
      await screen.findAllByTestId("dashboard-card");
      expect(fetchedUrls()).toContain("/api/seasonal/");
      expect(fetchedUrls()).not.toContain("/api/seasonal/catalogue");
    });
  });

  describe("without a list", () => {
    beforeEach(() => {
      auth.held = new Set();
    });

    it("shows the season's anime in one grid, best external score first", async () => {
      renderPage();
      const cards = await screen.findAllByTestId("media-card");
      expect(cards.map((c) => c.textContent)).toEqual(["葬送的芙莉蓮", "膽大黨"]);
      expect(screen.queryByRole("heading", { level: 3, name: "Completed" })).toBeNull();
      expect(screen.queryByTestId("dashboard-card")).toBeNull();
    });

    it("never reads the viewer's own seasonal rows or a season rating", async () => {
      renderPage();
      await screen.findAllByTestId("media-card");
      expect(fetchedUrls()).not.toContain("/api/seasonal/");
      expect(fetchedUrls()).not.toContain("/api/franchise/");
      expect(screen.queryByText("Seasonal rating")).toBeNull();
    });

    it("builds All Seasons from the catalogue, with each season's count", async () => {
      renderPage();
      await screen.findAllByTestId("media-card");
      fireEvent.click(screen.getByRole("button", { name: "All seasons" }));
      const spring = screen.getByRole("link", { name: /SPR 2026/ });
      expect(within(spring).getByText("2")).toBeInTheDocument();
      const fall = screen.getByRole("link", { name: /FAL 2025/ });
      expect(within(fall).getByText("5")).toBeInTheDocument();
      expect(fetchedUrls()).toContain("/api/seasonal/catalogue");
    });
  });
});
