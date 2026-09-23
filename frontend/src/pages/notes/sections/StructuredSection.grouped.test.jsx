// Frontend: tests for the two registry features the structured shape gained
// for 亮點 Highlights - the `names` field type and the grouped read view.
//
// Neither is keyed on a section: HIGHLIGHTS below is the registry entry as
// GET /api/notes/sections serves it for a KR h-comic, and the component reads
// only its `group_by` and its field types.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import StructuredSection from "./StructuredSection";

const HIGHLIGHTS = {
  key: "h_comic_highlights",
  shape: "structured",
  label: "亮點 Highlights",
  require_any: [],
  hierarchical: false,
  group_by: "female_characters",
  owner_where: { region: ["KR"] },
  fields: [
    {
      key: "female_characters",
      label: "Female Characters",
      type: "names",
      column: null,
      required: true,
      options: [],
    },
    { key: "male_characters", label: "Male Characters", type: "names", column: null, options: [] },
    { key: "chapter", label: "Chapter", type: "text", column: "locator", options: [] },
    { key: "location", label: "Location", type: "text", column: null, options: [] },
    { key: "label", label: "Label", type: "text", column: "kind", options: [] },
    {
      key: "usefulness",
      label: "Usefulness",
      type: "select",
      column: "status",
      options: ["非常實用", "實用", "特定情況實用", "不實用"],
    },
    { key: "description", label: "Description", type: "textarea", column: "content", options: [] },
  ],
};

const note = (id, female, extra = {}) => ({
  system_id: id,
  section: "h_comic_highlights",
  locator: extra.locator ?? null,
  content: extra.content ?? null,
  kind: null,
  status: null,
  fields: { female_characters: female, ...(extra.fields || {}) },
});

function renderSection(props = {}) {
  const handlers = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    onGroupOrderChange: vi.fn(),
  };
  render(<StructuredSection section={HIGHLIGHTS} notes={[]} isAdmin {...handlers} {...props} />);
  return handlers;
}

const groupNames = () =>
  screen.getAllByTestId("group-header").map((h) => within(h).getByRole("heading").textContent);

describe("grouped read view", () => {
  it("draws one group per female character, a two-name row under both", () => {
    renderSection({
      notes: [
        note("r1", ["Ahri", "Bora"], { locator: "1-5" }),
        note("r2", ["Bora"], { locator: "8" }),
      ],
    });
    expect(groupNames()).toEqual(["Ahri", "Bora"]);
    const ahri = screen.getByRole("region", { name: "Ahri" });
    const bora = screen.getByRole("region", { name: "Bora" });
    expect(within(ahri).getByText("1-5")).toBeInTheDocument();
    expect(within(bora).getByText("1-5")).toBeInTheDocument();
    expect(within(bora).getByText("8")).toBeInTheDocument();
    expect(within(ahri).queryByText("8")).toBeNull();
  });

  it("orders groups by the stored order, then by first appearance", () => {
    renderSection({
      notes: [note("r1", ["Ahri"]), note("r2", ["Bora"]), note("r3", ["Chae"])],
      groupOrder: ["Chae", "Ahri"],
    });
    expect(groupNames()).toEqual(["Chae", "Ahri", "Bora"]);
  });

  it("names the other female character on a shared row, not the group's own", () => {
    renderSection({ notes: [note("r1", ["Ahri", "Bora"])] });
    const ahri = screen.getByRole("region", { name: "Ahri" });
    // Under Ahri the row names Bora, and not Ahri a second time.
    expect(within(ahri).getByText("Bora")).toBeInTheDocument();
    expect(within(ahri).getAllByText("Ahri")).toHaveLength(1);
  });

  it("offers no reorder handle on the rows inside a group", () => {
    renderSection({ notes: [note("r1", ["Ahri"]), note("r2", ["Ahri"]), note("r3", ["Bora"])] });
    // Only the two group headers carry arrows; the two Ahri rows do not.
    expect(screen.getAllByRole("button", { name: /move group/i })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /move entry/i })).toBeNull();
  });

  it("saves the whole new order when a group header is dropped on another", () => {
    const { onGroupOrderChange } = renderSection({
      notes: [note("r1", ["Ahri"]), note("r2", ["Bora"]), note("r3", ["Chae"])],
      groupOrder: ["Ahri", "Bora", "Chae"],
    });
    const headers = screen.getAllByTestId("group-header");
    fireEvent.dragStart(headers[2]);
    fireEvent.dragOver(headers[0]);
    fireEvent.drop(headers[0]);
    expect(onGroupOrderChange).toHaveBeenCalledWith(["Chae", "Ahri", "Bora"]);
    // Shown at once, before the page comes back with the saved order.
    expect(groupNames()).toEqual(["Chae", "Ahri", "Bora"]);
  });

  it("drops a stored name no row carries when it saves", async () => {
    const user = userEvent.setup();
    const { onGroupOrderChange } = renderSection({
      notes: [note("r1", ["Ahri"]), note("r2", ["Bora"])],
      groupOrder: ["Gone", "Ahri", "Bora"],
    });
    await user.click(screen.getByRole("button", { name: "Move group Bora up" }));
    expect(onGroupOrderChange).toHaveBeenCalledWith(["Bora", "Ahri"]);
  });

  it("lets a reader see the groups but not move them", () => {
    renderSection({ notes: [note("r1", ["Ahri"]), note("r2", ["Bora"])], isAdmin: false });
    expect(groupNames()).toEqual(["Ahri", "Bora"]);
    expect(screen.queryByRole("button", { name: /move group/i })).toBeNull();
    expect(screen.getAllByTestId("group-header")[0]).not.toHaveAttribute("draggable");
  });
});

describe("the names input", () => {
  it("suggests the cast, accepts free text, and saves a list under fields", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSection({ nameSuggestions: ["Ahri", "Bora", "Minho"] });
    await user.click(screen.getByRole("button", { name: "Add" }));

    const female = screen.getByRole("combobox", { name: "Female Characters" });
    await user.type(female, "bo");
    // The cast is filtered by what was typed.
    const list = screen.getByRole("listbox", { name: "Female Characters suggestions" });
    expect(within(list).getByText("Bora")).toBeInTheDocument();
    expect(within(list).queryByText("Minho")).toBeNull();
    await user.click(within(list).getByText("Bora"));

    // A name that matches nobody on the cast is still a name.
    await user.type(female, "Somebody New{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Chapter" }), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const payload = onCreate.mock.calls[0][0];
    expect(payload.fields.female_characters).toEqual(["Bora", "Somebody New"]);
    expect(payload.fields.male_characters).toBeUndefined();
    expect(payload.locator).toBe("3");
    expect(payload.female_characters).toBeUndefined();
  });

  it("will not save a row with no female character", async () => {
    const user = userEvent.setup();
    const { onCreate } = renderSection();
    await user.click(screen.getByRole("button", { name: "Add" }));
    await user.type(screen.getByRole("textbox", { name: "Chapter" }), "3");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("removes a chosen name", async () => {
    const user = userEvent.setup();
    const { onUpdate } = renderSection({ notes: [note("r1", ["Ahri", "Bora"])] });
    const ahri = screen.getByRole("region", { name: "Ahri" });
    await user.click(within(ahri).getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Remove Bora" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({
        fields: expect.objectContaining({ female_characters: ["Ahri"] }),
      })
    );
  });
});
