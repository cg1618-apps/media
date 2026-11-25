// StatsCompletions: the All tab and the Book tab, drawn. The grouping and the
// row details themselves are completionGroups.test.js's.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

// The gated types this session may see; each test sets its own.
let visibleGatedTypes = [];
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ loading: false, has: () => true, visibleGatedTypes }),
}));

import StatsCompletions from "./StatsCompletions";

afterEach(() => {
  visibleGatedTypes = [];
});

function book(id, type, completed_at = "2026-10-01T00:00:00Z") {
  return {
    system_id: id,
    public_id: id,
    book_name_en: `Book ${id}`,
    type,
    reading_status: "Completed",
    completed_at,
  };
}

const anime = (id, completed_at) => ({
  system_id: id,
  public_id: id,
  anime_name_en: `Anime ${id}`,
  airing_type: "TV",
  watching_status: "Completed",
  completed_at,
});

const hentai = (id, completed_at) => ({
  system_id: id,
  public_id: id,
  hentai_name_en: `Hentai ${id}`,
  watching_status: "Completed",
  completed_at,
});

function renderTabs(lists = {}) {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StatsCompletions
        allAnime={[]}
        allAnimeMovies={[]}
        allMovies={[]}
        allTVShows={[]}
        allCartoons={[]}
        allManga={[]}
        allBook={[]}
        allComic={[]}
        allGame={[]}
        allHComic={null}
        allHGame={null}
        allHentai={null}
        franchiseMap={{}}
        {...lists}
      />
    </MemoryRouter>,
  );
}

describe("StatsCompletions - the tab bar", () => {
  it("leads with All and offers Book rather than Novel", () => {
    renderTabs();
    expect(screen.getAllByRole("button")[0]).toHaveTextContent("All");
    expect(screen.getByRole("button", { name: "Book" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Novel" })).toBeNull();
  });
});

describe("StatsCompletions - the All tab", () => {
  it("is open by default and mixes the types newest first, ten a page", async () => {
    const day = (n) => `2026-10-${String(n).padStart(2, "0")}T00:00:00Z`;
    const animeList = Array.from({ length: 6 }, (_, i) => anime(`a${i}`, day(10 + i * 2)));
    const books = Array.from({ length: 6 }, (_, i) => book(`b${i}`, "小說", day(11 + i * 2)));
    renderTabs({ allAnime: animeList, allBook: books });

    const names = () =>
      screen
        .getAllByRole("link")
        .map((row) => within(row).getByText(/^(Anime|Book) [ab]\d$/).textContent);
    expect(names()).toEqual([
      "Book b5", "Anime a5", "Book b4", "Anime a4", "Book b3",
      "Anime a3", "Book b2", "Anime a2", "Book b1", "Anime a1",
    ]);
    // No groups, and the type at the left instead of a row number.
    expect(screen.queryAllByRole("heading", { level: 3 })).toEqual([]);
    const first = screen.getAllByRole("link")[0];
    expect(within(first).getByText("Book")).toBeInTheDocument();
    expect(within(first).queryByText("1")).toBeNull();

    await userEvent.setup().click(screen.getByRole("button", { name: "Next" }));
    expect(names()).toEqual(["Book b0", "Anime a0"]);
  });

  it("shows each row's details: the airing type for anime, the type for a book", () => {
    renderTabs({
      allAnime: [anime("a", "2026-10-02T00:00:00Z")],
      allBook: [book("b", "輕小說", "2026-10-01T00:00:00Z")],
    });
    const [animeRow, bookRow] = screen.getAllByRole("link");
    expect(within(animeRow).getByText("TV")).toBeInTheDocument();
    expect(within(bookRow).getByText("輕小說")).toBeInTheDocument();
  });

  // The fixture carries a completed hentai, so leaving it out is the gate's
  // doing; the mirror case shows the same row once the type is visible.
  it("leaves out a gated type the session may not see", () => {
    renderTabs({
      allAnime: [anime("a", "2026-10-01T00:00:00Z")],
      allHentai: [hentai("h", "2026-10-02T00:00:00Z")],
    });
    expect(screen.getByText("Anime a")).toBeInTheDocument();
    expect(screen.queryByText("Hentai h")).toBeNull();
  });

  it("includes a gated type the session may see", () => {
    visibleGatedTypes = ["hentai"];
    renderTabs({
      allAnime: [anime("a", "2026-10-01T00:00:00Z")],
      allHentai: [hentai("h", "2026-10-02T00:00:00Z")],
    });
    const [first] = screen.getAllByRole("link");
    expect(within(first).getByText("Hentai h")).toBeInTheDocument();
    expect(within(first).getByText("Hentai")).toBeInTheDocument();
  });
});

describe("StatsCompletions - row alignment", () => {
  it("gives every date and every detail cell a fixed width, the cell drawn even when empty", () => {
    renderTabs({
      allAnime: [
        anime("a", "2026-10-12T00:00:00Z"),
        { ...anime("b", "2026-10-08T00:00:00Z"), airing_type: null },
      ],
    });
    for (const date of screen.getAllByTestId("completion-date")) {
      expect(date.className).toMatch(/\bw-\[12ch\]/);
      expect(date.className).toMatch(/\btabular-nums\b/);
    }
    const [withType, withoutType] = screen.getAllByRole("link");
    expect(within(withType).getAllByTestId("completion-detail")).toHaveLength(1);
    expect(within(withoutType).getAllByTestId("completion-detail")).toHaveLength(1);
    expect(within(withoutType).getByTestId("completion-detail")).toBeEmptyDOMElement();
  });
});

describe("StatsCompletions - the Book tab", () => {
  it("lists every completed book, grouped by type in the vocabulary's order", async () => {
    renderTabs({
      allBook: [
        book("ln", "輕小說"),
        book("n", "小說"),
        book("guide", "指南/設定集"),
        book("untyped", null),
      ],
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Book" }));
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["小說", "輕小說", "指南/設定集", "Unrecorded"]);
    for (const id of ["ln", "n", "guide", "untyped"]) {
      expect(screen.getByText(`Book ${id}`)).toBeInTheDocument();
    }
  });
});
