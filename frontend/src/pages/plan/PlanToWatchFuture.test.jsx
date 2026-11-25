// The future-releases plan: its first filter, "Do when released", is what the
// viewer is waiting on in either spelling - Watch When Airs on the airing
// types, Watch When Released on the two films - and its second, "Plan to
// do", is planned entries not out yet, which a film reads from
// release_status. Each card is the shared FutureReleaseCard.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlanToWatchFuture, { futureYearAnchor, usePlanFuture } from "./PlanToWatchFuture";

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("../../components/cards/FutureReleaseCard", () => ({
  default: ({ type, data }) => (
    <div data-testid="card" data-type={type}>
      {data.anime_name_en || data.movie_name_en || data.anime_movie_name_en}
    </div>
  ),
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ current_season: null }), { status: 200 })),
    ),
  );
});

const props = {
  allAnime: [
    {
      system_id: "a1",
      anime_name_en: "Waiting Anime",
      watching_status: "Watch When Airs",
      airing_status: "Not Yet Aired",
      release_date_jp: "2027-04",
    },
  ],
  allAnimeMovies: [
    {
      system_id: "am1",
      anime_movie_name_en: "Waiting Anime Movie",
      watching_status: "Watch When Released",
      release_status: "Not Released",
    },
  ],
  allMovies: [
    { system_id: "m1", movie_name_en: "Planned Film", watching_status: "Plan to Watch", release_status: "Not Released" },
    { system_id: "m2", movie_name_en: "Released Film", watching_status: "Plan to Watch", release_status: "Released" },
  ],
  allTVShows: [],
  allCartoons: [],
};

function Harness() {
  const future = usePlanFuture(props);
  return <PlanToWatchFuture id="plan-future" future={future} franchiseMap={{}} />;
}

function renderSection() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

const cards = () => screen.queryAllByTestId("card").map((c) => c.textContent).sort();

describe("PlanToWatchFuture", () => {
  it("is called Plan to do for future releases", () => {
    renderSection();
    expect(
      screen.getByRole("heading", { level: 2, name: "Plan to do for future releases" }),
    ).toBeInTheDocument();
  });

  it("holds both waiting spellings under Do when released", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Do when released" })).toBeInTheDocument();
    expect(cards()).toEqual(["Waiting Anime", "Waiting Anime Movie"]);
  });

  it("keeps a planned film under Plan to do while it is Not Released", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Plan to do" }));
    expect(cards()).toEqual(["Planned Film"]);
  });

  it("anchors each year group for the contents, TBD last", () => {
    const { container } = renderSection();
    const anchors = [...container.querySelectorAll('[id^="plan-future-"]')].map((el) => el.id);
    expect(anchors).toEqual([futureYearAnchor("2027"), futureYearAnchor("TBD")]);
  });

  it("hands each card its hyphenated media type", () => {
    renderSection();
    expect(screen.getAllByTestId("card").map((c) => c.dataset.type).sort()).toEqual([
      "anime",
      "anime-movie",
    ]);
  });
});
