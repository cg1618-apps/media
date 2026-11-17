// Frontend: the arc/chapter inputs exist only for the types that count them.
// A 輕小說 and a 小說 count volumes; derive_book_progress() clears
// their chapter and arc columns on save, so offering the inputs would invite
// an edit that is silently discarded.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BookModifyTab from "./BookModifyTab";

// BookNotes fetches on mount and is not what these tests are about.
vi.mock("../detail/BookNotes", () => ({
  default: (props) => (
    <div data-testid="book-notes" data-owner-id={props.book?.system_id} />
  ),
}));

// Stand-ins that expose what the shared body hands them: the owner the cover
// is attached to and the entry the cast is saved under.
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

// The Cover Image field is now an ImagePicker, which reads react-query hooks
// even before anything is uploaded - every render needs a QueryClientProvider.
function renderBook(ui) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

function props(type) {
  return {
    franchiseCollections: [],
    cnvf: { type, units: [] },
    unv: () => {},
    allFranchises: [],
    seriesItemsForBook: [],
    editingItem: { system_id: "n1" },
    sources: [],
  };
}

const CHAPTER_FIELDS = ["Arc Total", "Arc Finished", "Ch Total", "Ch Finished"];
const VOLUME_FIELDS = ["Total Volumes (JP/KR)", "Vol Total (TW)", "Vol Finished"];

describe("BookModifyTab — arc and chapter inputs follow the type", () => {
  it.each(["輕小說", "小說"])("hides them for %s", (type) => {
    renderBook(<BookModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it.each(["輕小說", "小說"])("keeps the volume inputs for %s", (type) => {
    renderBook(<BookModifyTab {...props(type)} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each(["網路小說", "其他"])("shows them for %s", (type) => {
    renderBook(<BookModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows them for a book whose type is not set yet", () => {
    renderBook(<BookModifyTab {...props("")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });
});

// A web novel is read in chapters. Its volume columns are kept but never
// edited here, and its progress-display choice narrows to what it can render.
describe("BookModifyTab — volume inputs follow the type", () => {
  it("hides the volume inputs for 網路小說", () => {
    renderBook(<BookModifyTab {...props("網路小說")} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("keeps the chapter inputs for 網路小說", () => {
    renderBook(<BookModifyTab {...props("網路小說")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });

  it.each(["輕小說", "其他"])("keeps the volume inputs for %s", (type) => {
    renderBook(<BookModifyTab {...props(type)} />);
    expect(screen.getByText("Vol Finished")).toBeInTheDocument();
  });
});

describe("BookModifyTab — the progress-display select is built per type", () => {
  const values = () =>
    [...screen.getByLabelText("Progress display").options].map((o) => o.value);

  it("offers only volume counters for a 輕小說", () => {
    renderBook(<BookModifyTab {...props("輕小說")} />);
    expect(values()).toEqual(["", "vol_original", "vol_tw"]);
  });

  it("offers only chapters for a 網路小說 with no arc rows", () => {
    renderBook(<BookModifyTab {...props("網路小說")} />);
    expect(values()).toEqual(["", "ch"]);
  });

  it("adds the arc counters once the entry has arc rows", () => {
    const p = props("網路小說");
    p.cnvf.units = [{ unit_kind: "arc", position: 1, ch_count: 100 }];
    renderBook(<BookModifyTab {...p} />);
    expect(values()).toEqual(["", "ch", "arc", "arc_ch"]);
  });

  it("keeps a stored value the list no longer offers, marked legacy", () => {
    const p = props("網路小說");
    p.cnvf.progress_display = "vol_tw";
    renderBook(<BookModifyTab {...p} />);
    expect(values()).toContain("vol_tw");
  });
});

// The Open Library work id is editable, like MAL ID on an anime. The link is
// the truth whenever it is set — apply_extract_openlibrary_id rewrites the id
// from it on every Fill — but with no link there is nothing to derive an id
// from, and a stale id left behind by a cleared link can only be removed here.
describe("BookModifyTab — Open Library fields", () => {
  it("offers both the link and the id", () => {
    renderBook(<BookModifyTab {...props("小說")} />);
    expect(screen.getByText("Open Library Link")).toBeInTheDocument();
    expect(screen.getByText("Open Library ID")).toBeInTheDocument();
  });

  it("shows the stored id and reports edits under openlibrary_id", () => {
    const unv = vi.fn();
    renderBook(
      <BookModifyTab
        {...props("小說")}
        cnvf={{ type: "小說", units: [], openlibrary_id: "OL5738148W" }}
        unv={unv}
      />,
    );

    const input = screen.getByDisplayValue("OL5738148W");
    fireEvent.change(input, { target: { value: "OL468431W" } });
    expect(unv).toHaveBeenCalledWith("openlibrary_id", "OL468431W");
  });

  it("lets a stale id be cleared", () => {
    const unv = vi.fn();
    renderBook(
      <BookModifyTab
        {...props("小說")}
        cnvf={{ type: "小說", units: [], openlibrary_id: "OL5738148W" }}
        unv={unv}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("OL5738148W"), {
      target: { value: "" },
    });
    expect(unv).toHaveBeenCalledWith("openlibrary_id", "");
  });
});

// The body is BookAddTab's BookFormBody; Modify adds only Structured Notes
// below it, and passes the entry's id as the owner.
describe("BookModifyTab — the shared body", () => {
  const sections = (container) =>
    [...container.querySelectorAll("[data-form-section]")].map(
      (el) => el.dataset.formSection,
    );

  it("renders the canonical sections in order, then Structured Notes", () => {
    const { container } = renderBook(<BookModifyTab {...props("小說")} />);
    expect(sections(container)).toEqual([
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
      "Structured Notes",
    ]);
  });

  it("puts CN first and labels the romanised name Romaji", () => {
    renderBook(<BookModifyTab {...props("小說")} />);
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
  });

  it("edits the AniList ranks", () => {
    const unv = vi.fn();
    renderBook(<BookModifyTab {...props("小說")} unv={unv} />);
    fireEvent.change(screen.getByLabelText("AniList Rank"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("AniList Popularity Rank"), {
      target: { value: "34" },
    });
    expect(unv).toHaveBeenCalledWith("anilist_rank", "12");
    expect(unv).toHaveBeenCalledWith("anilist_popularity_rank", "34");
  });

  it("carries none of Add's search boxes", () => {
    renderBook(<BookModifyTab {...props("小說")} />);
    expect(
      screen.queryByRole("textbox", { name: "Auto-fill from existing entry" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search MAL" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Search Open Library" }),
    ).not.toBeInTheDocument();
  });

  it("passes the entry's id to the cover, the cast and the notes", () => {
    renderBook(<BookModifyTab {...props("小說")} />);
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "n1");
    expect(screen.getByTestId("cast-editor")).toHaveAttribute("data-entry-id", "n1");
    expect(screen.getByTestId("book-notes")).toHaveAttribute("data-owner-id", "n1");
  });

  it("clears the series when the franchise changes", () => {
    const unv = vi.fn();
    const p = props("小說");
    p.cnvf.series_id = "s1";
    renderBook(<BookModifyTab {...p} unv={unv} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(unv).toHaveBeenCalledWith("series_id", null);
    expect(unv).toHaveBeenCalledWith("series_text", "");
  });

  it("writes nothing on mount", () => {
    const unv = vi.fn();
    renderBook(<BookModifyTab {...props("小說")} unv={unv} />);
    expect(unv).not.toHaveBeenCalled();
  });
});
