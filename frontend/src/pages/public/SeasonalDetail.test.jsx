// One season, its anime grouped into sections by watching status.
//
// The thing worth pinning is the section split: an anime waiting for its
// season to air and one simply queued up are different intentions, so they
// get separate sections here as they do on the Next Season tab of /seasonal.
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SeasonalDetail from "./SeasonalDetail";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false }),
}));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));
vi.mock("../../components/tracker/DashboardCard", () => ({
  default: ({ anime }) => <div>{anime.display_name}</div>,
}));
vi.mock("../../components/info/RatingDistributionBlock", () => ({
  default: () => null,
}));

const SEASONAL = {
  seasonal_id: "SPR 2026",
  my_rating: null,
  entry_completed: 1,
  entry_watching: 0,
  entry_planned: 2,
  entry_dropped: 0,
};

function anime(id, name, status) {
  return {
    system_id: id,
    display_name: name,
    watching_status: status,
    franchise_id: null,
    my_rating: null,
  };
}

const ANIME = [
  anime("a1", "葬送的芙莉蓮", "Completed"),
  anime("a2", "藥師少女的獨語", "Watch When Airs"),
  anime("a3", "膽大黨", "Plan to Watch"),
];

function respond(url) {
  if (url.startsWith("/api/seasonal/")) return SEASONAL;
  if (url.startsWith("/api/anime/")) return ANIME;
  return [];
}

function renderAt(seasonalId = "SPR 2026") {
  return render(
    <MemoryRouter initialEntries={[`/seasonal/${encodeURIComponent(seasonalId)}`]}>
      <Routes>
        <Route path="/seasonal/:seasonal_id" element={<SeasonalDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SeasonalDetail", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => ({ ok: true, status: 200, json: async () => respond(url) })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits planned anime into Watch When Airs and Plan to Watch", async () => {
    renderAt();
    const headings = (
      await screen.findAllByRole("heading", { level: 2 })
    ).map((h) => h.textContent);
    expect(headings).toEqual(["Completed", "Watch When Airs", "Plan to Watch"]);
  });

  it("puts each anime under its own status's section", async () => {
    renderAt();
    const whenAirs = await screen.findByRole("heading", { level: 2, name: "Watch When Airs" });
    const planned = screen.getByRole("heading", { level: 2, name: "Plan to Watch" });
    expect(whenAirs.closest("section")).toHaveTextContent("藥師少女的獨語");
    expect(whenAirs.closest("section")).not.toHaveTextContent("膽大黨");
    expect(planned.closest("section")).toHaveTextContent("膽大黨");
    expect(planned.closest("section")).not.toHaveTextContent("藥師少女的獨語");
  });
});
