// Frontend: the "group by type" toggle a section gets from `groupable_by`.
//
// SKILLS is 技能 Skills as GET /api/notes/sections serves it for a game; the
// component reads only its `groupable_by` and its field specs.
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import StructuredSection from "./StructuredSection";

const SKILLS = {
  key: "skills",
  shape: "structured",
  label: "技能 Skills",
  require_any: [],
  hierarchical: false,
  group_by: null,
  groupable_by: "type",
  owner_where: {},
  fields: [
    { key: "type", label: "Type", type: "select", column: "kind", options: [] },
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    { key: "description", label: "Description", type: "textarea", column: "content", options: [] },
    { key: "links", label: "Links", type: "links", column: "links", options: [] },
  ],
};

const note = (id, title, kind) => ({
  system_id: id,
  section: "skills",
  title,
  kind,
  content: null,
  links: [],
  status: null,
  fields: {},
});

const NOTES = [
  note("s1", "Fireball", "Magic"),
  note("s2", "Parry", "Combat"),
  note("s3", "Heal", "Magic"),
  note("s4", "Mystery", null),
];

function renderSkills(section = SKILLS) {
  const onReorder = vi.fn();
  const view = render(
    <StructuredSection
      section={section}
      notes={NOTES}
      isAdmin
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onReorder={onReorder}
    />,
  );
  onReorder.unmount = view.unmount;
  return onReorder;
}

const headers = () =>
  screen.queryAllByTestId("group-header").map((h) => within(h).getByRole("heading").textContent);

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // storage unavailable - nothing to clear
  }
});

describe("groupable_by", () => {
  it("groups by type by default: first appearance, untyped last", () => {
    renderSkills();
    expect(headers()).toEqual(["Magic", "Combat", "No type"]);
    const magic = screen.getByRole("region", { name: "Magic" });
    expect(within(magic).getByText("Fireball")).toBeInTheDocument();
    expect(within(magic).getByText("Heal")).toBeInTheDocument();
    expect(within(magic).queryByText("Parry")).toBeNull();
    // The group header says the type, so the row does not repeat it as a tag.
    expect(within(magic).queryByText("Magic", { selector: "span" })).toBeNull();
  });

  it("moves a group, rewriting the rows' order so the group moves with them", () => {
    const onReorder = renderSkills();
    // The untyped trailing group has no handle of its own.
    expect(screen.queryByRole("button", { name: /Reorder group No type/i })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Reorder group Combat"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith("skills", ["s2", "s1", "s3", "s4"]);
  });

  it("moves a row within its group, and not out of it", () => {
    const onReorder = renderSkills();
    const magic = screen.getByRole("region", { name: "Magic" });
    // Heal is the last Magic row: down would leave the group, so nothing moves.
    fireEvent.keyDown(within(magic).getByLabelText("Reorder Heal"), { key: "ArrowDown" });
    expect(onReorder).not.toHaveBeenCalled();
    // Parry is alone in Combat, so it has no row handle to move.
    expect(screen.queryByLabelText("Reorder Parry")).toBeNull();
    fireEvent.keyDown(within(magic).getByLabelText("Reorder Fireball"), { key: "ArrowDown" });
    // Every reorder sends the grouped order, so a group's rows end up adjacent.
    expect(onReorder).toHaveBeenCalledWith("skills", ["s3", "s1", "s2", "s4"]);
  });

  it("toggles back to the flat list, and remembers the choice", async () => {
    const user = userEvent.setup();
    const first = renderSkills();
    const toggle = screen.getByRole("button", { name: "Group by type" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(headers()).toEqual([]);
    expect(screen.getByText("Parry")).toBeInTheDocument();
    // The flat list shows the type as a tag again.
    expect(screen.getAllByText("Magic")).toHaveLength(2);

    first.unmount();
    renderSkills();
    expect(headers()).toEqual([]);
  });

  it("offers no toggle to a section without groupable_by", () => {
    renderSkills({ ...SKILLS, groupable_by: null });
    expect(screen.queryByRole("button", { name: "Group by type" })).toBeNull();
    expect(headers()).toEqual([]);
  });
});
