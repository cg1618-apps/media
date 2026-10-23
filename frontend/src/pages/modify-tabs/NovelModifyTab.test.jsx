// Frontend: the arc/chapter inputs exist only for the types that count them.
// A Light Novel and a Novel count volumes; derive_novel_progress() clears
// their chapter and arc columns on save, so offering the inputs would invite
// an edit that is silently discarded.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NovelModifyTab from "./NovelModifyTab";

// NovelNotes fetches on mount and is not what these tests are about.
vi.mock("../detail/NovelNotes", () => ({
  default: (props) => (
    <div data-testid="novel-notes" data-owner-id={props.novel?.system_id} />
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
function renderNovel(ui) {
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
    seriesItemsForNovel: [],
    editingItem: { system_id: "n1" },
    sources: [],
  };
}

const CHAPTER_FIELDS = ["Arc Total", "Arc Finished", "Ch Total", "Ch Finished"];
const VOLUME_FIELDS = ["Total Volumes (JP/KR)", "Vol Total (TW)", "Vol Finished"];

describe("NovelModifyTab — arc and chapter inputs follow the type", () => {
  it.each(["Light Novel", "Novel"])("hides them for %s", (type) => {
    renderNovel(<NovelModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it.each(["Light Novel", "Novel"])("keeps the volume inputs for %s", (type) => {
    renderNovel(<NovelModifyTab {...props(type)} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it.each(["Web", "Other"])("shows them for %s", (type) => {
    renderNovel(<NovelModifyTab {...props(type)} />);
    for (const label of CHAPTER_FIELDS) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("shows them for a novel whose type is not set yet", () => {
    renderNovel(<NovelModifyTab {...props("")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });
});

// A web novel is read in chapters. Its volume columns are kept but never
// edited here, and its progress-display choice narrows to what it can render.
describe("NovelModifyTab — volume inputs follow the type", () => {
  it("hides the volume inputs for Web", () => {
    renderNovel(<NovelModifyTab {...props("Web")} />);
    for (const label of VOLUME_FIELDS) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("keeps the chapter inputs for Web", () => {
    renderNovel(<NovelModifyTab {...props("Web")} />);
    expect(screen.getByText("Ch Total")).toBeInTheDocument();
  });

  it.each(["Light Novel", "Other"])("keeps the volume inputs for %s", (type) => {
    renderNovel(<NovelModifyTab {...props(type)} />);
    expect(screen.getByText("Vol Finished")).toBeInTheDocument();
  });
});

describe("NovelModifyTab — the progress-display select is built per type", () => {
  const values = () =>
    [...screen.getByLabelText("Progress display").options].map((o) => o.value);

  it("offers only volume counters for a Light Novel", () => {
    renderNovel(<NovelModifyTab {...props("Light Novel")} />);
    expect(values()).toEqual(["", "vol_original", "vol_tw"]);
  });

  it("offers only chapters for a Web novel with no arc rows", () => {
    renderNovel(<NovelModifyTab {...props("Web")} />);
    expect(values()).toEqual(["", "ch"]);
  });

  it("adds the arc counters once the entry has arc rows", () => {
    const p = props("Web");
    p.cnvf.units = [{ unit_kind: "arc", position: 1, ch_count: 100 }];
    renderNovel(<NovelModifyTab {...p} />);
    expect(values()).toEqual(["", "ch", "arc", "arc_ch"]);
  });

  it("keeps a stored value the list no longer offers, marked legacy", () => {
    const p = props("Web");
    p.cnvf.progress_display = "vol_tw";
    renderNovel(<NovelModifyTab {...p} />);
    expect(values()).toContain("vol_tw");
  });
});

// The Open Library work id is editable, like MAL ID on an anime. The link is
// the truth whenever it is set — apply_extract_openlibrary_id rewrites the id
// from it on every Fill — but with no link there is nothing to derive an id
// from, and a stale id left behind by a cleared link can only be removed here.
describe("NovelModifyTab — Open Library fields", () => {
  it("offers both the link and the id", () => {
    renderNovel(<NovelModifyTab {...props("Novel")} />);
    expect(screen.getByText("Open Library Link")).toBeInTheDocument();
    expect(screen.getByText("Open Library ID")).toBeInTheDocument();
  });

  it("shows the stored id and reports edits under openlibrary_id", () => {
    const unv = vi.fn();
    renderNovel(
      <NovelModifyTab
        {...props("Novel")}
        cnvf={{ type: "Novel", units: [], openlibrary_id: "OL5738148W" }}
        unv={unv}
      />,
    );

    const input = screen.getByDisplayValue("OL5738148W");
    fireEvent.change(input, { target: { value: "OL468431W" } });
    expect(unv).toHaveBeenCalledWith("openlibrary_id", "OL468431W");
  });

  it("lets a stale id be cleared", () => {
    const unv = vi.fn();
    renderNovel(
      <NovelModifyTab
        {...props("Novel")}
        cnvf={{ type: "Novel", units: [], openlibrary_id: "OL5738148W" }}
        unv={unv}
      />,
    );

    fireEvent.change(screen.getByDisplayValue("OL5738148W"), {
      target: { value: "" },
    });
    expect(unv).toHaveBeenCalledWith("openlibrary_id", "");
  });
});

// The body is NovelAddTab's NovelFormBody; Modify adds only Structured Notes
// below it, and passes the entry's id as the owner.
describe("NovelModifyTab — the shared body", () => {
  const sections = (container) =>
    [...container.querySelectorAll("[data-form-section]")].map(
      (el) => el.dataset.formSection,
    );

  it("renders the canonical sections in order, then Structured Notes", () => {
    const { container } = renderNovel(<NovelModifyTab {...props("Novel")} />);
    expect(sections(container)).toEqual([
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
      "Structured Notes",
    ]);
  });

  it("puts CN first and labels the romanised name Romaji", () => {
    renderNovel(<NovelModifyTab {...props("Novel")} />);
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
  });

  it("edits the AniList ranks", () => {
    const unv = vi.fn();
    renderNovel(<NovelModifyTab {...props("Novel")} unv={unv} />);
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
    renderNovel(<NovelModifyTab {...props("Novel")} />);
    expect(
      screen.queryByRole("textbox", { name: "Auto-fill from existing entry" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Search MAL" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Search Open Library" }),
    ).not.toBeInTheDocument();
  });

  it("passes the entry's id to the cover, the cast and the notes", () => {
    renderNovel(<NovelModifyTab {...props("Novel")} />);
    expect(screen.getByTestId("image-picker")).toHaveAttribute("data-owner-id", "n1");
    expect(screen.getByTestId("cast-editor")).toHaveAttribute("data-entry-id", "n1");
    expect(screen.getByTestId("novel-notes")).toHaveAttribute("data-owner-id", "n1");
  });

  it("clears the series when the franchise changes", () => {
    const unv = vi.fn();
    const p = props("Novel");
    p.cnvf.series_id = "s1";
    renderNovel(<NovelModifyTab {...p} unv={unv} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Franchise" }), {
      target: { value: "New" },
    });
    expect(unv).toHaveBeenCalledWith("series_id", null);
    expect(unv).toHaveBeenCalledWith("series_text", "");
  });

  it("writes nothing on mount", () => {
    const unv = vi.fn();
    renderNovel(<NovelModifyTab {...props("Novel")} unv={unv} />);
    expect(unv).not.toHaveBeenCalled();
  });
});
