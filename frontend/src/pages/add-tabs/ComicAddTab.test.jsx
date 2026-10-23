// Frontend: the comic's one form body, as the Add tab renders it - the
// canonical section order, CN-first names, the Comic Vine ID beside its link,
// events as an array, the search boxes only Add carries, and a franchise
// change dropping the series. ComicModifyTab.test.jsx covers the same body as
// Modify renders it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ComicAddTab from "./ComicAddTab";
import { defaultComic } from "../../config/formFactories";

vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => (
    <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />
  ),
}));

const COMIC_SECTIONS = [
  "Titles & Naming",
  "My Tracker",
  "Information",
  "Genres & Labels",
  "Production",
  "Read Order",
  "Links & Sources",
  "Cover & Remark",
];

function renderTab(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ComicAddTab
        franchiseCollections={{}}
        cmf={defaultComic()}
        ucm={() => {}}
        allComics={[]}
        applyComicEntryAutofill={() => {}}
        applyComicVinePick={() => {}}
        allFranchises={[]}
        seriesItemsForComic={[]}
        sources={[]}
        {...props}
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

describe("ComicAddTab — layout", () => {
  it("renders the canonical sections in order", () => {
    const { container } = renderTab();
    expect(sections(container)).toEqual(COMIC_SECTIONS);
  });

  it("puts CN left of EN, then Alt", () => {
    renderTab();
    const names = screen
      .getAllByLabelText(/^Comic Name /)
      .map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual(["Comic Name CN", "Comic Name EN", "Comic Name Alt"]);
    expect(screen.getByPlaceholderText("English title")).toBeInTheDocument();
  });

  it("edits the Comic Vine ID beside the link", () => {
    const ucm = vi.fn();
    renderTab({ ucm });
    fireEvent.change(screen.getByLabelText("Comic Vine ID"), {
      target: { value: "2127" },
    });
    expect(ucm).toHaveBeenCalledWith("comicvine_id", "2127");
    expect(screen.getByLabelText("Comic Vine Link")).toBeInTheDocument();
  });

  it("shows stored events as text and writes them back as an array", () => {
    renderTab({ cmf: { ...defaultComic(), events: ["Civil War", "Secret Wars"] } });
    expect(screen.getByText("Civil War")).toBeInTheDocument();
    expect(screen.getByText("Secret Wars")).toBeInTheDocument();
  });
});

describe("ComicAddTab — Add-only pieces", () => {
  it("shows the auto-fill box and the Comic Vine search", () => {
    renderTab();
    expect(
      screen.getByRole("textbox", { name: "Auto-fill from existing entry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search Comic Vine" }),
    ).toBeInTheDocument();
  });

  it("passes no owner, so the cover stays pending", () => {
    renderTab();
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "");
  });
});

describe("ComicAddTab — lineage", () => {
  it("clears the series when the franchise changes", () => {
    const ucm = vi.fn();
    renderTab({ ucm, cmf: { ...defaultComic(), series_id: "s1" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(ucm).toHaveBeenCalledWith("series_id", null);
    expect(ucm).toHaveBeenCalledWith("series_text", "");
  });

  it("offers Comic and untyped franchises only", () => {
    renderTab({
      allFranchises: [
        { system_id: "a", franchise_name_en: "Comic One", franchise_type: "Comic" },
        { system_id: "b", franchise_name_en: "Untyped One", franchise_type: null },
        { system_id: "c", franchise_name_en: "ACG One", franchise_type: "ACG" },
      ],
    });
    const box = screen.getByRole("combobox", { name: "Franchise" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "One" } });
    expect(screen.getByText("Comic One")).toBeInTheDocument();
    expect(screen.getByText("Untyped One")).toBeInTheDocument();
    expect(screen.queryByText("ACG One")).not.toBeInTheDocument();
  });
});
