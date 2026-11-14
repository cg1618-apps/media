// Frontend: the series hub's Game tab.
//
// A game can be filed under a series, so the series page has to fetch and show
// them; without the tab the entry exists but is invisible from its own series.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesPage from "./SeriesPage";
import { ToastProvider } from "../../hooks/useToast";
import { AuthProvider } from "../../contexts/AuthContext";

const SERIES = {
  system_id: "SR001",
  series_name_en: "Elden Ring Series",
  series_name_cn: "艾爾登法環系列",
};

const GAMES = [
  {
    system_id: "GM001",
    game_name_en: "Elden Ring",
    game_name_cn: "艾爾登法環",
    game_type: "Base Game",
    playing_status: "Completed",
    release_date: "2022-02-25",
    my_rating: "S",
  },
  {
    system_id: "GM002",
    game_name_en: "Shadow of the Erdtree",
    game_name_cn: "黃金樹幽影",
    game_type: "DLC",
    playing_status: "Plan to Play",
    release_date: "2024-06-21",
  },
];

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      if (String(url).startsWith("/api/series/")) return jsonRes(SERIES);
      if (String(url).startsWith("/api/game/")) return jsonRes(GAMES);
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
    <MemoryRouter initialEntries={["/series/SR001"]}>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/series/:publicId/:slug?" element={<SeriesPage />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </MemoryRouter>
    </QueryClientProvider>,
  );
}

const gameTab = (name) => name.startsWith("Game");

describe("SeriesPage games", () => {
  it("fetches the games filed under the series", async () => {
    renderPage();
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/game/?series_id=SR001",
        expect.objectContaining({ credentials: "include" }),
      ),
    );
  });

  it("offers a Game tab and lists them", async () => {
    const user = userEvent.setup();
    renderPage();
    // The tab label carries its count, so the name is matched by prefix.
    await user.click(await screen.findByRole("button", { name: gameTab }));
    expect(await screen.findByText("艾爾登法環")).toBeInTheDocument();
    expect(screen.getByText("黃金樹幽影")).toBeInTheDocument();
  });

  it("filters the list by playing status", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: gameTab }));
    await user.click(await screen.findByRole("button", { name: "Completed" }));
    await waitFor(() =>
      expect(screen.queryByText("黃金樹幽影")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("艾爾登法環")).toBeInTheDocument();
  });
});

// Every media tab carries the number of entries it lists. A tab whose label
// had no count showed 0 beside a full list.
describe("SeriesPage tab counts", () => {
  it("counts the Comic tab", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).startsWith("/api/series/")) return jsonRes(SERIES);
      if (String(url).startsWith("/api/comic/"))
        return jsonRes([
          { system_id: "CM001", comic_name_en: "One" },
          { system_id: "CM002", comic_name_en: "Two" },
        ]);
      return jsonRes([]);
    });
    renderPage();
    expect(
      await screen.findByRole("button", { name: /^Comic\s*2$/ }),
    ).toBeInTheDocument();
  });

  // The header's entry total and completion are taken over every listed tab,
  // each type judged by its own status field: one of two games and one of
  // two comics is completed.
  it("counts the comics and games in the header totals", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).startsWith("/api/series/")) return jsonRes(SERIES);
      if (String(url).startsWith("/api/game/")) return jsonRes(GAMES);
      if (String(url).startsWith("/api/comic/"))
        return jsonRes([
          { system_id: "CM001", comic_name_en: "One", reading_status: "Completed" },
          { system_id: "CM002", comic_name_en: "Two", reading_status: "Plan to Read" },
        ]);
      return jsonRes([]);
    });
    renderPage();
    expect(
      await screen.findByText(/4 entries\s+·\s+50% completed/),
    ).toBeInTheDocument();
  });

  it("counts the Game tab", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", { name: /^Game\s*2$/ }),
    ).toBeInTheDocument();
  });
});

