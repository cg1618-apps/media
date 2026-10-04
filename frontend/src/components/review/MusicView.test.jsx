// The music review: flagged lists and songs per anime, narrowed by the status
// chips, and a row that opens the anime.
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

import MusicView from "./MusicView";

const results = [
  {
    system_id: "a1",
    public_id: 12,
    anime_name_cn: "葬送",
    anime_name_en: "Frieren",
    display_name: "葬送",
    lists: [{ kind: "op", status: "Need" }],
    songs: [{ section: "ed", title: "Anytime Anywhere", status: "No Full Version", locator: "ep 1" }],
  },
  {
    system_id: "a2",
    public_id: 13,
    anime_name_cn: "藥屋",
    anime_name_en: "Apothecary",
    display_name: "藥屋",
    lists: [],
    songs: [{ section: "ost", title: "Track 1", status: "Pending", locator: null }],
  },
];

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/review-queue"]}>
      <Routes>
        <Route path="/review-queue" element={<MusicView results={results} />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("shows each anime's flagged lists and songs", () => {
  mount();
  expect(screen.getByText("Frieren")).toBeInTheDocument();
  expect(screen.getByText("Anytime Anywhere")).toBeInTheDocument();
  expect(screen.getByText("No Full Version", { selector: "span" })).toBeInTheDocument();
  expect(screen.getByText("Track 1")).toBeInTheDocument();
});

it("narrows the rows to the statuses picked", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Pending" }));
  expect(screen.queryByText("Track 1")).not.toBeInTheDocument();
  expect(screen.getByText("Frieren")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Need" }));
  // Frieren still has its No Full Version song; its Need list is gone.
  expect(screen.getByText("Anytime Anywhere")).toBeInTheDocument();
  expect(screen.queryByText("OP")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "No Full Version" }));
  expect(screen.getByText("No anime with these statuses")).toBeInTheDocument();
});

it("opens the anime a row names", () => {
  mount();
  fireEvent.click(screen.getByText("Frieren"));
  expect(screen.getByTestId("where")).toHaveTextContent("/anime/12/frieren");
});
