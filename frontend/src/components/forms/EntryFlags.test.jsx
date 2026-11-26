// Frontend: the mark checkboxes at the top of every entry form - Pin to
// dashboard, Plan Next, Redo - read from config/entryFlags.js.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EntryFlags from "./EntryFlags";
import { ENTRY_FLAGS, entryFlagsFor } from "../../config/entryFlags";

const names = () =>
  screen.getAllByRole("checkbox").map((c) => c.closest("label").textContent);

describe("EntryFlags", () => {
  it("draws one checkbox per flag of the type, each with a single label", () => {
    const { container } = render(<EntryFlags type="movie" f={{}} u={vi.fn()} />);
    expect(names()).toEqual(["Pin to dashboard", "Plan Next", "Redo"]);
    // No label above the box and no caption beside it.
    expect(container.textContent).toBe("Pin to dashboardPlan NextRedo");
  });

  it("keys the boxes by the type's own columns", async () => {
    const u = vi.fn();
    render(<EntryFlags type="game" f={{ play_next: true }} u={u} />);
    expect(screen.getByRole("checkbox", { name: "Plan Next" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Redo" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("checkbox", { name: "Redo" }));
    expect(u).toHaveBeenCalledWith("to_replay", true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Plan Next" }));
    expect(u).toHaveBeenCalledWith("play_next", false);
  });

  it("offers no pin on a gated type and no Redo on a cartoon", () => {
    const { unmount } = render(<EntryFlags type="hentai" f={{}} u={vi.fn()} />);
    expect(names()).toEqual(["Plan Next", "Redo"]);
    unmount();
    render(<EntryFlags type="cartoon" f={{}} u={vi.fn()} />);
    expect(names()).toEqual(["Pin to dashboard", "Plan Next"]);
  });

  it("draws nothing for a tab without flags", () => {
    const { container } = render(<EntryFlags type="franchise" f={{}} u={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ENTRY_FLAGS", () => {
  it("covers the twelve media types with their plan columns", () => {
    expect(Object.keys(ENTRY_FLAGS)).toHaveLength(12);
    expect(entryFlagsFor("book")).toEqual([
      ["is_pinged", "Pin to dashboard"],
      ["read_next", "Plan Next"],
      ["to_reread", "Redo"],
    ]);
    expect(entryFlagsFor("h-game")).toEqual([
      ["play_next", "Plan Next"],
      ["to_replay", "Redo"],
    ]);
    expect(entryFlagsFor("collection")).toEqual([]);
  });
});