// The restricted family: an h-game may sit under a franchise of any of its
// three types, so a series whose parent franchise is H-Comic asks for its
// h-games too - and one under a mainstream franchise never does, even for a
// session that may see the type.
describe("SeriesPage restricted family", () => {
  const H_GAMES = [
    { system_id: "HG001", h_game_name_en: "Doujin Game", playing_status: "Plan to Play" },
  ];

  function stubWithParent(franchiseType) {
    vi.stubGlobal(
      "fetch",
      vi.fn((url) => {
        const u = String(url);
        if (u.startsWith("/api/auth/me")) {
          return jsonRes({ username: "admin", is_admin: true, visible_gated_types: ["h-game"] });
        }
        if (u.startsWith("/api/series/")) return jsonRes({ ...SERIES, franchise_id: "FR001" });
        if (u.startsWith("/api/franchise/FR001")) {
          return jsonRes({ system_id: "FR001", franchise_name_en: "Doujin", franchise_type: franchiseType });
        }
        if (u.startsWith("/api/h-game/")) return jsonRes(H_GAMES);
        return jsonRes([]);
      }),
    );
  }

  const hGameFetched = () =>
    fetch.mock.calls.some(([url]) => String(url).startsWith("/api/h-game/"));

  it.each(["H-Comic", "Hentai", "H-Game"])(
    "lists the h-games of a series under a %s franchise",
    async (franchiseType) => {
      stubWithParent(franchiseType);
      renderPage();
      expect(
        await screen.findByRole("button", { name: /^H-Game\s*1$/ }),
      ).toBeInTheDocument();
    },
  );

  it("does not ask for h-games under a mainstream franchise", async () => {
    stubWithParent("Game");
    renderPage();
    await screen.findByText("Elden Ring Series");
    await waitFor(() =>
      expect(fetch.mock.calls.some(([url]) => String(url).startsWith("/api/franchise/FR001"))).toBe(true),
    );
    expect(hGameFetched()).toBe(false);
  });
});

// The series's rating and expectation are the viewer's own: a holder of
// self.list sees and edits them; a member with every view.* key but not
// self.list, on the same series, gets neither the editor nor the values.
describe("SeriesPage own rating and expectation", () => {
  const MEMBER = {
    username: "reader",
    role: "user",
    permissions: ["view.studio", "view.publisher", "view.person", "view.character", "view.search", "view.extras", "self.list"],
  };
  const READER = { ...MEMBER, permissions: MEMBER.permissions.filter((p) => p !== "self.list") };
  const rated = { ...SERIES, my_rating: "S", series_expectation: "High" };
  const ratingSelect = () =>
    screen.queryByRole("option", { name: "Not rated" })?.closest("select");
  const putCalls = () => fetch.mock.calls.filter(([, init]) => init?.method === "PUT");

  function stubAs(me) {
    vi.stubGlobal(
      "fetch",
      vi.fn((url, init = {}) => {
        const u = String(url);
        if (u.startsWith("/api/auth/me")) return jsonRes(me);
        if (init.method === "PUT" && u.startsWith("/api/me/ratings/")) {
          const body = JSON.parse(init.body);
          return jsonRes({
            owner_type: "series",
            owner_id: "SR001",
            my_rating: "my_rating" in body ? body.my_rating : rated.my_rating,
            expectation: "expectation" in body ? body.expectation : rated.series_expectation,
          });
        }
        if (u.startsWith("/api/series/")) return jsonRes(rated);
        if (u.startsWith("/api/game/")) return jsonRes(GAMES);
        return jsonRes([]);
      }),
    );
  }

  it("lets a holder of self.list save its own expectation", async () => {
    stubAs(MEMBER);
    renderPage();
    expect(await screen.findByText(/Expectation · High/)).toBeInTheDocument();
    expect(ratingSelect()).toBeTruthy();

    const expectationSelect = screen.getByRole("option", { name: "None" }).closest("select");
    await userEvent.selectOptions(expectationSelect, "Low");
    await waitFor(() => expect(putCalls()).toHaveLength(1));
    expect(putCalls()[0][0]).toBe("/api/me/ratings/series/SR001");
    expect(JSON.parse(putCalls()[0][1].body)).toEqual({ expectation: "Low" });
    expect(await screen.findByText(/Expectation · Low/)).toBeInTheDocument();
  });

  it("offers no editor, and draws no expectation, without self.list", async () => {
    stubAs(READER);
    renderPage();
    // The Characters tab is view.character's: its arrival says /me has loaded.
    expect(await screen.findByRole("button", { name: /^Characters/ })).toBeInTheDocument();
    expect(screen.queryByText(/Expectation · High/)).toBeNull();
    expect(ratingSelect()).toBeFalsy();
  });
});

// A series carries content labels of its own, which hide the series and every
// entry in it. The hub shows them in their own row, as the franchise hub does.
describe("SeriesPage content labels", () => {
  it("shows the series' own labels", async () => {
    global.fetch.mockImplementation((url) => {
      if (String(url).startsWith("/api/series/"))
        return jsonRes({
          ...SERIES,
          content_labels: [{ key: "nsfw", label: "NSFW", description: "" }],
        });
      return jsonRes([]);
    });
    renderPage();
    const chip = await screen.findByText("NSFW");
    expect(chip).toHaveAttribute(
      "title",
      "Hides this series and every entry in it.",
    );
  });

  it("draws no label row for an unlabelled series", async () => {
    renderPage();
    await screen.findAllByText("艾爾登法環系列");
    expect(screen.queryByText("Content")).toBeNull();
  });
});
