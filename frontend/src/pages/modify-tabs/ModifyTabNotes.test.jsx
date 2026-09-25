// Frontend: the modify tabs that used to lack it - comic, game and the three
// gated types - carry the Structured Notes section every other media type's
// tab has, with the `remark` section hidden: the form's own Remark field edits
// that same row.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ComicModifyTab from "./ComicModifyTab";
import GameModifyTab from "./GameModifyTab";
import HComicModifyTab from "./HComicModifyTab";
import HGameModifyTab from "./HGameModifyTab";
import HentaiModifyTab from "./HentaiModifyTab";

// The notes wrappers fetch on mount; these tests are about whether the tab
// renders one, for which owner, and with what hidden.
function notesStub(testId, ownerProp) {
  return {
    default: (props) => (
      <div
        data-testid={testId}
        data-owner-id={props[ownerProp]?.system_id}
        data-hidden={(props.hideSections || []).join(",")}
      />
    ),
  };
}
// The game forms read the session for their Copies gate.
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-game"] }),
}));
vi.mock("../detail/ComicNotes", () => notesStub("notes", "comic"));
vi.mock("../detail/GameNotes", () => notesStub("notes", "game"));
vi.mock("../detail/HComicNotes", () => notesStub("notes", "hComic"));
vi.mock("../detail/HGameNotes", () => notesStub("notes", "hGame"));
vi.mock("../detail/HentaiNotes", () => notesStub("notes", "hentai"));

function renderTab(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

const common = {
  franchiseCollections: [],
  allFranchises: [],
  editingItem: { system_id: "e1" },
  ribbonSection: null,
  sources: [],
};

const TABS = [
  [
    "Comic",
    () => (
      <ComicModifyTab
        {...common}
        ccmf={{}}
        ucm={() => {}}
        seriesItemsForComic={[]}
      />
    ),
  ],
  [
    "Game",
    () => (
      <GameModifyTab
        {...common}
        cgmf={{}}
        ugm={() => {}}
        allGames={[]}
        seriesItemsForGame={[]}
      />
    ),
  ],
  [
    "H-Comic",
    () => (
      <HComicModifyTab
        {...common}
        chcf={{ region: "KR" }}
        uhc={() => {}}
        seriesItemsForHComic={[]}
      />
    ),
  ],
  [
    "H-Game",
    () => (
      <HGameModifyTab
        {...common}
        chgf={{}}
        uhg={() => {}}
        allHGames={[]}
        seriesItemsForHGame={[]}
      />
    ),
  ],
  [
    "Hentai",
    () => (
      <HentaiModifyTab
        {...common}
        chtf={{}}
        uht={() => {}}
        seriesItemsForHentai={[]}
      />
    ),
  ],
];

describe("modify tabs — Structured Notes", () => {
  it.each(TABS)("%s renders the entry's notes, remark hidden", (_, tab) => {
    renderTab(tab());
    expect(screen.getByText("Structured Notes")).toBeInTheDocument();
    const notes = screen.getByTestId("notes");
    expect(notes).toHaveAttribute("data-owner-id", "e1");
    expect(notes).toHaveAttribute("data-hidden", "remark");
  });
});
