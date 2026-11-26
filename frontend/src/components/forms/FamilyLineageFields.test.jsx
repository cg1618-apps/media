// Frontend: the franchise and series pickers every entry form opens with.
//
// Which franchises are offered is the caller's rule - a franchise family for
// the gated types, an `accepts(franchise_type)` predicate for the rest - and
// changing the franchise always drops the series, which names its parent.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FamilyLineageFields from "./FamilyLineageFields";
import { RESTRICTED_FAMILY } from "../../lib/gatedTypes";
import { busiestFirst } from "../../hooks/useEntryLists";

const FRANCHISES = [
  { system_id: "fr-h", franchise_name_en: "Doujin Circle", franchise_type: "H-Comic, Hentai" },
  { system_id: "fr-acg", franchise_name_en: "Shonen Saga", franchise_type: "Anime" },
  { system_id: "fr-movie", franchise_name_en: "Heist Films", franchise_type: "Movie" },
  { system_id: "fr-none", franchise_name_en: "Untyped Thing", franchise_type: null },
];

// A typed (not picked) series, so both pickers render as inputs.
const BLANK = { franchise_id: null, franchise_text: "", series_id: null, series_text: "Arc" };

function renderFields(props = {}) {
  const u = vi.fn();
  render(
    <FamilyLineageFields
      f={BLANK}
      u={u}
      allFranchises={FRANCHISES}
      franchiseCollections={{}}
      {...props}
    />,
  );
  return u;
}

async function offeredFranchises() {
  await userEvent.click(screen.getByRole("combobox", { name: "Franchise" }));
  return screen.getAllByRole("option").map((o) => o.textContent);
}

