// The future-releases plan: its first tab is what the viewer is waiting on in
// either spelling - Watch When Airs on the airing types, Watch When Released
// on the two films - and its second is planned entries not out yet, which a
// film reads from release_status.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlanToWatchFuture from "./PlanToWatchFuture";

vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => ({ isAdmin: false }) }));
vi.mock("../../components/cards/MediaCard", () => ({
  default: ({ data }) => <div data-testid="card">{data.anime_name_en || data.movie_name_en || data.anime_movie_name_en}</div>,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  );
});

const props = {
  allAnime: [
    { system_id: "a1", anime_name_en: "Waiting Anime", watching_status: "Watch When Airs", airing_status: "Not Yet Aired" },
  ],
  allAnimeMovies: [
    { system_id: "am1", anime_movie_name_en: "Waiting Anime Movie", watching_status: "Watch When Released", release_status: "Not Released" },
  ],
  allMovies: [
    { system_id: "m1", movie_name_en: "Planned Film", watching_status: "Plan to Watch", release_status: "Not Released" },
    { system_id: "m2", movie_name_en: "Released Film", watching_status: "Plan to Watch", release_status: "Released" },
  ],
  allTVShows: [],
  allCartoons: [],
  franchiseMap: {},
};

const cards = () => screen.queryAllByTestId("card").map((c) => c.textContent).sort();

describe("PlanToWatchFuture", () => {
  it("holds both waiting spellings in its first tab", () => {
    render(<PlanToWatchFuture {...props} />);
    expect(screen.getByRole("button", { name: "Watch when airs / released" })).toBeInTheDocument();
    expect(cards()).toEqual(["Waiting Anime", "Waiting Anime Movie"]);
  });

  it("keeps a planned film while it is Not Released", async () => {
    const user = userEvent.setup();
    render(<PlanToWatchFuture {...props} />);
    await user.click(screen.getByRole("button", { name: "Plan to watch" }));
    expect(cards()).toEqual(["Planned Film"]);
  });
});
