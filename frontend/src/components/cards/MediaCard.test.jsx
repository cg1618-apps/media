// Regression coverage for Finding 2 (novel-units final review): MediaCard's
// novel progress branch must agree with getNovelProgress / NovelDashboardCard
// on which pair a novel renders, via the shared effectiveProgressDisplay
// helper (frontend/src/lib/novelUnits.js), rather than branching on the raw
// progress_display column directly.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import MediaCard from "./MediaCard";

function mockAuthFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            is_admin: false,
            username: null,
            role: "guest",
            is_root: false,
            permissions: [],
          }),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(data, type = "novel", isAdmin = false, variant = "library", extra = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <MediaCard
              type={type}
              data={data}
              isAdmin={isAdmin}
              variant={variant}
              {...extra}
            />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("MediaCard — novel progress (Decision G)", () => {
  it("a Web novel with arc rows and no stored progress_display renders the two-stage position, not a volume counter", async () => {
    mockAuthFetch();
    mount({
      system_id: "n1",
      type: "Web",
      progress_display: "",
      novel_name_en: "Test Novel",
      reading_status: "Reading",
      arc_fin: 1,
      arc_total: 2,
      ch_fin_in_arc: 101,
      ch_total: 212,
      ch_fin: 201,
      vol_fin: 0,
      vol_total_original: null,
      units: [
        { unit_kind: "arc", position: 1, ch_count: 100 },
        { unit_kind: "arc", position: 2, ch_count: 112 },
      ],
    });

    expect(await screen.findByText("arc 2 · 101/112 CH")).toBeInTheDocument();
  });
});


// The Bahamut badge must come from the one shared predicate in
// lib/formatters.js (kind "access" AND bucket "main"), not from a name match
// re-implemented here - a typed free-form row named "Bahamut" is somebody's
// note, not the platform.
describe("MediaCard - the Bahamut badge", () => {
  const base = {
    system_id: "a1",
    anime_name_en: "Test Anime",
    watching_status: "Active Watching",
  };

  it("shows for a main access row marked available", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "main", name: "Bahamut", available: true },
        ],
      },
      "anime",
    );
    expect(await screen.findByAltText("Baha")).toBeInTheDocument();
  });

  it("does not show for a free-form row typed 'Bahamut'", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          { kind: "access", bucket: "other", name: "Bahamut", available: true },
        ],
      },
      "anime",
    );
    await screen.findByText("Test Anime");
    expect(screen.queryByAltText("Baha")).toBeNull();
  });
});


// The card is a real link, not a div with an onClick. A middle click, a
// ctrl-click and "open in new tab" all need an <a href> to act on, and the
// href has to be the same pretty URL every other Link on the site uses -
// entityPath(), not the raw system_id UUID the old navigate() call passed.
describe("MediaCard - the card is a link", () => {
  const base = {
    system_id: "0f8c3a52-1f2b-4d2e-9a3c-6b7d8e9f0a1b",
    public_id: 47,
    anime_name_en: "Test Anime",
    watching_status: "Active Watching",
  };

  it("renders the title as an anchor pointing at the entityPath URL", async () => {
    mockAuthFetch();
    mount(base, "anime");
    const link = await screen.findByRole("link", { name: /Test Anime/ });
    expect(link).toHaveAttribute("href", "/anime/47/test-anime");
  });

  it("falls back to the system_id path when the row carries no public_id", async () => {
    mockAuthFetch();
    const { public_id: _omit, ...noPublicId } = base;
    mount(noPublicId, "anime");
    const link = await screen.findByRole("link", { name: /Test Anime/ });
    expect(link).toHaveAttribute(
      "href",
      `/anime/${base.system_id}`,
    );
  });

  // Only the "future" variant renders the Bahamut badge as a real <a>; in the
  // library variant it is a plain div. An <a> inside an <a> is invalid markup
  // and the browser would break the card link apart to recover, so the
  // stretched-link shape has to keep them siblings.
  it("keeps the Bahamut link out of the card anchor, so it is not a nested <a>", async () => {
    mockAuthFetch();
    mount(
      {
        ...base,
        sources: [
          {
            kind: "access",
            bucket: "main",
            name: "Bahamut",
            available: true,
            url: "https://ani.gamer.com.tw/x",
          },
        ],
      },
      "anime",
      false,
      "future",
    );
    const cardLink = await screen.findByRole("link", { name: /Test Anime/ });
    const baha = screen.getByAltText("Baha").closest("a");
    expect(baha).not.toBeNull();
    expect(cardLink.contains(baha)).toBe(false);
  });

  it("does not nest the admin status button inside the card anchor", async () => {
    mockAuthFetch();
    mount(base, "anime", true);
    const cardLink = await screen.findByRole("link", { name: /Test Anime/ });
    expect(cardLink.querySelector("button")).toBeNull();
  });
});

