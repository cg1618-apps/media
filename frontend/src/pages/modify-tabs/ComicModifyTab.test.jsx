// Frontend: the comic Modify tab renders ComicAddTab's ComicFormBody - the
// same sections in the same order - adds Structured Notes below it, carries
// none of Add's search boxes, and passes the entry's id as the owner.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ComicModifyTab from "./ComicModifyTab";

vi.mock("../detail/ComicNotes", () => ({
  default: (props) => (
    <div data-testid="comic-notes" data-owner-id={props.comic?.system_id} />
  ),
}));
vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => (
    <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />
  ),
}));

function renderTab(overrides = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ComicModifyTab
        franchiseCollections={{}}
        ccmf={{}}
        ucm={() => {}}
        allFranchises={[]}
        seriesItemsForComic={[]}
        editingItem={{ system_id: "c1" }}
        sources={[]}
        {...overrides}
      />
    </QueryClientProvider>,
  );
}

const sections = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map(
    (el) => el.dataset.formSection,
  );

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

describe("ComicModifyTab — the shared body", () => {
  it("renders the canonical sections in order, then Structured Notes", () => {
    const { container } = renderTab();
    expect(sections(container)).toEqual([
      "Titles & Naming",
      "My Tracker",
      "Information",
      "Genres & Labels",
      "Production",
      "Read Order",
      "Links & Sources",
      "Cover & Remark",
      "Structured Notes",
    ]);
  });

  it("puts CN left of EN, then Alt", () => {
    renderTab();
    const names = screen
      .getAllByLabelText(/^Comic Name /)
      .map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual(["Comic Name CN", "Comic Name EN", "Comic Name Alt"]);
  });

  it("shows and edits the stored Comic Vine ID", () => {
    const ucm = vi.fn();
    renderTab({ ccmf: { comicvine_id: 4050 }, ucm });
    const input = screen.getByLabelText("Comic Vine ID");
    expect(input).toHaveValue(4050);
    fireEvent.change(input, { target: { value: "" } });
    expect(ucm).toHaveBeenCalledWith("comicvine_id", "");
  });

  it("carries none of Add's search boxes", () => {
    renderTab();
    expect(
      screen.queryByRole("textbox", { name: "Auto-fill from existing entry" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Search Comic Vine" }),
    ).not.toBeInTheDocument();
  });

  it("passes the entry's id to the cover and the notes", () => {
    renderTab();
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "c1");
    expect(screen.getByTestId("comic-notes")).toHaveAttribute("data-owner-id", "c1");
  });

  it("clears the series when the franchise changes", () => {
    const ucm = vi.fn();
    renderTab({ ccmf: { series_id: "s1" }, ucm });
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(ucm).toHaveBeenCalledWith("series_id", null);
    expect(ucm).toHaveBeenCalledWith("series_text", "");
  });

  it("writes nothing on mount", () => {
    const ucm = vi.fn();
    renderTab({ ucm });
    expect(ucm).not.toHaveBeenCalled();
  });
});
