// Frontend: renaming a group from its header (GroupName, in sections/ui.jsx).
//
// What these pin: a named group's header carries "Rename group <name>" for a
// viewer with a row of the group to edit; clicking it turns the name into a
// "Group name" input holding it; Enter or leaving the input renames with the
// trimmed value, Escape puts the name back, and a blank or unchanged value
// sends nothing. The nameless group, a header with no row the viewer may
// edit, and Resources' "Other" carry no control; the group's drag handle
// stays. It works on every grouped view: a `groupable_by` section, a grouped
// tree, a `group_by` section and Resources' headings.
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import NameLinksSection from "./NameLinksSection";
import StructuredSection from "./StructuredSection";

const typeField = { key: "type", label: "Type", type: "select", column: "kind", options: [] };
const nameField = { key: "name", label: "Name", type: "text", column: "title", options: [] };

const SKILLS = {
  key: "skills",
  shape: "structured",
  label: "技能 Skills",
  require_any: [],
  hierarchical: false,
  group_by: null,
  groupable_by: "type",
  owner_where: {},
  fields: [typeField, nameField],
};

const GEOGRAPHY = {
  ...SKILLS,
  key: "geography",
  label: "地理 Geography",
  hierarchical: true,
  groupable_by: "group",
  fields: [{ ...typeField, key: "group", label: "Group" }, nameField],
};

const HIGHLIGHTS = {
  key: "h_game_highlights",
  shape: "structured",
  label: "亮點 Highlights",
  scope: "personal",
  require_any: [],
  hierarchical: false,
  group_by: "female_characters",
  groupable_by: null,
  owner_where: {},
  fields: [
    {
      key: "female_characters",
      label: "Female Characters",
      type: "names",
      column: null,
      options: [],
      required: true,
    },
  ],
};

const RESOURCES = {
  key: "resources",
  shape: "name_links",
  label: "Resources",
  kinds: [],
  statuses: [],
  kind_is_group: true,
};

const note = (id, title, kind, extra = {}) => ({
  system_id: id,
  section: "skills",
  title,
  kind,
  content: null,
  links: [],
  status: null,
  fields: {},
  ...extra,
});

const SKILL_ROWS = [
  note("s1", "Fireball", "Magic"),
  note("s2", "Parry", "Combat"),
  note("s3", "Heal", "Magic"),
  note("s4", "Mystery", null),
];

function renderStructured(section, notes, props = {}) {
  const onRenameGroup = vi.fn();
  render(
    <StructuredSection
      section={section}
      notes={notes}
      canWrite
      onCreate={vi.fn()}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onReorder={vi.fn()}
      onRenameGroup={onRenameGroup}
      {...props}
    />,
  );
  return onRenameGroup;
}

afterEach(() => {
  try {
    localStorage.clear();
  } catch {
    // storage unavailable - nothing to clear
  }
});

describe("a groupable_by section", () => {
  it("renames a group with the trimmed value on Enter", async () => {
    const onRenameGroup = renderStructured(SKILLS, SKILL_ROWS);
    await userEvent.click(screen.getByRole("button", { name: "Rename group Magic" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    expect(input).toHaveValue("Magic");
    await userEvent.clear(input);
    await userEvent.type(input, "  Spells  {Enter}");
    expect(onRenameGroup).toHaveBeenCalledTimes(1);
    expect(onRenameGroup).toHaveBeenCalledWith("skills", "Magic", "Spells");
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
  });

  it("renames on leaving the input", async () => {
    const onRenameGroup = renderStructured(SKILLS, SKILL_ROWS);
    await userEvent.click(screen.getByRole("button", { name: "Rename group Combat" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Melee");
    fireEvent.blur(input);
    expect(onRenameGroup).toHaveBeenCalledWith("skills", "Combat", "Melee");
  });

  it("Escape puts the name back; blank or unchanged sends nothing", async () => {
    const onRenameGroup = renderStructured(SKILLS, SKILL_ROWS);
    const open = () =>
      userEvent.click(screen.getByRole("button", { name: "Rename group Magic" }));

    await open();
    await userEvent.type(screen.getByRole("textbox", { name: "Group name" }), "x{Escape}");
    expect(screen.queryByRole("textbox", { name: "Group name" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Magic" })).toBeInTheDocument();

    await open();
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "   {Enter}");

    await open();
    await userEvent.type(screen.getByRole("textbox", { name: "Group name" }), "{Enter}");

    expect(onRenameGroup).not.toHaveBeenCalled();
  });

  it("offers no rename on the nameless group, and keeps the group's handle", () => {
    renderStructured(SKILLS, SKILL_ROWS);
    expect(
      screen.getAllByRole("button", { name: /^Rename group / }).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Rename group Magic", "Rename group Combat"]);
    expect(screen.getByLabelText("Reorder group Magic")).toBeInTheDocument();
  });

  it("offers a rename only on a group holding a row the viewer may edit", () => {
    // A mixed section seen by a member: only its own row is editable.
    const rows = [
      note("s1", "Fireball", "Magic"),
      note("s2", "Parry", "Combat", { personal: true }),
    ];
    renderStructured(SKILLS, rows, { canEditRow: (n) => Boolean(n.personal) });
    expect(screen.queryByRole("button", { name: "Rename group Magic" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename group Combat" })).toBeInTheDocument();
  });

  it("offers no rename to a reader", () => {
    renderStructured(SKILLS, SKILL_ROWS, { canWrite: false });
    expect(screen.queryAllByRole("button", { name: /^Rename group / })).toEqual([]);
  });
});

describe("a grouped tree", () => {
  it("renames a group of roots", async () => {
    const rows = [
      note("r1", "Limgrave", "North", { section: "geography" }),
      note("c1", "Cave", null, { section: "geography", parent_id: "r1" }),
      note("r2", "Caelid", "East", { section: "geography" }),
    ];
    const onRenameGroup = renderStructured(GEOGRAPHY, rows);
    await userEvent.click(screen.getByRole("button", { name: "Rename group North" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Lands Between{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("geography", "North", "Lands Between");
  });
});

describe("a group_by section", () => {
  it("renames one name's group", async () => {
    const rows = [
      note("h1", null, null, {
        section: "h_game_highlights",
        fields: { female_characters: ["Ana", "Bea"] },
      }),
    ];
    const onRenameGroup = renderStructured(HIGHLIGHTS, rows, {
      groupOrder: ["Bea", "Ana"],
      onGroupOrderChange: vi.fn(),
    });
    await userEvent.click(screen.getByRole("button", { name: "Rename group Ana" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Cia{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("h_game_highlights", "Ana", "Cia");
    expect(screen.getByLabelText("Reorder group Bea")).toBeInTheDocument();
  });
});

describe("Resources", () => {
  const rows = [
    { system_id: "a", title: "Wiki A", kind: "Wikis", links: [] },
    { system_id: "b", title: "Loose", kind: null, links: [] },
  ];

  it("renames a group heading, and offers nothing on Other", async () => {
    const onRenameGroup = vi.fn();
    render(
      <NameLinksSection
        section={RESOURCES}
        notes={rows}
        canWrite
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onReorder={vi.fn()}
        onRenameGroup={onRenameGroup}
      />,
    );
    expect(
      screen.getAllByRole("button", { name: /^Rename group / }).map((b) => b.getAttribute("aria-label")),
    ).toEqual(["Rename group Wikis"]);
    await userEvent.click(screen.getByRole("button", { name: "Rename group Wikis" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Wiki{Enter}");
    expect(onRenameGroup).toHaveBeenCalledWith("resources", "Wikis", "Wiki");
  });
});