// A game on the future variant sits on the PLAY axis, not the watch one, and
// its bolt moves release_status rather than airing_status - the column a game
// carries instead. Both were hard-coded to anime's vocabulary before games
// reached the Future releases page.
describe("MediaCard - the future variant on a game", () => {
  const game = {
    system_id: "3c1d5e77-2a4b-4c6d-8e9f-0a1b2c3d4e5f",
    public_id: 12,
    game_name_en: "Test Game",
    playing_status: "Plan to Play",
    release_status: "Unreleased",
    release_date: "2027-03",
  };

  it("offers the playing statuses, not the watching ones", async () => {
    mockAuthFetch();
    mount(game, "game", true, "future");
    await screen.findByText("Test Game");
    const select = screen.getByRole("combobox");
    expect(
      [...select.options].map((o) => o.value),
    ).toEqual(["Might Play", "Plan to Play", "Play When Released"]);
  });

  it("titles the bolt with the release status it sets", async () => {
    mockAuthFetch();
    mount(game, "game", true, "future");
    await screen.findByText("Test Game");
    expect(screen.getByTitle("Mark as Released")).toBeInTheDocument();
  });

  it("shows the release date on the meta line", async () => {
    mockAuthFetch();
    mount(game, "game", false, "future");
    expect(await screen.findByText("2027-03")).toBeInTheDocument();
  });
});

// The score slot on a card follows the library's sort (LibraryLayout passes
// `scoreField`), so that sorting by an AniList figure and reading a MAL one
// off the card cannot happen. The mirror matters as much as the positive
// case: with no prop the card must still show MAL, because five of the nine
// media types have no AniList figure at all and never pass one.
describe("MediaCard - which outside score the card shows", () => {
  const anime = {
    system_id: "a1",
    anime_name_en: "Test Anime",
    mal_rating: "8.64",
    anilist_rating: 85,
  };

  it("shows the MAL score by default", async () => {
    mockAuthFetch();
    mount(anime, "anime");
    expect(await screen.findByTitle("MAL score")).toHaveTextContent("8.64");
    expect(screen.queryByText("85")).not.toBeInTheDocument();
  });

  it("shows the AniList score when the sort points at it", async () => {
    mockAuthFetch();
    mount(anime, "anime", false, "library", { scoreField: "anilist_rating" });
    expect(await screen.findByTitle("AniList score")).toHaveTextContent("85");
    expect(screen.queryByText("8.64")).not.toBeInTheDocument();
  });

  // An anime movie carries its score as a stamp on the cover rather than on
  // the meta line, so it is a second code path and not a second case of one.
  it("follows the sort on an anime movie's cover stamp too", async () => {
    mockAuthFetch();
    mount(
      { system_id: "am1", anime_movie_name_en: "Test Movie", mal_rating: "8.2", anilist_rating: 79 },
      "anime-movie",
      false,
      "library",
      { scoreField: "anilist_rating" },
    );
    expect(await screen.findByTitle("AniList score")).toHaveTextContent("79");
  });

  // A manga with no AniList score shows nothing there rather than falling
  // back to the MAL figure the sort was not asking for.
  it("shows no figure when the entry has no AniList score", async () => {
    mockAuthFetch();
    mount(
      { system_id: "m1", manga_name_en: "Test Manga", mal_rating: "7.9", anilist_rating: null },
      "manga",
      false,
      "library",
      { scoreField: "anilist_rating" },
    );
    await screen.findByText("Test Manga");
    expect(screen.queryByText("7.9")).not.toBeInTheDocument();
  });
});
