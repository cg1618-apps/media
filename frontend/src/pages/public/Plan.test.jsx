// The Plan page's table of contents: one row each for Do next and To redo,
// with nothing under them however their tabs group, and one row for the
// future releases with a sub-row per year group it draws.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Plan, { planTocItems } from "./Plan";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin: false, has: () => true, user: { username: "u" } }),
}));
vi.mock("../../components/cards/FutureReleaseCard", () => ({
  default: ({ data }) => <div>{data.anime_name_en}</div>,
}));

const anime = (id, status, date) => ({
  system_id: id,
  anime_name_en: `Anime ${id}`,
  watching_status: status,
  airing_status: "Not Yet Aired",
  release_date_jp: date,
});

// Do next holds sized rows, so its tab draws group headings ("12 EP") - the
// contents must still list none of them.
vi.mock("../plan/usePlanData", () => ({
  default: () => ({
    allAnime: [
      anime("a1", "Watch When Airs", "2027-01"),
      anime("a2", "Watch When Airs", "2028-07"),
      anime("a3", "Watch When Airs", null),
    ],
    allAnimeMovies: [],
    allMovies: [],
    allTVShows: [],
    allCartoons: [],
    franchiseMap: {},
    planRows: [
      {
        system_id: "p1",
        kind: "next",
        media_type: "anime",
        scope: "entry",
        target_id: "a9",
        display_name: "Queued",
        nav_path: "/anime",
        bucket: "12ep",
      },
    ],
    loading: false,
    error: null,
  }),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ current_season: null }), { status: 200 })),
    ),
  );
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Plan />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("the Plan page's contents", () => {
  it("lists the three sections and the future releases' year groups only", () => {
    renderPage();
    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(within(contents).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Do next",
      "To redo",
      "Future releases",
      "2027",
      "2028",
      "TBD",
    ]);
    // The Do next tab does draw a group heading; the contents leave it out.
    expect(screen.getByRole("heading", { level: 3, name: "12 EP" })).toBeInTheDocument();
  });

  it("points every row at an anchor on the page", () => {
    const { container } = renderPage();
    const contents = screen.getByRole("navigation", { name: "Contents" });
    expect(within(contents).getAllByRole("button")).toHaveLength(6);
    for (const { id } of planTocItems([{ year: "2027" }, { year: "2028" }, { year: "TBD" }])) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });

  it("chips only the three sections below xl", () => {
    renderPage();
    const bar = screen.getByRole("navigation", { name: "Sections" });
    expect(within(bar).getAllByRole("button").map((b) => b.textContent)).toEqual([
      "Do next",
      "To redo",
      "Future releases",
    ]);
  });
});
