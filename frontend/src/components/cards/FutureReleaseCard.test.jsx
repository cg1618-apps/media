// The one card the Plan page's future-releases section and the Future releases
// page both draw. Every card names its type at the cover's top left - the
// airing type on the airing types, "Movie" on an anime movie - and, for a
// viewer with a list, the franchise expectation at the top right. Under the
// title, each type carries what says when and what it is.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import FutureReleaseCard, { futureTypeLabel } from "./FutureReleaseCard";

function mockAuthFetch(permissions = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve(
            String(url).startsWith("/api/auth/me")
              ? {
                  is_admin: false,
                  username: permissions.length ? "reader" : null,
                  role: permissions.length ? "user" : "guest",
                  permissions,
                }
              : {},
          ),
      }),
    ),
  );
}

afterEach(() => vi.unstubAllGlobals());

const FRANCHISES = {
  f1: { system_id: "f1", franchise_expectation: "Highest" },
  f2: { system_id: "f2", franchise_expectation: "Medium" },
};

function mount(type, data, { isAdmin = false } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter>
            <FutureReleaseCard
              type={type}
              data={{ system_id: "e1", display_name: "Card Title", ...data }}
              franchiseDict={FRANCHISES}
              isAdmin={isAdmin}
            />
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

// The cover: the image's box, which holds both badges.
const cover = () => screen.getByAltText("Card Title").parentElement;

describe("futureTypeLabel", () => {
  it.each([
    ["anime", { airing_type: "ONA" }, "ONA"],
    ["tv-show", { airing_type: "TV" }, "TV"],
    ["cartoon", { airing_type: "Movie" }, "Movie"],
    ["anime", {}, "Anime"],
    ["anime-movie", {}, "Movie"],
    ["movie", {}, "Movie"],
    ["game", { game_type: "DLC" }, "Game"],
    ["book", { type: "輕小說" }, "Book"],
    ["manga", {}, "Manga"],
    ["h-comic", {}, "H-Comic"],
    ["h-game", {}, "H-Game"],
    ["hentai", {}, "Hentai"],
  ])("%s %j reads %s", (type, data, label) => {
    expect(futureTypeLabel(type, data)).toBe(label);
  });
});

describe("the cover badges", () => {
  it("names the type at top left on every card", async () => {
    mockAuthFetch();
    mount("anime-movie", { anime_movie_name_en: "Card Title" });
    await screen.findByText("Card Title");
    expect(within(cover()).getByText("Movie").className).toContain("left-1");
  });

  it("shows the viewer's own expectation at top right, Highest in the brand tone", async () => {
    mockAuthFetch(["self.list"]);
    mount("movie", { movie_name_en: "Card Title", franchise_id: "f1" });
    const badge = await within(cover()).findByText("Highest");
    expect(badge.className).toContain("right-1");
    expect(badge.className).toContain("bg-brand");
  });

  it("draws any other expectation in ink", async () => {
    mockAuthFetch(["self.list"]);
    mount("game", { game_name_en: "Card Title", franchise_id: "f2" });
    const badge = await within(cover()).findByText("Medium");
    expect(badge.className).not.toContain("bg-brand");
  });

  it("hides the expectation from a viewer without a list", async () => {
    // The mirror of the two above: the same franchise, no self.list.
    mockAuthFetch();
    mount("movie", { movie_name_en: "Card Title", franchise_id: "f1" });
    await screen.findByText("Card Title");
    expect(within(cover()).queryByText("Highest")).toBeNull();
  });
});

describe("what each type says under its title", () => {
  it.each([
    ["movie", { movie_name_en: "Card Title", release_date_tw: "2027-03-14", length_min: 125 }],
    ["anime-movie", { anime_movie_name_en: "Card Title", release_date_jp: "2027-03-14" }],
  ])("a %s shows its exact date", async (type, data) => {
    mockAuthFetch();
    mount(type, data);
    expect(await screen.findByText("2027-03-14")).toBeInTheDocument();
  });

  it("a TV show shows its date without its region", async () => {
    mockAuthFetch();
    mount("tv-show", { tv_name_en: "Card Title", release_date: "2027-01", region: "US" });
    expect(await screen.findByText("2027-01")).toBeInTheDocument();
    expect(screen.queryByText("US")).toBeNull();
  });

  it("a game keeps its type and date", async () => {
    mockAuthFetch();
    mount("game", { game_name_en: "Card Title", game_type: "DLC", release_date: "2027-03" });
    expect(await screen.findByText("2027-03")).toBeInTheDocument();
    expect(screen.getByText("DLC")).toBeInTheDocument();
  });

  it("a manga shows its author and illustrator, and its next volume", async () => {
    mockAuthFetch();
    mount("manga", {
      manga_name_en: "Card Title",
      author_plot: "原作者",
      author_draw: "作畫者",
      next_vol_release_date_jp: "2027-01-05",
    });
    expect(await screen.findByText("原作者 / 作畫者")).toBeInTheDocument();
    expect(screen.getByText("Next vol. JP 2027-01-05")).toBeInTheDocument();
  });

  it("a manga by one hand names it once, and falls back to its own date", async () => {
    mockAuthFetch();
    mount("manga", {
      manga_name_en: "Card Title",
      author_plot: "一人",
      author_draw: "一人",
      release_date: "2027-06",
    });
    expect(await screen.findByText("一人")).toBeInTheDocument();
    expect(screen.getByText("2027-06")).toBeInTheDocument();
  });

  it("an h-comic shows its author and illustrator, and its date", async () => {
    mockAuthFetch();
    mount("h-comic", {
      h_comic_name_en: "Card Title",
      author: "作者",
      illustrator: "繪師",
      release_date: "2027-02-02",
    });
    expect(await screen.findByText("作者 / 繪師")).toBeInTheDocument();
    expect(screen.getByText("2027-02-02")).toBeInTheDocument();
  });

  it("a book shows its type and its date", async () => {
    mockAuthFetch();
    mount("book", { book_name_en: "Card Title", type: "輕小說", release_date_jp: "2027-02" });
    expect(await screen.findByText("輕小說")).toBeInTheDocument();
    expect(screen.getByText("2027-02")).toBeInTheDocument();
  });

  it("an undated title reads TBD", async () => {
    mockAuthFetch();
    mount("cartoon", { cartoon_name_en: "Card Title" });
    expect(await screen.findByText("TBD")).toBeInTheDocument();
  });
});

describe("the footer", () => {
  it("gives a book, which waits on no release status, the status button and no bolt", async () => {
    mockAuthFetch(["self.list"]);
    mount("book", { book_name_en: "Card Title", reading_status: "Might Read" }, { isAdmin: true });
    expect(await screen.findByTitle(/Might Read →/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByTitle(/Mark as/)).toBeNull();
  });

  it("keeps the status select and the bolt on a film", async () => {
    mockAuthFetch(["self.list"]);
    mount(
      "movie",
      { movie_name_en: "Card Title", watching_status: "Plan to Watch" },
      { isAdmin: true },
    );
    expect(await screen.findByRole("combobox")).toBeInTheDocument();
    expect(screen.getByTitle("Mark as Released")).toBeInTheDocument();
  });

  // The platform badge is a real <a> on this card; an <a> inside the card's
  // anchor is invalid markup, so the two must stay siblings.
  it("keeps the Bahamut link out of the card anchor", async () => {
    mockAuthFetch();
    mount("anime", {
      anime_name_en: "Card Title",
      sources: [
        {
          kind: "access",
          bucket: "main",
          name: "動畫瘋",
          available: true,
          url: "https://ani.gamer.com.tw/x",
        },
      ],
    });
    const cardLink = await screen.findByRole("link", { name: /Card Title/ });
    const baha = screen.getByAltText("動畫瘋").closest("a");
    expect(baha).not.toBeNull();
    expect(cardLink.contains(baha)).toBe(false);
  });
});
