// Frontend: the Add form's Movie tab - its two search boxes, and the movie
// form body and lineage pickers MovieModifyTab renders too.
//
// Pins the canonical layout (section order, CN-first names, the IMDb rating
// under Scores), which franchises the picker offers, that a new franchise
// drops the series, and that a cover picked before the movie exists is kept
// as pending_image_id for the page to attach after the save.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MovieAddTab from "./MovieAddTab";
import { defaultMovie } from "../../config/formFactories";

// The picker stands in for ImagePicker: it reports the owner it was given and
// hands back a picked image, so the pending-image rule can be read without
// an upload.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: ({ ownerId, onChange }) => (
    <button
      type="button"
      data-testid="image-picker"
      data-owner-id={ownerId ?? ""}
      onClick={() => onChange("covers/x.webp", "img-1")}
    >
      pick cover
    </button>
  ),
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };

const FRANCHISES = [
  { system_id: "fm", franchise_name_en: "Alpha Movie", franchise_type: "Movie" },
  { system_id: "fmt", franchise_name_en: "Alpha Mixed", franchise_type: "TV, Movie" },
  { system_id: "ft", franchise_name_en: "Alpha TV", franchise_type: "TV" },
  { system_id: "fn", franchise_name_en: "Alpha Plain", franchise_type: null },
];

let lastForm;
function Harness({ initial = {}, seriesItems = [] }) {
  const [form, setForm] = useState({ ...defaultMovie(), ...initial });
  return (
    <MovieAddTab
      franchiseCollections={{}}
      mf={form}
      umf={(k, v) =>
        setForm((p) => {
          lastForm = { ...p, [k]: v };
          return lastForm;
        })
      }
      allMovies={[]}
      applyMovieEntryAutofill={() => {}}
      applyTmdbPick={() => {}}
      allFranchises={FRANCHISES}
      seriesItemsForMovie={seriesItems}
      sources={SOURCES}
    />
  );
}

function renderTab(props) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness {...props} />
    </QueryClientProvider>,
  );
}

const sections = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

describe("MovieAddTab", () => {
  it("lays the form out in the canonical section order", () => {
    const { container } = renderTab();
    expect(sections(container)).toEqual([
      "Titles & Naming",
      "Scores",
      "My Tracker",
      "Information",
      "Genres & Labels",
      "Production",
      "Links & Sources",
      "Cover & Remark",
    ]);
  });

  it("puts the CN name first, then EN, then Alt", () => {
    renderTab();
    const names = screen
      .getAllByRole("textbox")
      .map((el) => el.getAttribute("aria-label"))
      .filter((l) => l?.startsWith("Movie Name"));
    expect(names).toEqual(["Movie Name CN", "Movie Name EN", "Movie Name Alt"]);
    expect(screen.getByPlaceholderText("English title")).toBe(
      screen.getByRole("textbox", { name: "Movie Name EN" }),
    );
  });

  it("edits the IMDb rating", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.type(screen.getByRole("spinbutton", { name: "IMDb Rating" }), "7.8");
    expect(lastForm.imdb_rating).toBe("7.8");
  });

  it("takes both release dates as free text, so a year alone is valid", async () => {
    const user = userEvent.setup();
    renderTab();
    const usa = screen.getAllByPlaceholderText("2024-05-17")[1];
    await user.type(usa, "1999");
    expect(lastForm.release_date_usa).toBe("1999");
    expect(lastForm.release_date_tw).toBe("");
  });

  it("shows the autofill and TMDB boxes", () => {
    renderTab();
    expect(screen.getByRole("textbox", { name: "Auto-fill from existing entry" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search TMDB" })).toBeInTheDocument();
  });

  it("offers movie and untyped franchises only", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(screen.getByRole("combobox", { name: "Franchise" }));
    expect(screen.getByText("Alpha Movie")).toBeInTheDocument();
    expect(screen.getByText("Alpha Mixed")).toBeInTheDocument();
    expect(screen.getByText("Alpha Plain")).toBeInTheDocument();
    expect(screen.queryByText("Alpha TV")).not.toBeInTheDocument();
  });

  it("drops the series when the franchise changes", async () => {
    const user = userEvent.setup();
    renderTab({
      initial: { series_id: "s1", series_text: "Old Series" },
      seriesItems: [{ id: "s1", label: "Old Series" }],
    });
    expect(screen.getByText("Old Series")).toBeInTheDocument();
    await user.type(screen.getByRole("combobox", { name: "Franchise" }), "N");
    expect(lastForm.series_id).toBeNull();
    expect(lastForm.series_text).toBe("");
    expect(screen.getByRole("combobox", { name: "Series" })).toHaveValue("");
  });

  it("keeps a picked cover as pending, with no owner to attach it to yet", async () => {
    const user = userEvent.setup();
    renderTab();
    const picker = screen.getByTestId("image-picker");
    expect(picker).toHaveAttribute("data-owner-id", "");
    await user.click(picker);
    expect(lastForm.pending_image_id).toBe("img-1");
  });
});