describe("FamilyLineageFields", () => {
  it("offers only the franchises of `family`", async () => {
    renderFields({ family: RESTRICTED_FAMILY, seriesItems: [] });
    const offered = await offeredFranchises();
    expect(offered.join("|")).toContain("Doujin Circle");
    expect(offered.join("|")).not.toContain("Shonen Saga");
    expect(offered.join("|")).not.toContain("Untyped Thing");
  });

  it("offers the franchises an `accepts` predicate passes, and no others", async () => {
    // The mainstream rule: the type's own franchise type, or an untyped one.
    renderFields({
      accepts: (type) => type === "Movie" || !type,
      seriesItems: [],
    });
    const offered = (await offeredFranchises()).join("|");
    expect(offered).toContain("Heist Films");
    expect(offered).toContain("Untyped Thing");
    expect(offered).not.toContain("Shonen Saga");
    expect(offered).not.toContain("Doujin Circle");
  });

  // The series picker follows the franchise rule: a series names its parent,
  // so with no franchise picked it offers only series whose franchise the
  // picker would offer. The out-of-scope series is what makes this bite.
  const SERIES = [
    { id: "s-acg", label: "Shonen Arc", franchiseId: "fr-acg" },
    { id: "s-movie", label: "Heist Trilogy", franchiseId: "fr-movie" },
    { id: "s-none", label: "Loose Arc", franchiseId: "fr-none" },
    { id: "s-h", label: "Doujin Run", franchiseId: "fr-h" },
  ];
  const NO_SERIES_YET = { ...BLANK, series_text: "" };

  async function offeredSeries() {
    await userEvent.click(screen.getByRole("combobox", { name: "Series" }));
    return screen.getAllByRole("option").map((o) => o.textContent);
  }

  it("offers, with no franchise picked, only series under a franchise `accepts` passes", async () => {
    renderFields({
      f: NO_SERIES_YET,
      accepts: (type) => type === "Movie" || !type,
      seriesItems: SERIES,
    });
    expect((await offeredSeries()).sort()).toEqual(["Heist Trilogy", "Loose Arc"]);
  });

  it("offers, with no franchise picked, only series under a franchise of `family`", async () => {
    renderFields({ f: NO_SERIES_YET, family: RESTRICTED_FAMILY, seriesItems: SERIES });
    expect(await offeredSeries()).toEqual(["Doujin Run"]);
  });

  it("offers only the picked franchise's series once one is picked", async () => {
    renderFields({
      f: { ...NO_SERIES_YET, franchise_id: "fr-none" },
      accepts: () => true,
      seriesItems: SERIES,
    });
    expect(await offeredSeries()).toEqual(["Loose Arc"]);
  });

  it("still shows a franchise and series already chosen outside the rule", () => {
    // Modify opens an entry saved before the rule narrowed: its franchise and
    // series stay named rather than going blank.
    renderFields({
      f: { franchise_id: "fr-movie", franchise_text: "", series_id: "s-movie", series_text: "" },
      accepts: (type) => type === "Anime",
      seriesItems: SERIES,
    });
    expect(screen.getByText("Heist Films")).toBeInTheDocument();
    expect(screen.getByText("Heist Trilogy")).toBeInTheDocument();
  });

  it("puts franchise and series side by side in one row", () => {
    renderFields({ accepts: () => true, seriesItems: [] });
    const franchise = screen.getByRole("combobox", { name: "Franchise" });
    const series = screen.getByRole("combobox", { name: "Series" });
    const row = franchise.closest(".grid");
    expect(row).not.toBeNull();
    expect(row.className).toContain("md:grid-cols-2");
    expect(row.contains(series)).toBe(true);
  });

  it("clears the series when the franchise is retyped", async () => {
    const u = renderFields({ accepts: () => true, seriesItems: [] });
    await userEvent.type(screen.getByRole("combobox", { name: "Franchise" }), "N");
    expect(u).toHaveBeenCalledWith("franchise_id", null);
    expect(u).toHaveBeenCalledWith("series_id", null);
    expect(u).toHaveBeenCalledWith("series_text", "");
  });

  it("clears the series when a franchise is picked", async () => {
    const u = renderFields({ accepts: () => true, seriesItems: [] });
    await offeredFranchises();
    await userEvent.click(screen.getByRole("option", { name: /Heist Films/ }));
    expect(u).toHaveBeenCalledWith("franchise_id", "fr-movie");
    expect(u).toHaveBeenCalledWith("series_id", null);
    expect(u).toHaveBeenCalledWith("series_text", "");
  });

  it("renders no Series picker, and writes no series keys, when no series items are given", async () => {
    // Anime Movie has no series: its form state has no series keys to clear,
    // and writing them would add keys the payload never expected.
    const u = renderFields({ accepts: () => true });
    expect(screen.queryByRole("combobox", { name: "Series" })).toBeNull();
    expect(screen.queryByText("Series")).toBeNull();
    await userEvent.type(screen.getByRole("combobox", { name: "Franchise" }), "N");
    expect(u).toHaveBeenCalledWith("franchise_text", "N");
    const keys = u.mock.calls.map(([key]) => key);
    expect(keys).not.toContain("series_id");
    expect(keys).not.toContain("series_text");
  });

  it("keeps the new-franchise placeholder the Add tests search by", () => {
    renderFields({ accepts: () => true, seriesItems: [] });
    expect(screen.getByPlaceholderText("Search or type new franchise...")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search or type new series...")).toBeInTheDocument();
  });

  // The admin pages hold franchises busiest first (busiestFirst, as
  // useEntryLists does on load); the picker then ranks by match. Every name
  // here contains "saga", and the A-Z order the server sends is neither of
  // the two orders under test, so a pass is the ranking and not the input.
  it("offers the best name match first, then the franchise with more entries", async () => {
    const byName = [
      { system_id: "a", franchise_name_en: "Grand Saga", franchise_type: null, entry_count: 9 },
      { system_id: "b", franchise_name_en: "Saga", franchise_type: null, entry_count: 1 },
      { system_id: "c", franchise_name_en: "Saga Chronicles", franchise_type: null, entry_count: 2 },
      { system_id: "d", franchise_name_en: "Saga Legends", franchise_type: null, entry_count: 7 },
    ];
    renderFields({ allFranchises: busiestFirst(byName), seriesItems: [] });

    await userEvent.type(screen.getByRole("combobox", { name: "Franchise" }), "saga");

    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Saga", // exact
      "Saga Legends", // prefix, 7 entries
      "Saga Chronicles", // prefix, 2 entries
      "Grand Saga", // contains, though it has the most entries
    ]);
  });
});
