// Frontend: the anime movie form. Add and Modify render one
// AnimeMovieFormBody, so this pins both: the canonical section order,
// CN-first names with "Romaji", release dates that hold a year or a month,
// the Add-only search boxes, and the entry id Modify hands its pickers.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnimeMovieAddTab from "./AnimeMovieAddTab";
import AnimeMovieModifyTab from "../modify-tabs/AnimeMovieModifyTab";
import { defaultAnimeMovie } from "../../config/formFactories";

vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />,
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: (props) => <div data-testid="cast-editor" data-entry-id={props.entryId ?? ""} />,
}));
vi.mock("../detail/AnimeMovieNotes", () => ({
  default: (props) => <div data-testid="notes" data-owner-id={props.movie?.system_id} />,
}));

// A director under each scope, so the Director picker can only offer the
// anime-movie one by reading its own scope.
const SOURCES = {
  options: [],
  studios: [],
  publishers: {},
  people: {
    "director|anime-movie": [{ system_id: "p-am", display_name: "Movie Director" }],
    "director|anime": [{ system_id: "p-a", display_name: "Series Director" }],
  },
};
const FRANCHISES = [
  { system_id: "f1", franchise_name_en: "Anime Franchise", franchise_type: "Anime" },
  { system_id: "f2", franchise_name_en: "Film Franchise", franchise_type: "Movie" },
  { system_id: "f3", franchise_name_en: "Anime Movie Franchise", franchise_type: "Anime Movie" },
  { system_id: "f4", franchise_name_en: "Untyped Franchise", franchise_type: null },
  { system_id: "f5", franchise_name_en: "Mixed Franchise", franchise_type: "Movie, Anime Movie" },
];
const SECTIONS = [
  "Titles & Naming",
  "Scores",
  "My Tracker",
  "Information",
  "Genres & Labels",
  "Production",
  "Cast",
  "Links & Sources",
  "Cover",
];

function Harness({ mode, initial }) {
  const [form, setForm] = useState({ ...defaultAnimeMovie(), ...initial });
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <>
      <output data-testid="state">{JSON.stringify(form)}</output>
      {mode === "add" ? (
        <AnimeMovieAddTab
          franchiseCollections={{}}
          amf={form}
          uam={u}
          allAnimeMovies={[]}
          applyAnimeMovieEntryAutofill={() => {}}
          applyMalPick={() => {}}
          allFranchises={FRANCHISES}
          sources={SOURCES}
        />
      ) : (
        <AnimeMovieModifyTab
          franchiseCollections={{}}
          amf={form}
          uam={u}
          allFranchises={FRANCHISES}
          sources={SOURCES}
          editingItem={{ system_id: "am-7" }}
        />
      )}
    </>
  );
}

function renderTab(mode, initial = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness mode={mode} initial={initial} />
    </QueryClientProvider>,
  );
}

const sections = (container) =>
  [...container.querySelectorAll("[data-form-section]")].map((el) =>
    el.getAttribute("data-form-section"),
  );
const labels = (container) =>
  [...container.querySelectorAll("label")].map((l) => l.textContent);
const state = () => JSON.parse(screen.getByTestId("state").textContent);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

