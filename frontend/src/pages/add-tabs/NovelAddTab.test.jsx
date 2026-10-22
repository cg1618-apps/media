// Frontend: the novel's one form body, as the Add tab renders it - the
// canonical section order, CN-first names with "Romaji", the two search boxes
// that only Add carries, and a franchise change dropping the series.
// NovelModifyTab.test.jsx covers the same body as Modify renders it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NovelAddTab from "./NovelAddTab";
import { defaultNovel } from "../../config/formFactories";

// Stand-ins that expose what the body hands them: the owner the cover is
// attached to and the entry the cast is saved under.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => (
    <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />
  ),
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: (props) => (
    <div data-testid="cast-editor" data-entry-id={props.entryId ?? ""} />
  ),
}));

const NOVEL_SECTIONS = [
  "Titles & Naming",
  "Scores",
  "My Tracker",
  "Information",
  "Genres & Labels",
  "Production",
  "Cast",
  "Read Order",
  "Units",
  "Links & Sources",
  "Cover & Remark",
];

function renderTab(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NovelAddTab
        franchiseCollections={{}}
        nvf={defaultNovel()}
        unv={() => {}}
        allNovels={[]}
        applyNovelEntryAutofill={() => {}}
        applyMalPick={() => {}}
        applyOpenLibraryPick={() => {}}
        allFranchises={[]}
        seriesItemsForNovel={[]}
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

describe("NovelAddTab — layout", () => {
  it("renders the canonical sections in order", () => {
    const { container } = renderTab();
    expect(sections(container)).toEqual(NOVEL_SECTIONS);
  });

  it("puts CN first and labels the romanised name Romaji", () => {
    renderTab();
    const names = screen
      .getAllByLabelText(/^Novel Name /)
      .map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual([
      "Novel Name CN",
      "Novel Name EN",
      "Novel Name Romaji",
      "Novel Name JP",
      "Novel Name Alt",
    ]);
    expect(screen.queryByText(/Name Roman$/)).not.toBeInTheDocument();
  });

  it("keeps Add's placeholders", () => {
    renderTab();
    expect(screen.getByPlaceholderText("English title")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Search or type new franchise..."),
    ).toBeInTheDocument();
  });

  it("shows the AniList ranks", () => {
    renderTab();
    expect(screen.getByLabelText("AniList Rank")).toBeInTheDocument();
    expect(screen.getByLabelText("AniList Popularity Rank")).toBeInTheDocument();
  });
});

describe("NovelAddTab — Add-only pieces", () => {
  it("shows the auto-fill box and both external searches", () => {
    renderTab();
    expect(
      screen.getByRole("textbox", { name: "Auto-fill from existing entry" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search MAL" })).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Search Open Library" }),
    ).toBeInTheDocument();
  });

  it("passes no owner: the cover stays pending, the cast unattached", () => {
    renderTab();
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "");
    expect(screen.getByTestId("cast-editor")).toHaveAttribute("data-entry-id", "");
  });
});

describe("NovelAddTab — lineage", () => {
  it("clears the series when the franchise changes", () => {
    const unv = vi.fn();
    renderTab({
      unv,
      nvf: { ...defaultNovel(), series_id: "s1", series_text: "Arc" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(unv).toHaveBeenCalledWith("series_id", null);
    expect(unv).toHaveBeenCalledWith("series_text", "");
  });

  it("offers Novel, ACG and untyped franchises only", () => {
    renderTab({
      allFranchises: [
        { system_id: "a", franchise_name_en: "Novel One", franchise_type: "Novel" },
        { system_id: "b", franchise_name_en: "ACG One", franchise_type: "ACG" },
        { system_id: "c", franchise_name_en: "Untyped One", franchise_type: null },
        { system_id: "d", franchise_name_en: "Movie One", franchise_type: "Movie" },
      ],
    });
    const box = screen.getByRole("combobox", { name: "Franchise" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "One" } });
    expect(screen.getByText("Novel One")).toBeInTheDocument();
    expect(screen.getByText("ACG One")).toBeInTheDocument();
    expect(screen.getByText("Untyped One")).toBeInTheDocument();
    expect(screen.queryByText("Movie One")).not.toBeInTheDocument();
  });
});

describe("NovelAddTab — progress display", () => {
  it("keeps a stored value the list no longer offers, marked legacy", () => {
    renderTab({ nvf: { ...defaultNovel(), type: "Web", progress_display: "vol_tw" } });
    const values = [
      ...screen.getByLabelText("Progress display").options,
    ].map((o) => o.value);
    expect(values).toContain("vol_tw");
  });
});
