// Frontend: the H-Game Modify tab - the same HGameFormBody the Add tab
// renders, in the canonical section order, with the entry's id handed to the
// cover picker and no search box at the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HGameModifyTab from "./HGameModifyTab";
import { defaultHGame } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-game"] }),
}));
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ ownerId }) => <div data-testid="image-picker" data-owner-id={ownerId ?? ""} />,
}));
vi.mock("../detail/HGameNotes", () => ({
  default: () => <div data-testid="notes" />,
}));

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HGameModifyTab
        franchiseCollections={{}}
        chgf={defaultHGame()}
        uhg={() => {}}
        allFranchises={[]}
        allHGames={[]}
        seriesItemsForHGame={[]}
        editingItem={{ system_id: "hg-1" }}
        sources={{}}
      />
    </QueryClientProvider>,
  );
}

const sectionTitles = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );

describe("HGameModifyTab layout", () => {
  it("renders the canonical sections, then Structured Notes", () => {
    const { container } = renderTab();
    expect(sectionTitles(container)).toEqual([
      "Titles & Naming",
      "My Tracker",
      "Information",
      "Genres",
      "Presentation",
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
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "hg-1");
  });

  it("offers no auto-fill or IGDB search box", () => {
    renderTab();
    expect(screen.queryByRole("textbox", { name: "Auto-fill from existing entry" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search IGDB" })).toBeNull();
  });
});