describe("Anime movie form", () => {
  it("Add renders the canonical sections in order", () => {
    const { container } = renderTab("add");
    expect(sections(container)).toEqual(SECTIONS);
  });

  it("Modify renders the same sections, then Structured Notes", () => {
    const { container } = renderTab("modify");
    expect(sections(container)).toEqual([...SECTIONS, "Structured Notes"]);
  });

  it("names start with CN and label the romanisation Romaji", () => {
    const { container } = renderTab("modify");
    const names = labels(container).filter((l) => l.startsWith("Anime Movie Name"));
    expect(names).toEqual([
      "Anime Movie Name CN",
      "Anime Movie Name EN",
      "Anime Movie Name Romaji",
      "Anime Movie Name JP",
      "Anime Movie Name Alt",
    ]);
  });

  it("has no Series picker, and labels the distributor in English", () => {
    const { container } = renderTab("modify");
    expect(screen.queryByRole("combobox", { name: "Series" })).toBeNull();
    expect(labels(container)).toContain("Distributor TW");
    expect(labels(container)).not.toContain("台灣代理商");
  });

  it("Modify release dates accept a year alone, as Add's do", async () => {
    const user = userEvent.setup();
    const { container } = renderTab("modify");
    const jp = [...container.querySelectorAll("label")]
      .find((l) => l.textContent === "Release Date JP")
      .parentElement.querySelector("input");
    expect(jp.type).toBe("text");
    await user.type(jp, "2019");
    expect(state().release_date_jp).toBe("2019");
  });

  it("Add shows the autofill and MAL boxes; Modify shows neither", () => {
    const add = renderTab("add");
    expect(screen.getByRole("textbox", { name: "Auto-fill from existing entry" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search MAL" })).toBeInTheDocument();
    add.unmount();
    renderTab("modify");
    expect(screen.queryByRole("textbox", { name: "Auto-fill from existing entry" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Search MAL" })).toBeNull();
  });

  it("Add passes no owner; Modify passes the entry id to the image and cast pickers", () => {
    const add = renderTab("add");
    expect(screen.getByTestId("image-picker").dataset.ownerId).toBe("");
    expect(screen.getByTestId("cast-editor").dataset.entryId).toBe("");
    add.unmount();
    renderTab("modify");
    expect(screen.getByTestId("image-picker").dataset.ownerId).toBe("am-7");
    expect(screen.getByTestId("cast-editor").dataset.entryId).toBe("am-7");
    expect(screen.getByTestId("notes").dataset.ownerId).toBe("am-7");
  });

  it.each(["add", "modify"])(
    "%s offers anime-movie directors, not anime ones",
    async (mode) => {
      const user = userEvent.setup();
      renderTab(mode);
      await user.click(screen.getByPlaceholderText("Select director..."));
      expect(await screen.findByRole("option", { name: "Movie Director" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: "Series Director" })).not.toBeInTheDocument();
    },
  );

  it.each(["add", "modify"])(
    "%s: offers only Anime Movie franchises and untyped ones",
    async (mode) => {
      const user = userEvent.setup();
      renderTab(mode);
      await user.click(screen.getByRole("combobox", { name: "Franchise" }));
      const list = await screen.findByRole("listbox");
      const offered = within(list).getAllByRole("option").map((o) => o.textContent);
      // Not `Anime`: an anime movie's franchise is its own type's.
      expect(offered.sort()).toEqual([
        "Anime Movie Franchise",
        "Mixed Franchise",
        "Untyped Franchise",
      ]);
    },
  );

  it("writes no series keys on a franchise pick", async () => {
    const user = userEvent.setup();
    // A marker the lineage pickers would overwrite if they wrote series keys.
    renderTab("add", { series_text: "untouched" });
    await user.click(screen.getByRole("combobox", { name: "Franchise" }));
    await user.click(await screen.findByRole("option", { name: "Anime Movie Franchise" }));
    const s = state();
    expect(s.franchise_id).toBe("f3");
    expect(s.series_text).toBe("untouched");
  });

  it("defaults a new entry to Not Released and Cinema", () => {
    renderTab("add");
    expect(screen.getByRole("combobox", { name: "Release Status" })).toHaveValue("Not Released");
    expect(screen.getByRole("combobox", { name: "Release Type" })).toHaveValue("Cinema");
    expect(screen.queryByRole("combobox", { name: "Airing Status" })).toBeNull();
  });

  it("offers Watch When Released, not Watch When Airs", () => {
    renderTab("add");
    const options = [
      ...screen.getByRole("combobox", { name: "Watching Status" }).querySelectorAll("option"),
    ].map((o) => o.value);
    expect(options).toContain("Watch When Released");
    expect(options).not.toContain("Watch When Airs");
  });

  it("a Cinema release shows the JP and TW dates", () => {
    const { container } = renderTab("modify");
    expect(labels(container)).toEqual(
      expect.arrayContaining(["Release Date JP", "Release Date TW"]),
    );
    expect(labels(container)).not.toContain("Release Date");
  });

  it.each(["add", "modify"])(
    "%s: an ONA shows one Release Date, and an edit writes both columns",
    async (mode) => {
      const user = userEvent.setup();
      const { container } = renderTab(mode, { release_type: "ONA" });
      expect(labels(container)).toContain("Release Date");
      expect(labels(container)).not.toContain("Release Date JP");
      expect(labels(container)).not.toContain("Release Date TW");
      const input = [...container.querySelectorAll("label")]
        .find((l) => l.textContent === "Release Date")
        .parentElement.querySelector("input");
      await user.type(input, "2025");
      expect(state()).toMatchObject({ release_date_jp: "2025", release_date_tw: "2025" });
    },
  );

  it("switching to ONA copies JP into TW", async () => {
    const user = userEvent.setup();
    renderTab("modify", { release_date_jp: "2024-07", release_date_tw: "2024-09" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Release Type" }), "ONA");
    expect(state()).toMatchObject({
      release_type: "ONA",
      release_date_jp: "2024-07",
      release_date_tw: "2024-07",
    });
  });

  it("switching to ONA with no JP date keeps the TW one in both", async () => {
    const user = userEvent.setup();
    renderTab("modify", { release_date_jp: "", release_date_tw: "2024-09" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Release Type" }), "ONA");
    expect(state()).toMatchObject({ release_date_jp: "2024-09", release_date_tw: "2024-09" });
  });
});
