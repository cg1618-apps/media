// Favourite 3x3 editor: rows in the ranked list trade places (a swap, not an
// insert), by dnd-kit drag or by the arrow keys on a focused row. Pointer
// drags cannot be simulated in jsdom, so the drop's arithmetic is pinned
// through swapSlots and the wiring through the keyboard path, which calls the
// same onSwap.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ToastProvider } from "../../hooks/useToast";
import Fav3x3ModifyTab, { swapSlots } from "./Fav3x3ModifyTab";

describe("swapSlots", () => {
  it("swaps two filled slots and leaves the rest alone", () => {
    expect(swapSlots({ 1: "a", 2: "b", 5: "e" }, 1, 2)).toEqual({
      1: "b",
      2: "a",
      5: "e",
    });
  });

  it("moves a row into an empty slot and empties its old one", () => {
    expect(swapSlots({ 1: "a", 5: "e" }, 1, 3)).toEqual({ 3: "a", 5: "e" });
  });

  it("dragging an empty slot onto a filled one pulls the row into it", () => {
    expect(swapSlots({ 2: "b" }, 7, 2)).toEqual({ 7: "b" });
  });

  it("is a no-op for the same slot or two empty slots", () => {
    const draft = { 1: "a" };
    expect(swapSlots(draft, 1, 1)).toBe(draft);
    expect(swapSlots(draft, 4, 6)).toEqual({ 1: "a" });
  });
});

const LISTS = {
  franchise: [
    { system_id: "f1", franchise_name_en: "Alpha", franchise_type: "Anime", type_slots: { ACG: 1 } },
    { system_id: "f2", franchise_name_en: "Beta", franchise_type: "Manga", type_slots: { ACG: 2 } },
  ],
  series: [],
};

function aniMangaGrid() {
  render(
    <ToastProvider>
      <Fav3x3ModifyTab lists={LISTS} setList={() => {}} />
    </ToastProvider>,
  );
  return within(
    screen.getByRole("heading", { name: /AniManga franchises$/ }).closest("section"),
  );
}

describe("Fav3x3ModifyTab keyboard swap", () => {
  it("ArrowDown swaps a row with the slot below and focus follows it", async () => {
    const user = userEvent.setup();
    const grid = aniMangaGrid();
    expect(grid.queryByRole("button", { name: /save grid/i })).toBeNull();

    grid.getByLabelText("Slot 1: Alpha").focus();
    await user.keyboard("{ArrowDown}");

    expect(grid.getByLabelText("Slot 1: Beta")).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 2: Alpha")).toHaveFocus();
    expect(grid.getByRole("button", { name: /save grid/i })).toBeInTheDocument();
  });

  it("swapping into an empty slot leaves the old one empty", async () => {
    const user = userEvent.setup();
    const grid = aniMangaGrid();

    grid.getByLabelText("Slot 2: Beta").focus();
    await user.keyboard("{ArrowDown}");

    expect(grid.getByLabelText("Slot 2: empty")).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 3: Beta")).toHaveFocus();
  });

  it("ArrowUp on slot 1 does nothing", async () => {
    const user = userEvent.setup();
    const grid = aniMangaGrid();

    grid.getByLabelText("Slot 1: Alpha").focus();
    await user.keyboard("{ArrowUp}");

    expect(grid.getByLabelText("Slot 1: Alpha")).toBeInTheDocument();
    expect(grid.queryByRole("button", { name: /save grid/i })).toBeNull();
  });
});

// Removing a row: the "×" on a filled card and on a filled ranked row both
// empty the slot in the draft, and Save writes the row back without that
// grid's key. Both rows hold an ACG slot, so the draft starts non-empty and a
// removal has something to drop.
describe("Fav3x3ModifyTab remove", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => ({
        ok: true,
        json: async () => ({
          ...LISTS.franchise.find((f) => url.endsWith(f.system_id)),
          ...JSON.parse(init.body),
        }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("each filled slot offers a remove button, empty slots do not", () => {
    const grid = aniMangaGrid();
    // One on the card, one on the ranked row, for each of the two rows.
    expect(grid.getAllByRole("button", { name: "Remove Alpha from slot 1" })).toHaveLength(2);
    expect(grid.getAllByRole("button", { name: "Remove Beta from slot 2" })).toHaveLength(2);
    expect(grid.queryByRole("button", { name: /from slot 3/ })).toBeNull();
  });

  it("the card's × empties the slot without opening the picker", async () => {
    const user = userEvent.setup();
    const grid = aniMangaGrid();

    await user.click(grid.getAllByRole("button", { name: "Remove Alpha from slot 1" })[0]);

    expect(grid.getByLabelText("Slot 1: empty")).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 2: Beta")).toBeInTheDocument();
    expect(screen.queryByText(/Assign to Slot/)).toBeNull();
  });

  it("Save after removing from the ranked row PATCHes the row without the grid's key", async () => {
    const user = userEvent.setup();
    const grid = aniMangaGrid();

    const row = grid.getByLabelText("Slot 2: Beta");
    await user.click(within(row).getByRole("button", { name: "Remove Beta from slot 2" }));
    expect(grid.getByLabelText("Slot 2: empty")).toBeInTheDocument();

    await user.click(grid.getByRole("button", { name: /save grid/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/f2$/);
    expect(init.method).toBe("PATCH");
    // Beta held only the ACG key, so the whole map is cleared.
    expect(JSON.parse(init.body)).toEqual({ type_slots: null });
  });
});

// The favourite-entity grids hold studios and people. They are not media, so
// their save goes to the entity's own endpoint, and a grid offers only the
// rows its filter allows - the fixture holds a game studio to make that bite.
describe("Fav3x3ModifyTab entity grids", () => {
  const ENTITY_LISTS = {
    ...LISTS,
    studio: [
      { system_id: "s1", name_en: "Kyoto", display_name: "Kyoto", media_types: ["anime"], type_slots: { "Anime Studio": 1 } },
      { system_id: "s2", name_en: "FromSoft", display_name: "FromSoft", media_types: ["game"], type_slots: null },
    ],
    person: [],
  };

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => ({
        ok: true,
        json: async () => ({ ...ENTITY_LISTS.studio[0], ...JSON.parse(init.body) }),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function studioGrid() {
    render(
      <ToastProvider>
        <Fav3x3ModifyTab lists={ENTITY_LISTS} setList={() => {}} />
      </ToastProvider>,
    );
    return within(screen.getByRole("heading", { name: "Anime studios" }).closest("section"));
  }

  it("sits under its own heading and holds only the studios its filter allows", async () => {
    const user = userEvent.setup();
    const grid = studioGrid();
    expect(screen.getByRole("heading", { name: "Favourite Entity" })).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 1: Kyoto")).toBeInTheDocument();

    await user.click(grid.getAllByRole("button", { name: /Slot 2|2\s*Empty/ })[0]);
    const picker = within(screen.getByText(/Assign to Slot 2/).closest("div.bg-surface"));
    expect(picker.getByText("Kyoto")).toBeInTheDocument();
    expect(picker.queryByText("FromSoft")).toBeNull();
  });

  it("saves a removal to the studio endpoint", async () => {
    const user = userEvent.setup();
    const grid = studioGrid();

    await user.click(grid.getAllByRole("button", { name: "Remove Kyoto from slot 1" })[0]);
    await user.click(grid.getByRole("button", { name: /save grid/i }));

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/studio/s1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ type_slots: null });
  });
});
