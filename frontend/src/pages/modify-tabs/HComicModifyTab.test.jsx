// Frontend: the H-Comic Modify tab - the same region field and HComicFormBody
// the Add tab renders, in the canonical section order, with the entry's id
// handed to the cover picker and the cast editor, and no search box at the
// top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import HComicModifyTab from "./HComicModifyTab";
import { defaultHComic } from "../../config/formFactories";

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, visibleGatedTypes: ["h-comic"] }),
}));
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ ownerId }) => <div data-testid="image-picker" data-owner-id={ownerId ?? ""} />,
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: ({ entryId }) => <div data-testid="cast-editor" data-entry-id={entryId ?? ""} />,
}));
vi.mock("../detail/HComicNotes", () => ({
  default: () => <div data-testid="notes" />,
}));

function renderTab(initial = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HComicModifyTab
        franchiseCollections={{}}
        chcf={{ ...defaultHComic(), ...initial }}
        uhc={() => {}}
        allFranchises={[]}
        seriesItemsForHComic={[]}
        editingItem={{ system_id: "hc-1" }}
        sources={{}}
      />
    </QueryClientProvider>,
  );
}

const sectionTitles = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );

describe("HComicModifyTab layout", () => {
  it("renders the canonical sections, then Structured Notes", () => {
    const { container } = renderTab({ region: "KR" });
    expect(sectionTitles(container)).toEqual([
      "Titles & Naming",
      "My Tracker",
      "Information",
      "Genres",
      "Production",
      "Cast",
      "Links & Sources",
      "Cover & Remark",
      "Structured Notes",
    ]);
  });

  it("hands the entry's id to the cover picker and the cast editor", () => {
    renderTab();
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "hc-1");
    expect(screen.getByTestId("cast-editor")).toHaveAttribute("data-entry-id", "hc-1");
  });

  it("offers no auto-fill box", () => {
    renderTab();
    expect(screen.queryByRole("textbox", { name: "Auto-fill from existing entry" })).toBeNull();
  });
});
