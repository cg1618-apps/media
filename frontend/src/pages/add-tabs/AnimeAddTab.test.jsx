// Frontend: the anime form. Add and Modify render one AnimeFormBody, so this
// pins both: the canonical section order, CN-first names with "Romaji", the
// Add-only search boxes, the entry id Modify hands its pickers, and that a
// franchise change drops the series chosen under the old one.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AnimeAddTab from "./AnimeAddTab";
import AnimeModifyTab from "../modify-tabs/AnimeModifyTab";
import { defaultAnime } from "../../config/formFactories";

// The pickers stand in as their props, so the test reads which owner each one
// was given rather than driving uploads or cast searches.
vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />,
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: (props) => <div data-testid="cast-editor" data-entry-id={props.entryId ?? ""} />,
}));
vi.mock("../detail/AnimeNotes", () => ({
  default: (props) => <div data-testid="notes" data-owner-id={props.anime?.system_id} />,
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };
const FRANCHISES = [
  { system_id: "f1", franchise_name_en: "First Franchise", franchise_type: "ACG" },
  { system_id: "f2", franchise_name_en: "Second Franchise", franchise_type: "Movie" },
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
  "Cover & Remark",
];

function Harness({ mode, initial }) {
  const [form, setForm] = useState({ ...defaultAnime(), ...initial });
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <>
      <output data-testid="state">{JSON.stringify(form)}</output>
      {mode === "add" ? (
        <AnimeAddTab
          franchiseCollections={{}}
          af={form}
          ua={u}
          allAnime={[]}
          applyAnimeEntryAutofill={() => {}}
          applyMalPick={() => {}}
          allFranchises={FRANCHISES}
          franchiseItems={[]}
          seriesItemsForAnime={[{ id: "s1", label: "Old Series" }]}
          sources={SOURCES}
        />
      ) : (
        <AnimeModifyTab
          franchiseCollections={{}}
          af={form}
          ua={u}
          franchiseItems={[]}
          allFranchises={FRANCHISES}
          seriesItemsForAnime={[{ id: "s1", label: "Old Series" }]}
          sources={SOURCES}
          editingItem={{ system_id: "anime-9" }}
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

describe("Anime form", () => {
  it("Add renders the canonical sections in order", () => {
    const { container } = renderTab("add");
    expect(sections(container)).toEqual(SECTIONS);
  });

  it("Modify renders the same sections, then Structured Notes", () => {
    const { container } = renderTab("modify");
    expect(sections(container)).toEqual([...SECTIONS, "Structured Notes"]);
  });

  it("names start with CN and label the romanisation Romaji", () => {
    const { container } = renderTab("add");
    const names = labels(container).filter((l) => l.startsWith("Anime Name"));
    expect(names).toEqual([
      "Anime Name CN",
      "Anime Name EN",
      "Anime Name Romaji",
      "Anime Name JP",
      "Anime Name Alt",
    ]);
  });

  it("puts the totals beside their finished counts and the AniList ranks in Scores", () => {
    renderTab("modify");
    const row = (name) =>
      (screen.queryByRole("spinbutton", { name }) ??
        screen.queryByRole("textbox", { name }) ??
        screen.getByRole("combobox", { name })).closest(".grid");
    expect(row("EP Finished")).toBe(row("EP Total"));
    expect(row("EP Finished")).toBe(row("Paused at"));
    expect(row("Main / Spinoff")).toBe(row("Season"));
    expect(row("Season")).toBe(row("Part"));
    expect(row("AniList Rank")).toBe(row("AniList Popularity Rank"));
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
    expect(screen.getByTestId("image-picker").dataset.ownerId).toBe("anime-9");
    expect(screen.getByTestId("cast-editor").dataset.entryId).toBe("anime-9");
    expect(screen.getByTestId("notes").dataset.ownerId).toBe("anime-9");
  });

  it("writes no default on mount", () => {
    renderTab("modify", { genre_main: undefined, studio: undefined });
    const s = state();
    expect("genre_main" in s && s.genre_main !== undefined).toBe(false);
    expect("studio" in s && s.studio !== undefined).toBe(false);
  });

  it.each(["add", "modify"])("%s: changing the franchise clears the series", async (mode) => {
    const user = userEvent.setup();
    // A series is chosen while the franchise is still being typed, so picking
    // one is the only change made below.
    renderTab(mode, {
      franchise_id: null,
      franchise_text: "",
      series_id: "s1",
      series_text: "Old Series",
    });
    await user.click(screen.getByRole("combobox", { name: "Franchise" }));
    // Every franchise type is offered to anime.
    expect(await screen.findByRole("option", { name: "First Franchise" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Second Franchise" }));
    const s = state();
    expect(s.franchise_id).toBe("f2");
    expect(s.series_id).toBeNull();
    expect(s.series_text).toBe("");
  });
});
