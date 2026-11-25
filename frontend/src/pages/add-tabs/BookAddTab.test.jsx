// Frontend: the book's one form body, as the Add tab renders it - the
// canonical section order, CN-first names with "Romaji", the two search boxes
// that only Add carries, and a franchise change dropping the series.
// BookModifyTab.test.jsx covers the same body as Modify renders it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import BookAddTab from "./BookAddTab";
import { defaultBook } from "../../config/formFactories";

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

const BOOK_SECTIONS = [
  "Titles & Naming",
  "Scores",
  "My Tracker",
  "Information",
  "Genres & Labels",
  "Production",
  "Cast",
  "Units",
  "Links & Sources",
  "Cover",
];

function renderTab(props = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookAddTab
        franchiseCollections={{}}
        nvf={defaultBook()}
        unv={() => {}}
        allBooks={[]}
        applyBookEntryAutofill={() => {}}
        applyMalPick={() => {}}
        applyOpenLibraryPick={() => {}}
        allFranchises={[]}
        seriesItemsForBook={[]}
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

describe("BookAddTab — layout", () => {
  it("renders the canonical sections in order", () => {
    const { container } = renderTab();
    expect(sections(container)).toEqual(BOOK_SECTIONS);
  });

  it("puts CN first and labels the romanised name Romaji", () => {
    renderTab();
    const names = screen
      .getAllByLabelText(/^Book Name /)
      .map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual([
      "Book Name CN",
      "Book Name EN",
      "Book Name Romaji",
      "Book Name JP",
      "Book Name Alt",
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

describe("BookAddTab — Add-only pieces", () => {
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

describe("BookAddTab — lineage", () => {
  it("clears the series when the franchise changes", () => {
    const unv = vi.fn();
    renderTab({
      unv,
      nvf: { ...defaultBook(), series_id: "s1", series_text: "Arc" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(unv).toHaveBeenCalledWith("series_id", null);
    expect(unv).toHaveBeenCalledWith("series_text", "");
  });

  it("offers Book, Anime, Manga and untyped franchises only", () => {
    renderTab({
      allFranchises: [
        { system_id: "a", franchise_name_en: "Book One", franchise_type: "Book" },
        { system_id: "b", franchise_name_en: "Anime One", franchise_type: "Anime" },
        { system_id: "e", franchise_name_en: "Manga One", franchise_type: "Game, Manga" },
        { system_id: "c", franchise_name_en: "Untyped One", franchise_type: null },
        { system_id: "d", franchise_name_en: "Movie One", franchise_type: "Movie" },
      ],
    });
    const box = screen.getByRole("combobox", { name: "Franchise" });
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "One" } });
    expect(screen.getByText("Book One")).toBeInTheDocument();
    expect(screen.getByText("Anime One")).toBeInTheDocument();
    expect(screen.getByText("Manga One")).toBeInTheDocument();
    expect(screen.getByText("Untyped One")).toBeInTheDocument();
    expect(screen.queryByText("Movie One")).not.toBeInTheDocument();
  });
});

describe("BookAddTab — progress display", () => {
  it("keeps a stored value the list no longer offers, marked legacy", () => {
    renderTab({ nvf: { ...defaultBook(), type: "網路小說", progress_display: "vol_tw" } });
    const values = [
      ...screen.getByLabelText("Progress display").options,
    ].map((o) => o.value);
    expect(values).toContain("vol_tw");
  });
});

// A book's release date is split by edition, as anime's is: the JP date and
// the TW one, both free text taking YYYY, YYYY-MM or YYYY-MM-DD, next to the
// one end date.
describe("BookAddTab — release dates", () => {
  const input = (container, label) =>
    [...container.querySelectorAll("label")]
      .find((l) => l.textContent === label)
      ?.parentElement.querySelector("input");

  it("offers Release Date JP, Release Date TW and End Date, and no plain Release Date", () => {
    const { container } = renderTab();
    const labels = [...container.querySelectorAll("label")].map((l) => l.textContent);
    expect(labels).toEqual(
      expect.arrayContaining(["Release Date JP", "Release Date TW", "End Date"]),
    );
    expect(labels).not.toContain("Release Date");
  });

  it("writes each date to its own field", () => {
    const unv = vi.fn();
    const { container } = renderTab({ unv });
    fireEvent.change(input(container, "Release Date JP"), { target: { value: "2019" } });
    expect(unv).toHaveBeenCalledWith("release_date_jp", "2019");
    fireEvent.change(input(container, "Release Date TW"), { target: { value: "2020-03" } });
    expect(unv).toHaveBeenCalledWith("release_date_tw", "2020-03");
  });

  it("shows the stored dates", () => {
    const { container } = renderTab({
      nvf: { ...defaultBook(), release_date_jp: "2019-01", release_date_tw: "2020" },
    });
    expect(input(container, "Release Date JP").value).toBe("2019-01");
    expect(input(container, "Release Date TW").value).toBe("2020");
  });
});

// A book names the studio that animated its adaptation, as a manga does: an
// Anime Studio field beside Publisher TW, saved as anime_studio.
describe("BookAddTab — Anime Studio", () => {
  it("offers Anime Studio beside Publisher TW", () => {
    const { container } = renderTab();
    const label = [...container.querySelectorAll("label")].find((l) => l.textContent === "Anime Studio");
    expect(label).toBeDefined();
    const publisher = [...container.querySelectorAll("label")].find((l) => l.textContent === "Publisher TW");
    expect(label.closest(".grid")).toBe(publisher.closest(".grid"));
  });

  it("is carried into the save payload", async () => {
    const { bookFieldsPayload } = await import("../../lib/payloads");
    expect(bookFieldsPayload({ anime_studio: "Shaft" }).anime_studio).toBe("Shaft");
    expect(bookFieldsPayload({ anime_studio: "" }).anime_studio).toBeNull();
  });
});
