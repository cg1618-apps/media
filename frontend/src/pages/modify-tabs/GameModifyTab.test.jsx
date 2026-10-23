// Frontend: the Game Modify tab - the same GameFormBody the Add tab renders,
// in the canonical section order, with the entry's id handed to the cover
// picker and no search box at the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import GameModifyTab from "./GameModifyTab";
import { defaultGame } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true }),
}));
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ ownerId }) => <div data-testid="image-picker" data-owner-id={ownerId ?? ""} />,
}));
vi.mock("../detail/GameNotes", () => ({
  default: () => <div data-testid="notes" />,
}));

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GameModifyTab
        franchiseCollections={{}}
        cgmf={defaultGame()}
        ugm={() => {}}
        allFranchises={[]}
        allGames={[]}
        seriesItemsForGame={[]}
        editingItem={{ system_id: "game-1" }}
        sources={{}}
      />
    </QueryClientProvider>,
  );
}

const sectionTitles = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );

describe("GameModifyTab layout", () => {
  it("renders the canonical sections, then Structured Notes", () => {
    const { container } = renderTab();
    expect(sectionTitles(container)).toEqual([
      "Titles & Naming",
      "Scores",
      "My Tracker",
      "Information",
      "Genres & Labels",
      "Production",
      "Prices",
      "Copies",
      "Links & Sources",
      "Cover & Remark",
      "Structured Notes",
    ]);
  });

  it("hands the entry's id to the cover picker", () => {
    renderTab();
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "game-1");
  });

  it("offers no auto-fill or IGDB search box", () => {
    renderTab();
    expect(screen.queryByRole("textbox", { name: "Auto-fill from existing entry" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search IGDB" })).toBeNull();
  });
});
