// The duplicates view: every cluster kind the backend returns has a tab, and
// each of its three shapes renders from the keys the backend actually sends.
import { fireEvent, render, screen } from "@testing-library/react";

import DuplicatesView, { countDuplicates } from "./DuplicatesView";

let auth = { visibleGatedTypes: [] };
vi.mock("../../contexts/AuthContext", () => ({ useAuth: () => auth }));

const results = {
  franchise: [],
  comic: [
    [
      { system_id: "c1aaaaaaaa", franchise_id: "f1", comic_name_en: "Avengers" },
      { system_id: "c2aaaaaaaa", franchise_id: "f1", comic_name_en: "avengers" },
    ],
  ],
  game: [[{ system_id: "g1" }, { system_id: "g2" }]],
  h_game: [[{ system_id: "x1" }, { system_id: "x2" }]],
  system_options: [
    [
      { id: "o1aaaaaaaa", category: "Platform", option_value: "Netflix" },
      { id: "o2aaaaaaaa", category: "Platform", option_value: "netflix" },
    ],
  ],
  entities: [
    { kind: "person", key: "kana", ids: ["p1aaaaaaaa", "p2aaaaaaaa"], names: ["Kana", "KANA"] },
  ],
};

beforeEach(() => {
  auth = { visibleGatedTypes: [] };
});

it("draws comic, game and the entity tab, and hides the gated ones", () => {
  render(<DuplicatesView results={results} />);
  expect(screen.getByRole("tab", { name: /^Comic/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /^Game/ })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /People & Companies/ })).toBeInTheDocument();
  expect(screen.queryByRole("tab", { name: /H-Game/ })).not.toBeInTheDocument();
  expect(countDuplicates(results, auth)).toBe(4);
});

it("draws a gated tab for a session that may see the type", () => {
  auth = { visibleGatedTypes: ["h-game"] };
  render(<DuplicatesView results={results} />);
  expect(screen.getByRole("tab", { name: /H-Game/ })).toBeInTheDocument();
  expect(countDuplicates(results, auth)).toBe(5);
});

it("renders a system option by its id and option_value", () => {
  render(<DuplicatesView results={results} />);
  fireEvent.click(screen.getByRole("tab", { name: /Sys\. Options/ }));
  expect(screen.getByText("[o1aaaaaa…] Netflix")).toBeInTheDocument();
  expect(screen.getByText("[o2aaaaaa…] netflix")).toBeInTheDocument();
});

it("renders an entity cluster's names", () => {
  render(<DuplicatesView results={results} />);
  fireEvent.click(screen.getByRole("tab", { name: /People & Companies/ }));
  expect(screen.getByText("person")).toBeInTheDocument();
  expect(screen.getByText("KANA")).toBeInTheDocument();
});
