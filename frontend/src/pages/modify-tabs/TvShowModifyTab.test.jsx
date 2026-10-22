// Frontend: the Modify page's TV Show editor.
//
// It renders TvShowAddTab's body, so the layout is pinned there; this pins
// what the Modify wrapper changes: no search boxes, the TV show's id handed to
// the body as its owner (a picked cover attaches straight away and nothing is
// left pending), and the Structured Notes after the form.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TvShowModifyTab from "./TvShowModifyTab";

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
vi.mock("../detail/TVShowNotes", () => ({
  default: ({ show }) => <div data-testid="notes">{show.system_id}</div>,
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };

// Modify state carries no tag or credit keys until the credits load.
const INITIAL = {
  tv_name_en: "Heat",
  imdb_rating: "8.3",
  pending_image_id: "stale",
};

let lastForm;
function Harness() {
  const [form, setForm] = useState(INITIAL);
  return (
    <TvShowModifyTab
      franchiseCollections={{}}
      tvmf={form}
      utv={(k, v) =>
        setForm((p) => {
          lastForm = { ...p, [k]: v };
          return lastForm;
        })
      }
      allFranchises={[]}
      seriesItemsForTvShow={[]}
      editingItem={{ system_id: "tv-1" }}
      sources={SOURCES}
    />
  );
}

function renderTab() {
  lastForm = INITIAL;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

describe("TvShowModifyTab", () => {
  it("renders the shared body, then the Structured Notes", () => {
    const { container } = renderTab();
    const titles = [...container.querySelectorAll("[data-form-section]")].map((el) =>
      el.getAttribute("data-form-section"),
    );
    expect(titles).toEqual([
      "Titles & Naming",
      "Scores",
      "My Tracker",
      "Information",
      "Genres & Labels",
      "Links & Sources",
      "Cover & Remark",
      "Structured Notes",
    ]);
    expect(screen.getByTestId("notes")).toHaveTextContent("tv-1");
  });

  it("shows the IMDb rating the TV show holds", () => {
    renderTab();
    expect(screen.getByRole("spinbutton", { name: "IMDb Rating" })).toHaveValue(8.3);
  });

  it("has no autofill or TMDB box", () => {
    renderTab();
    expect(screen.queryByRole("textbox", { name: "Auto-fill from existing entry" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search TMDB" })).toBeNull();
  });

  it("hands the TV show's id to the cover picker and leaves nothing pending", async () => {
    const user = userEvent.setup();
    renderTab();
    const picker = screen.getByTestId("image-picker");
    expect(picker).toHaveAttribute("data-owner-id", "tv-1");
    await user.click(picker);
    expect(lastForm.pending_image_id).toBeNull();
  });

  it("writes no default on mount", () => {
    renderTab();
    expect(Object.keys(lastForm).sort()).toEqual(["imdb_rating", "pending_image_id", "tv_name_en"]);
  });
});
