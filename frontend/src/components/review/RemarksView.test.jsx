// The "have remark" view: every type's tab, the gated ones only for a session
// that may see them, and a row that opens its entry.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import RemarksView, { countRemarks } from "./RemarksView";

let auth = { visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const results = {
  anime: [],
  movie: [
    {
      system_id: "m1",
      public_id: 7,
      movie_name_cn: "電影",
      movie_name_en: "A Movie",
      release_date: "2021-05-01",
      watching_status: "Might Watch",
      remark: "rewatch the ending",
    },
  ],
  game: [
    {
      system_id: "g1",
      public_id: 3,
      game_name_en: "A Game",
      game_type: "Base Game",
      playing_status: "Active Playing",
      remark: "replay on hard",
    },
  ],
  h_comic: [
    { system_id: "h1", public_id: 9, h_comic_name_en: "Gated", remark: "hidden" },
  ],
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/review-queue"]}>
      <Routes>
        <Route path="/review-queue" element={<RemarksView results={results} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth = { visibleGatedTypes: [] };
});

it("draws a tab for every ungated type, game and comic included", () => {
  mount();
  for (const label of ["Anime", "Movie", "Comic", "Game", "Novel"]) {
    expect(screen.getByRole("tab", { name: new RegExp(`^${label}\\s*\\d*$`) })).toBeInTheDocument();
  }
  expect(screen.queryByRole("tab", { name: /H-Comic/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /Hentai/ })).not.toBeInTheDocument();
  expect(countRemarks(results, auth)).toBe(2);
});

it("draws the gated tabs for a session that may see them", () => {
  auth = { visibleGatedTypes: ["h-comic", "hentai", "h-game"] };
  mount();
  expect(screen.getByRole("tab", { name: /H-Comic/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /H-Game/ })).toBeInTheDocument();
  expect(countRemarks(results, auth)).toBe(3);
});

it("shows the movie's release date and the game's status", () => {
  mount();
  fireEvent.click(screen.getByRole("tab", { name: /^Movie/ }));
  expect(screen.getByText("2021-05-01")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /^Game/ }));
  expect(screen.getByText("Active Playing")).toBeInTheDocument();
});

it("opens the entry a row names", () => {
  mount();
  fireEvent.click(screen.getByRole("tab", { name: /^Game/ }));
  fireEvent.click(screen.getByText("replay on hard"));
  expect(screen.getByTestId("where")).toHaveTextContent("/game/3/a-game");
});
