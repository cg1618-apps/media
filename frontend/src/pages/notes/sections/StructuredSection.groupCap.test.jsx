// Frontend: a grouped section folds to its first three GROUPS, as a section
// folds to its first three rows. The rest wait behind "Show all groups (N)".
//
// Pinned on both grouped renderers: GroupedRows (a flat `groupable_by`
// section - the same component draws a `group_by` one) and the grouped tree
// (a hierarchical one). Each fixture has five groups, so the fold has two to
// hide; a section of three groups or fewer has no toggle (the mirror).
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import StructuredSection from "./StructuredSection";

const fields = (groupKey) => [
  { key: groupKey, label: groupKey === "type" ? "Type" : "Group", type: "select", column: "kind", options: [] },
  { key: "name", label: "Name", type: "text", column: "title", options: [] },
];

const ITEMS = {
  key: "items",
  shape: "structured",
  label: "道具 Items",
  require_any: [],
  hierarchical: false,
  group_by: null,
  groupable_by: "type",
  owner_where: {},
  fields: fields("type"),
};

const GEOGRAPHY = {
  ...ITEMS,
  key: "geography",
  label: "地理 Geography",
  hierarchical: true,
  groupable_by: "group",
  always_grouped: true,
  require_any: [["name"]],
  fields: fields("group"),
};

const row = (section, id, title, kind) => ({
  system_id: id,
  section,
  title,
  kind,
  content: null,
  links: [],
  status: null,
  fields: {},
  parent_id: null,
});

// Five groups in first-appearance order, the nameless one last.
const rowsOf = (section) => [
  row(section, "r1", "Potion", "Heal"),
  row(section, "r2", "Bomb", "Throw"),
  row(section, "r3", "Key", "Quest"),
  row(section, "r4", "Ore", "Craft"),
  row(section, "r5", "Pebble", null),
];

const headers = () =>
  screen.queryAllByTestId("group-header").map((h) => within(h).getByRole("heading").textContent);

const renderSection = (section, notes = rowsOf(section.key)) => {
  const onReorder = vi.fn();
  render(
    <StructuredSection
      section={section}
      notes={notes}
      canWrite
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onReorder={onReorder}
    />,
  );
  return onReorder;
};

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // storage unavailable - nothing to clear
  }
});

describe.each([
  ["a flat groupable section", ITEMS, "No type"],
  ["a grouped tree", GEOGRAPHY, "No group"],
])("%s", (_name, section, noName) => {
  it("shows the first three groups, and the rest behind Show all groups", async () => {
    renderSection(section);
    expect(headers()).toEqual(["Heal", "Throw", "Quest"]);
    expect(screen.queryByText("Ore")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Show all groups (5)" }));
    expect(headers()).toEqual(["Heal", "Throw", "Quest", "Craft", noName]);
    await userEvent.click(screen.getByRole("button", { name: "Show fewer groups" }));
    expect(headers()).toEqual(["Heal", "Throw", "Quest"]);
  });

  it("has no group toggle with three groups or fewer (the mirror)", () => {
    renderSection(section, rowsOf(section.key).slice(0, 3));
    expect(headers()).toEqual(["Heal", "Throw", "Quest"]);
    expect(screen.queryByRole("button", { name: /groups/ })).toBeNull();
  });

  it("unfolds when the last group shown is moved down past the fold", () => {
    const onReorder = renderSection(section);
    fireEvent.keyDown(screen.getByLabelText("Reorder group Quest"), { key: "ArrowDown" });
    expect(onReorder).toHaveBeenCalledWith(section.key, ["r1", "r2", "r4", "r3", "r5"]);
    expect(headers()).toContain("Craft");
  });

  it("keeps the group being edited on screen when the groups fold", async () => {
    renderSection(section);
    await userEvent.click(screen.getByRole("button", { name: "Show all groups (5)" }));
    const ore = screen.getByText("Ore").closest("div.flex.gap-2.items-start");
    await userEvent.click(within(ore).getByRole("button", { name: "Edit" }));
    await userEvent.click(screen.getByRole("button", { name: "Show fewer groups" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Ore");
  });
});
