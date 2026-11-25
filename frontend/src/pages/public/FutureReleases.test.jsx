// /future-releases in both versions.
//
// With a list, a group is ordered by the viewer's own status, and every card
// carries an on-your-list marker (any status) and a plan marker (any plan
// flag). Without one, the same entries are in release-date order with no
// marker at all - although the fixture still carries a status and a plan
// flag, so the absence is the page's and not the data's.
//
// Books and manga are upcoming by date. "Today" is pinned to 2026-11-17, and
// every past-date fixture below carries a real date - one the page would list
// if it stopped comparing against today - so their absence is the date
// check's doing and not an empty fixture's.
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import FutureReleases from "./FutureReleases";

const auth = vi.hoisted(() => ({ held: new Set(["self.list"]) }));
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, has: (p) => auth.held.has(p) }),
}));
// The frame only: the title, and what FutureReleaseCard puts under it, which
// is where a manga's next volume and a book's date are drawn.
vi.mock("../../components/cards/MediaCard", () => ({
  default: ({ data, coverBadges, meta }) => (
    <div data-testid="media-card">
      <span data-testid="card-title">{data.display_name}</span>
      {coverBadges}
      {meta}
    </div>
  ),
  MetaLine: ({ children }) => <div>{children}</div>,
  OVERLAY_CLS: "",
  OVERLAY_BRAND_CLS: "",
  PLATFORM_BOX_CLS: "",
}));
vi.mock("../../hooks/useApiQuery", () => ({
  useApiQuery: () => ({ data: { current_season: "SPR 2026" }, isLoading: false, error: null }),
}));

const listCalls = vi.hoisted(() => []);
const DATA = vi.hoisted(() => ({
  franchise: [{ system_id: "f1", franchise_expectation: "Highest" }],
  "anime-movie": [
    {
      system_id: "am1",
      display_name: "劇場版",
      release_status: "Not Released",
      release_date_jp: "2027-04-01",
      franchise_id: "f1",
    },
  ],
  anime: [
    // Earliest release, but only "Might Watch" on the viewer's list.
    {
      system_id: "a1",
      display_name: "早",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date_jp: "2026-07-01",
      watching_status: "Might Watch",
    },
    // Latest release, but the viewer is waiting for it, and plans it.
    {
      system_id: "a2",
      display_name: "晚",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date_jp: "2026-08-20",
      watching_status: "Watch When Airs",
      watch_next: true,
    },
    // Neither on the list nor planned: no marker in either version.
    {
      system_id: "a3",
      display_name: "中",
      airing_status: "Not Yet Aired",
      release_season: "SUM",
      release_date_jp: "2026-07-15",
      watching_status: null,
      watch_next: false,
    },
  ],
  book: [
    // Its own JP date is ahead.
    { system_id: "b1", display_name: "未來之書", release_date_jp: "2027-02" },
    // Out long ago, but its fifth volume is ahead; its fourth is out.
    {
      system_id: "b2",
      display_name: "舊書有新卷",
      release_date_jp: "2010",
      units: [
        {
          system_id: "u4",
          display_key: "Vol. 4",
          name_cn: "第四卷",
          release_date_jp: "2026-10-01",
        },
        {
          system_id: "u5",
          display_key: "Vol. 5",
          name_cn: "第五卷",
          release_date_tw: "2027-01-10",
          cover_image_file: "library/u5.jpg",
        },
      ],
    },
    // Dated, book and unit alike, but every date has passed.
    {
      system_id: "b3",
      display_name: "已出版",
      release_date_jp: "2026-11-01",
      release_date_tw: "2026-10",
      units: [
        { system_id: "u9", display_key: "Vol. 1", name_cn: "舊卷", release_date_jp: "2025-05" },
      ],
    },
  ],
  manga: [
    { system_id: "m1", display_name: "下卷將至", next_vol_release_date_jp: "2027-01-05" },
    {
      system_id: "m2",
      display_name: "下卷已出",
      next_vol_release_date_jp: "2026-11-01",
      next_vol_release_date_tw: "2026-10",
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

const cardNames = () => screen.getAllByTestId("card-title").map((c) => c.textContent);
// The card and the markers under it.
const cardOf = (name) => screen.getByText(name).parentElement.parentElement;

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

    // Every tab's card, not only the anime one, carries the type and the
    // viewer's expectation.
    it("badges an anime movie with its type and its franchise expectation", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Anime movies" }));
      const card = cardOf("劇場版");
      expect(card).toHaveTextContent("Movie");
      expect(card).toHaveTextContent("Highest");
      expect(card).toHaveTextContent("2027-04-01");
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

    it("badges an anime movie with its type and no expectation", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: "Anime movies" }));
      const card = cardOf("劇場版");
      expect(card).toHaveTextContent("Movie");
      expect(card).not.toHaveTextContent("Highest");
    });
  });
});

describe("books and manga", () => {
  beforeEach(() => {
    auth.held = new Set();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const openTab = (name) => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name }));
  };
  // The card, with its dates, and the units under it.
  const rowOf = (name) => screen.getByText(name).parentElement.parentElement.parentElement;

  it("lists a book whose own release date is ahead, dated on its card", () => {
    openTab("Books");
    expect(rowOf("未來之書")).toHaveTextContent("2027-02");
  });

  it("lists a book for an upcoming unit, with the unit under it by name", () => {
    openTab("Books");
    const row = rowOf("舊書有新卷");
    expect(row).toHaveTextContent("第五卷");
    expect(row).toHaveTextContent("TW 2027-01-10");
    expect(row.querySelector('img[alt="Cover of Vol. 5"]')).not.toBeNull();
    // The unit already out is not why it is here.
    expect(row).not.toHaveTextContent("第四卷");
  });

  it("drops a book whose every date, and every unit's, has passed", () => {
    openTab("Books");
    expect(screen.queryByText("已出版")).toBeNull();
    expect(screen.queryByText("舊卷")).toBeNull();
  });

  it("orders the books by their earliest upcoming date", () => {
    openTab("Books");
    expect(cardNames()).toEqual(["舊書有新卷", "未來之書"]);
  });

  it("lists a manga whose next volume is ahead", () => {
    openTab("Manga");
    expect(rowOf("下卷將至")).toHaveTextContent("Next vol. JP 2027-01-05");
  });

  it("drops a manga whose next volume is out in both regions", () => {
    openTab("Manga");
    expect(cardNames()).toEqual(["下卷將至"]);
    expect(screen.queryByText("下卷已出")).toBeNull();
  });

  it("reads the book and manga lists only on their own tabs", () => {
    renderPage();
    expect(listCalls).toContainEqual({ type: "book", enabled: false });
    expect(listCalls).toContainEqual({ type: "manga", enabled: false });
    fireEvent.click(screen.getByRole("button", { name: "Books" }));
    expect(listCalls).toContainEqual({ type: "book", enabled: true });
  });
});
