// Frontend: the manga form. Add and Modify render one MangaFormBody, so this
// pins both: the canonical section order, CN-first names with "Romaji",
// the AniList ranks Modify could not edit before, the Add-only search boxes,
// the entry id Modify hands its pickers, the ACG/Manga franchise filter, and
// that a franchise change drops the series chosen under the old one.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import MangaAddTab from "./MangaAddTab";
import MangaModifyTab from "../modify-tabs/MangaModifyTab";
import { defaultManga } from "../../config/formFactories";

vi.mock("../../components/forms/ImagePicker", () => ({
  default: (props) => <div data-testid="image-picker" data-owner-id={props.ownerId ?? ""} />,
}));
vi.mock("../../components/forms/CastEditor", () => ({
  default: (props) => <div data-testid="cast-editor" data-entry-id={props.entryId ?? ""} />,
}));
vi.mock("../detail/MangaNotes", () => ({
  default: (props) => <div data-testid="notes" data-owner-id={props.manga?.system_id} />,
}));

const SOURCES = { options: [], studios: [], publishers: {}, people: {} };
const FRANCHISES = [
  { system_id: "f1", franchise_name_en: "ACG Franchise", franchise_type: "ACG" },
  { system_id: "f2", franchise_name_en: "Manga Franchise", franchise_type: "Manga" },
  { system_id: "f3", franchise_name_en: "Untyped Franchise", franchise_type: null },
  { system_id: "f4", franchise_name_en: "Film Franchise", franchise_type: "Movie" },
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
  const [form, setForm] = useState({ ...defaultManga(), ...initial });
  const u = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  return (
    <>
      <output data-testid="state">{JSON.stringify(form)}</output>
      {mode === "add" ? (
        <MangaAddTab
          franchiseCollections={{}}
          mgf={form}
          umg={u}
          allMangas={[]}
          applyMangaEntryAutofill={() => {}}
          applyMalPick={() => {}}
          allFranchises={FRANCHISES}
          seriesItemsForManga={[{ id: "s1", label: "Old Series" }]}
          sources={SOURCES}
        />
      ) : (
        <MangaModifyTab
          franchiseCollections={{}}
          cmgf={form}
          umg={u}
          allFranchises={FRANCHISES}
          seriesItemsForManga={[{ id: "s1", label: "Old Series" }]}
          editingItem={{ system_id: "manga-3" }}
          sources={SOURCES}
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

describe("Manga form", () => {
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
    const names = labels(container).filter((l) => l.startsWith("Manga Name"));
    expect(names).toEqual([
      "Manga Name CN",
      "Manga Name EN",
      "Manga Name Romaji",
      "Manga Name JP",
      "Manga Name Alt",
    ]);
  });

  it("Modify edits the AniList ranks, and the totals sit beside their finished counts", () => {
    renderTab("modify");
    const row = (name) =>
      (screen.queryByRole("spinbutton", { name }) ??
        screen.getByRole("combobox", { name })).closest(".grid");
    expect(screen.getByRole("spinbutton", { name: "AniList Rank" })).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "AniList Popularity Rank" }),
    ).toBeInTheDocument();
    expect(row("Ch Finished")).toBe(row("Ch Total"));
    expect(row("Vol Finished")).toBe(row("Vol Total"));
    expect(row("Vol Finished")).toBe(row("Vol Fin Page"));
    expect(row("Region")).toBe(row("Is Main"));
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
    expect(screen.getByTestId("image-picker").dataset.ownerId).toBe("manga-3");
    expect(screen.getByTestId("cast-editor").dataset.entryId).toBe("manga-3");
    expect(screen.getByTestId("notes").dataset.ownerId).toBe("manga-3");
  });

  it.each(["add", "modify"])(
    "%s: offers ACG, Manga and untyped franchises, and a pick clears the series",
    async (mode) => {
      const user = userEvent.setup();
      renderTab(mode, { series_id: "s1", series_text: "Old Series" });
      await user.click(screen.getByRole("combobox", { name: "Franchise" }));
      const offered = (await screen.findAllByRole("option")).map((o) => o.textContent);
      expect(offered).toEqual(
        expect.arrayContaining(["ACG Franchise", "Manga Franchise", "Untyped Franchise"]),
      );
      expect(offered).not.toContain("Film Franchise");
      await user.click(screen.getByRole("option", { name: "Manga Franchise" }));
      const s = state();
      expect(s.franchise_id).toBe("f2");
      expect(s.series_id).toBeNull();
      expect(s.series_text).toBe("");
    },
  );
});
