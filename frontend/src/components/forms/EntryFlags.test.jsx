// Frontend: the plan flags row that closes every entry form's My Tracker
// section - Watch Next, To Rewatch, Read Next, Play Next and the like.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EntryFlags from "./EntryFlags";

const FLAGS = [
  ["watch_next", "Watch Next", "Add to Watch Next list"],
  ["to_rewatch", "To Rewatch", "Mark for rewatch"],
];

describe("EntryFlags", () => {
  it("renders one labelled checkbox per flag, in the order given", () => {
    const { container } = render(<EntryFlags f={{}} u={vi.fn()} flags={FLAGS} />);
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label").textContent)).toEqual([
      "Add to Watch Next list",
      "Mark for rewatch",
    ]);
    expect(container.textContent).toContain("Watch Next");
    expect(container.textContent).toContain("To Rewatch");
  });

  it("reads each flag from the form, an unset one as unchecked", () => {
    render(<EntryFlags f={{ watch_next: true }} u={vi.fn()} flags={FLAGS} />);
    expect(screen.getByRole("checkbox", { name: "Add to Watch Next list" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Mark for rewatch" })).not.toBeChecked();
  });

  it("writes a boolean under the flag's key", async () => {
    const u = vi.fn();
    render(<EntryFlags f={{ watch_next: true }} u={u} flags={FLAGS} />);
    await userEvent.click(screen.getByRole("checkbox", { name: "Mark for rewatch" }));
    expect(u).toHaveBeenCalledWith("to_rewatch", true);
    await userEvent.click(screen.getByRole("checkbox", { name: "Add to Watch Next list" }));
    expect(u).toHaveBeenCalledWith("watch_next", false);
  });
});
