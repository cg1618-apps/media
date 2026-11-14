// /future-releases in both versions.
//
// With a list, a group is ordered by the viewer's own status, and every card
// carries an on-your-list marker (any status) and a plan marker (any plan
// flag). Without one, the same entries are in release-date order with no
// marker at all - although the fixture still carries a status and a plan
// flag, so the absence is the page's and not the data's.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import FutureReleases from "./FutureReleases";

const auth = vi.hoisted(() => ({ held: new Set(["self.list"]) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, has: (p) => auth.held.has(p) }),
}));
vi.mock("../../components/cards/MediaCard", () => ({
  default: ({ data }) => <div data-testid="media-card">{data.display_name}</div>,
}));
vi.mock("../../hooks/useApiQuery", () => ({
  useApiQuery: () => ({ data: { current_season: "SPR 2026" }, isLoading: false, error: null }),
}));

const listCalls = vi.hoisted(() => []);
const DATA = vi.hoisted(() => ({
  anime: [
    // Earliest release, but only "Might Watch" on the viewer's list.
    {
      system_id: "a1",
      display_name: "早",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date: "2026-07-01",
      watching_status: "Might Watch",
    },
    // Latest release, but the viewer is waiting for it, and plans it.
    {
      system_id: "a2",
      display_name: "晚",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date: "2026-08-20",
      watching_status: "Watch When Airs",
      watch_next: true,
    },
    // Neither on the list nor planned: no marker in either version.
    {
      system_id: "a3",
      display_name: "中",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date: "2026-07-15",
      watching_status: null,
      watch_next: false,
    },
  ],
}));
vi.mock("../../hooks/useMediaList", () => ({
  useMediaList: (type, options = {}) => {
    listCalls.push({ type, enabled: options.enabled !== false });
    return {
      data: options.enabled === false ? undefined : DATA[type] || [],
      isLoading: false,
      error: null,
    };
  },
}));

function renderPage() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <FutureReleases />
    </QueryClientProvider>,
  );
}

const cardNames = () => screen.getAllByTestId("media-card").map((c) => c.textContent);
const cardOf = (name) => screen.getByText(name).parentElement;

describe("FutureReleases", () => {
  beforeEach(() => {
    listCalls.length = 0;
  });

  describe("with a list", () => {
    beforeEach(() => {
      auth.held = new Set(["self.list"]);
    });

    it("orders a group by the viewer's status, not by date", () => {
      renderPage();
      expect(cardNames()).toEqual(["晚", "早", "中"]);
    });

    it("marks what is on the list and what is planned", () => {
      renderPage();
      expect(cardOf("晚")).toHaveTextContent("On your list");
      expect(cardOf("晚")).toHaveTextContent("Planned");
      expect(cardOf("早")).toHaveTextContent("On your list");
      expect(cardOf("早")).not.toHaveTextContent("Planned");
      expect(cardOf("中")).not.toHaveTextContent("On your list");
      expect(cardOf("中")).not.toHaveTextContent("Planned");
    });

    it("reads the franchise list its expectation sort needs", () => {
      renderPage();
      expect(listCalls).toContainEqual({ type: "franchise", enabled: true });
    });
  });

  describe("without a list", () => {
    beforeEach(() => {
      auth.held = new Set();
    });

    it("orders a group by release date", () => {
      renderPage();
      expect(cardNames()).toEqual(["早", "中", "晚"]);
    });

    it("draws no personal marker, though the entries carry a status and a plan flag", () => {
      renderPage();
      expect(screen.queryByText("On your list")).toBeNull();
      expect(screen.queryByText("Planned")).toBeNull();
      expect(screen.queryByTestId("list-markers")).toBeNull();
    });

    it("does not read the franchise list", () => {
      renderPage();
      expect(listCalls).toContainEqual({ type: "franchise", enabled: false });
    });
  });
});
