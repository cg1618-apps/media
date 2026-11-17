// StatsCompletions' Novel tab: it is handed every book and lists only the
// ones of a novel type (NOVEL_BOOK_TYPES in utils/statsUtils.js). The fixture
// carries a completed book of every type, plus one with no type, so the tab
// has something to leave out; the mirror case shows the novel types listed.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ loading: false, has: () => true, visibleGatedTypes: [] }),
}));

import StatsCompletions from "./StatsCompletions";

function book(id, type) {
  return {
    system_id: id,
    public_id: id,
    book_name_en: `Book ${id}`,
    type,
    region: "JP",
    reading_status: "Completed",
    completed_at: "2026-10-01T00:00:00Z",
  };
}

const BOOKS = [
  book("ln", "輕小說"),
  book("n", "小說"),
  book("wn", "網路小說"),
  book("ss", "短篇集"),
  book("guide", "指南/設定集"),
  book("other", "其他"),
  book("untyped", null),
];

function renderTab() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StatsCompletions
        allAnime={[]}
        allAnimeMovies={[]}
        allMovies={[]}
        allTVShows={[]}
        allCartoons={[]}
        allManga={[]}
        allBook={BOOKS}
        allComic={[]}
        allGame={[]}
        allHComic={null}
        allHGame={null}
        allHentai={null}
        franchiseMap={{}}
      />
    </MemoryRouter>,
  );
}

describe("StatsCompletions - the Novel tab", () => {
  it("is labelled Novel", () => {
    renderTab();
    expect(screen.getByRole("button", { name: "Novel" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Book" })).toBeNull();
  });

  it("lists the completed books of a novel type only", async () => {
    renderTab();
    await userEvent.setup().click(screen.getByRole("button", { name: "Novel" }));
    for (const id of ["ln", "n", "wn", "ss"]) {
      expect(screen.getByText(`Book ${id}`)).toBeInTheDocument();
    }
    for (const id of ["guide", "other", "untyped"]) {
      expect(screen.queryByText(`Book ${id}`)).toBeNull();
    }
  });
});
