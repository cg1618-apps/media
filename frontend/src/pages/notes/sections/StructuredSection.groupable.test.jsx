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
      canWrite
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

  it("names the toggle after the field it groups by", () => {
    // 敵人 Enemies groups by its Tier, 角色 Characters by its Group.
    const tiered = {
      ...SKILLS,
      groupable_by: "tier",
      fields: SKILLS.fields.map((f) => (f.key === "type" ? { ...f, key: "tier", label: "Tier" } : f)),
    };
    renderSkills(tiered);
    expect(screen.getByRole("button", { name: "Group by tier" })).toHaveAttribute("aria-pressed", "true");
    expect(headers()).toEqual(["Magic", "Combat", expect.any(String)]);
  });

  it("offers no toggle to a section without groupable_by", () => {
    renderSkills({ ...SKILLS, groupable_by: null });
    expect(screen.queryByRole("button", { name: "Group by type" })).toBeNull();
    expect(headers()).toEqual([]);
  });
});

// 地理 Geography: hierarchical AND groupable_by. The roots are grouped by their
// Group; a child carries no group of its own (the backend refuses one) and is
// drawn under its root.
const GEOGRAPHY = {
  key: "geography",
  shape: "structured",
  label: "地理 Geography",
  require_any: [["name"]],
  hierarchical: true,
  group_by: null,
  groupable_by: "group",
  owner_where: {},
  fields: [
    {
      key: "group",
      label: "Group",
      type: "select",
      column: "kind",
      options: [],
      option_category: "Geography Group",
    },
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    { key: "description", label: "Description", type: "textarea", column: "content", options: [] },
    { key: "links", label: "Links", type: "links", column: "links", options: [] },
  ],
};

const place = (id, title, kind, parent_id = null) => ({
  ...note(id, title, kind),
  section: "geography",
  parent_id,
});

// In sort_index order. Stormveil carries a stray group (a hand-edited row):
// a child's group is never drawn, grouped or not.
const PLACES = [
  place("a1", "Limgrave", "Lands Between"),
  place("a2", "Stormveil", "Stray", "a1"),
  place("a3", "Caelid", "Lands Between"),
  place("a4", "Nokron", "Underground"),
  place("a5", "Loose", null),
  place("a6", "Gatefront", null, "a1"),
];

function renderGeography(props = {}) {
  const handlers = {
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
  };
  render(
    <StructuredSection
      section={GEOGRAPHY}
      notes={PLACES}
      canWrite
      optionValues={{ "Geography Group": ["Lands Between", "Underground"] }}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

const rowOf = (text) => screen.getByText(text).closest("div.flex.gap-2.items-start");

describe("groupable_by on a hierarchical section", () => {
  it("groups the roots, first appearance first, ungrouped last, children under their root", () => {
    renderGeography();
    expect(headers()).toEqual(["Lands Between", "Underground", "No group"]);
    const lands = screen.getByRole("region", { name: "Lands Between" });
    expect(within(lands).getByText("Limgrave")).toBeInTheDocument();
    expect(within(lands).getByText("Caelid")).toBeInTheDocument();
    // The children follow their root into its group, whatever they carry.
    expect(within(lands).getByText("Stormveil")).toBeInTheDocument();
    expect(within(lands).getByText("Gatefront")).toBeInTheDocument();
    const limgrave = screen.getByText("Limgrave").closest("div.pt-2");
    expect(within(limgrave).getByText("Stormveil")).toBeInTheDocument();
    // Neither the header's group nor a child's stray one is repeated as a tag.
    expect(screen.queryByText("Stray")).toBeNull();
    expect(within(lands).queryByText("Lands Between", { selector: "span" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "No group" })).getByText("Loose")).toBeInTheDocument();
  });

  it("moves a root among its group's roots, sending the whole tree depth-first", () => {
    const { onReorder } = renderGeography();
    const lands = screen.getByRole("region", { name: "Lands Between" });
    // Caelid is the last root of its group: down would leave it.
    fireEvent.keyDown(within(lands).getByLabelText("Reorder Caelid"), { key: "ArrowDown" });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.keyDown(within(lands).getByLabelText("Reorder Caelid"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith("geography", ["a3", "a1", "a2", "a6", "a4", "a5"]);
  });

  it("moves a child among its siblings only", () => {
    const { onReorder } = renderGeography();
    fireEvent.keyDown(screen.getByLabelText("Reorder Gatefront"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith("geography", ["a1", "a6", "a2", "a3", "a4", "a5"]);
  });

  it("moves a group with its roots' subtrees", () => {
    const { onReorder } = renderGeography();
    fireEvent.keyDown(screen.getByLabelText("Reorder group Underground"), { key: "ArrowUp" });
    expect(onReorder).toHaveBeenCalledWith("geography", ["a4", "a1", "a2", "a6", "a3", "a5"]);
  });

  it("toggles to the plain tree, where a root shows its group and a child still does not", async () => {
    renderGeography();
    await userEvent.click(screen.getByRole("button", { name: "Group by group" }));
    expect(headers()).toEqual([]);
    expect(screen.getAllByText("Lands Between")).toHaveLength(2);
    expect(screen.getByText("Underground")).toBeInTheDocument();
    expect(screen.queryByText("Stray")).toBeNull();
  });

  it("asks for a group on a new root, with the category's suggestions", async () => {
    renderGeography();
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(screen.getByLabelText("Group")).toHaveAttribute("role", "combobox");
  });

  it("asks no group of a new child, and sends none", async () => {
    const { onCreate } = renderGeography();
    await userEvent.click(screen.getByRole("button", { name: "Add entry under Limgrave" }));
    expect(screen.queryByLabelText("Group")).toBeNull();
    await userEvent.type(screen.getByLabelText("Name"), "Church of Elleh");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    const payload = onCreate.mock.calls[0][0];
    expect(payload).toMatchObject({ section: "geography", title: "Church of Elleh", parent_id: "a1" });
    expect(payload.kind ?? null).toBeNull();
  });

  it("asks no group when editing a child, and clears a stray one", async () => {
    const { onUpdate } = renderGeography();
    await userEvent.click(within(rowOf("Stormveil")).getByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText("Group")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenCalledWith("a2", expect.objectContaining({ title: "Stormveil", kind: null }));
  });

  it("still asks for the group when editing a root", async () => {
    const { onUpdate } = renderGeography();
    await userEvent.click(within(rowOf("Limgrave")).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Group")).toHaveValue("Lands Between");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onUpdate).toHaveBeenCalledWith("a1", expect.objectContaining({ kind: "Lands Between" }));
  });
});
