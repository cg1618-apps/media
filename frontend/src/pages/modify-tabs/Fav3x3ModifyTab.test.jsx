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
    { system_id: "f1", franchise_name_en: "Alpha", franchise_type: "ACG", type_slots: { ACG: 1 } },
    { system_id: "f2", franchise_name_en: "Beta", franchise_type: "ACG", type_slots: { ACG: 2 } },
  ],
  series: [],
};

function acgGrid() {
  render(
    <ToastProvider>
      <Fav3x3ModifyTab lists={LISTS} setList={() => {}} />
    </ToastProvider>,
  );
  return within(
    screen.getByRole("heading", { name: "Favourite ACG franchises" }).closest("section"),
  );
}

describe("Fav3x3ModifyTab keyboard swap", () => {
  it("ArrowDown swaps a row with the slot below and focus follows it", async () => {
    const user = userEvent.setup();
    const grid = acgGrid();
    expect(grid.queryByRole("button", { name: /save grid/i })).toBeNull();

    grid.getByLabelText("Slot 1: Alpha").focus();
    await user.keyboard("{ArrowDown}");

    expect(grid.getByLabelText("Slot 1: Beta")).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 2: Alpha")).toHaveFocus();
    expect(grid.getByRole("button", { name: /save grid/i })).toBeInTheDocument();
  });

  it("swapping into an empty slot leaves the old one empty", async () => {
    const user = userEvent.setup();
    const grid = acgGrid();

    grid.getByLabelText("Slot 2: Beta").focus();
    await user.keyboard("{ArrowDown}");

    expect(grid.getByLabelText("Slot 2: empty")).toBeInTheDocument();
    expect(grid.getByLabelText("Slot 3: Beta")).toHaveFocus();
  });

  it("ArrowUp on slot 1 does nothing", async () => {
    const user = userEvent.setup();
    const grid = acgGrid();

    grid.getByLabelText("Slot 1: Alpha").focus();
    await user.keyboard("{ArrowUp}");

    expect(grid.getByLabelText("Slot 1: Alpha")).toBeInTheDocument();
    expect(grid.queryByRole("button", { name: /save grid/i })).toBeNull();
  });
});
