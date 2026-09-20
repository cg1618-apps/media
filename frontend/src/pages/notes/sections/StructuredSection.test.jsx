// Frontend: tests for the `structured` shape - the one whose fields come from
// the registry rather than from the component.
//
// What these pin is the contract with the backend spec: where a field's value
// goes in the payload (its column, or the `fields` blob), that a section with
// no blob-backed field sends `fields: null` rather than an empty object, and
// that the reorder and quick-edit affordances call the right handler with the
// right shape of argument.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StructuredSection from "./StructuredSection";

// Mirrors `controls`: every field claims a column, so nothing reaches `fields`.
const CONTROLS = {
  key: "controls",
  shape: "structured",
  label: "操作 Controls",
  require_any: [],
  hierarchical: false,
  fields: [
    { key: "control", label: "Control", type: "text", column: "title", options: [] },
    {
      key: "description",
      label: "Description",
      type: "textarea",
      column: "content",
      options: [],
    },
    { key: "links", label: "Links", type: "links", column: "links", options: [] },
  ],
};

// A section exercising the other half: a blob-backed scalar, a closed select,
// a quick-edit value and a nested list.
const ENEMIES = {
  key: "enemies",
  shape: "structured",
  label: "敵人 Enemies",
  require_any: [],
  hierarchical: false,
  fields: [
    { key: "tier", label: "Tier", type: "select", column: "kind", options: [] },
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    { key: "region", label: "Region", type: "text", column: null, options: [] },
    {
      key: "beaten",
      label: "Status",
      type: "select",
      column: "status",
      options: ["to beat", "beaten"],
    },
    {
      key: "tries",
      label: "Tries",
      type: "text",
      column: null,
      options: [],
      quick_edit: true,
    },
    {
      key: "drops",
      label: "Drops",
      type: "list",
      column: null,
      options: [],
      item_fields: [
        { key: "item", label: "Item", type: "text", column: null, options: [] },
        { key: "rate", label: "Rate", type: "text", column: null, options: [] },
      ],
    },
  ],
};

const renderSection = (props = {}) =>
  render(
    <StructuredSection
      section={CONTROLS}
      notes={[]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      {...props}
    />,
  );

it("renders a row from the field spec, column-backed and blob-backed alike", () => {
  renderSection({
    section: ENEMIES,
    notes: [
      {
        system_id: "n1",
        kind: "Boss",
        title: "Malenia",
        status: "to beat",
        fields: {
          region: "Haligtree",
          tries: "47",
          drops: [{ item: "Great Rune", rate: "100%" }],
        },
      },
    ],
  });

  expect(screen.getByText("Malenia")).toBeInTheDocument();
  expect(screen.getByText("Boss")).toBeInTheDocument();
  expect(screen.getByText("Haligtree")).toBeInTheDocument();
  expect(screen.getByText("to beat")).toBeInTheDocument();
  // The nested list renders as a table headed by its item field labels.
  expect(screen.getByRole("columnheader", { name: "Item" })).toBeInTheDocument();
  expect(screen.getByText("Great Rune")).toBeInTheDocument();
  expect(screen.getByText("100%")).toBeInTheDocument();
});

it("sends a column-backed field at the top level and nothing in fields", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(screen.getByLabelText("Control"), "L2 + O");
  await userEvent.type(screen.getByLabelText("Description"), "Parry.");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith({
    section: "controls",
    title: "L2 + O",
    content: "Parry.",
    links: null,
    // Null rather than {}: a section whose every field claims a column stores
    // no blob at all, and an empty object would read back as one.
    fields: null,
  });
});

it("sends a blob-backed field inside fields", async () => {
  const onCreate = vi.fn();
  renderSection({ section: ENEMIES, onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.type(screen.getByLabelText("Name"), "Radahn");
  await userEvent.type(screen.getByLabelText("Region"), "Caelid");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      section: "enemies",
      title: "Radahn",
      fields: { region: "Caelid" },
    }),
  );
});

it("offers a closed select's options and no others", async () => {
  renderSection({ section: ENEMIES });
  await userEvent.click(screen.getByRole("button", { name: /add$/i }));

  const status = screen.getByLabelText("Status");
  expect(
    within(status)
      .getAllByRole("option")
      .map((o) => o.value),
  ).toEqual(["", "to beat", "beaten"]);
  // A select with no options is free text - the open vocabularies (tier,
  // group, type) are typed in, not chosen.
  expect(screen.getByLabelText("Tier").tagName).toBe("INPUT");
});

it("refuses to save a row where every field is blank", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).not.toHaveBeenCalled();
});

it("refuses to save unless one of a require_any group is filled", async () => {
  const onCreate = vi.fn();
  const section = {
    ...CONTROLS,
    require_any: [["control", "description"]],
    fields: [
      ...CONTROLS.fields.filter((f) => f.key !== "links"),
      { key: "links", label: "Links", type: "links", column: "links", options: [] },
    ],
  };
  renderSection({ section, onCreate });

  await userEvent.click(screen.getByRole("button", { name: /add$/i }));
  // A link alone makes the row non-empty, so only require_any can refuse it -
  // which is what makes this a test of require_any rather than of emptiness.
  await userEvent.type(screen.getByPlaceholderText("https://..."), "https://x.com");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText("Control"), "L2");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalled();
});

it("reorders by sending the section's ids in their new order", async () => {
  const onReorder = vi.fn();
  renderSection({
    notes: [
      { system_id: "a", title: "first" },
      { system_id: "b", title: "second" },
    ],
    onReorder,
  });

  await userEvent.click(screen.getAllByRole("button", { name: /move entry down/i })[0]);
  expect(onReorder).toHaveBeenCalledWith("controls", ["b", "a"]);
});

it("shows no move buttons on a single row", () => {
  renderSection({ notes: [{ system_id: "a", title: "only" }] });
  expect(screen.queryByRole("button", { name: /move entry/i })).toBeNull();
});

it("quick-edits one field without opening the row, merging the blob", async () => {
  const onUpdate = vi.fn();
  renderSection({
    section: ENEMIES,
    notes: [
      {
        system_id: "n1",
        title: "Malenia",
        fields: { region: "Haligtree", tries: "47" },
      },
    ],
    onUpdate,
  });

  const input = screen.getByLabelText("Tries");
  await userEvent.clear(input);
  await userEvent.type(input, "48");
  await userEvent.tab();

  // The whole blob, not just the edited key: a PATCH replaces `fields`
  // wholesale, so sending one key alone would drop the region.
  expect(onUpdate).toHaveBeenCalledWith("n1", {
    fields: { region: "Haligtree", tries: "48" },
  });
});

it("shows a quick-edit value as a read-only tag for a guest", () => {
  renderSection({
    section: ENEMIES,
    isAdmin: false,
    notes: [{ system_id: "n1", title: "Malenia", fields: { tries: "47" } }],
  });

  expect(screen.queryByLabelText("Tries")).toBeNull();
  expect(screen.getByText(/Tries\s*47/)).toBeInTheDocument();
});

it("heads a row with its title column, not with the first filled text field", () => {
  // `enemies` asks for the region before the name, because that is the order
  // the form reads best in. The heading must not follow that order.
  render(
    <StructuredSection
      section={ENEMIES}
      notes={[
        {
          system_id: "n1",
          title: "Malenia",
          fields: { region: "Haligtree" },
        },
      ]}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
    />,
  );

  // The heading is the name; the region is a tag beside it.
  expect(screen.getByText("Malenia").className).toContain("font-medium");
  expect(screen.getByText("Haligtree").className).not.toContain("font-medium");
});

// --- Hierarchical sections -------------------------------------------------

// Mirrors a 劇情列表 Story List strand: an order number or a name, nesting to
// any depth.
const STORY_LIST = {
  key: "story_list_main",
  shape: "structured",
  label: "主線 Main",
  require_any: [["order", "name"]],
  hierarchical: true,
  fields: [
    { key: "order", label: "No.", type: "text", column: "locator", options: [] },
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    {
      key: "description",
      label: "Description",
      type: "textarea",
      column: "content",
      options: [],
    },
    { key: "links", label: "Links", type: "links", column: "links", options: [] },
  ],
};

// A chapter, a scene inside it, and a beat inside that: three levels, which
// is the shape the group is actually for.
const TREE = [
  { system_id: "c1", locator: "1", title: "Limgrave", parent_id: null },
  { system_id: "s1", locator: "1.1", title: "The Gate", parent_id: "c1" },
  { system_id: "b1", locator: "1.1.1", title: "Tree Sentinel", parent_id: "s1" },
  { system_id: "c2", locator: "2", title: "Liurnia", parent_id: null },
];

const renderTree = (props = {}) =>
  render(
    <StructuredSection
      section={STORY_LIST}
      notes={TREE}
      isAdmin
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      {...props}
    />,
  );

it("nests rows under their parent to any depth", () => {
  renderTree();

  const gate = screen.getByText("The Gate").closest("div.pt-2");
  // The grandchild renders INSIDE the child, not beside it.
  expect(within(gate).getByText("Tree Sentinel")).toBeInTheDocument();
  // ...and the second root does not.
  expect(within(gate).queryByText("Liurnia")).toBeNull();
});

it("reorders within one set of siblings, sending only those ids", () => {
  const onReorder = vi.fn();
  renderTree({ onReorder });

  // Only the two roots have a sibling to swap with; an only child gets no
  // buttons at all. So there are two, one per root, and the last one is
  // disabled rather than absent.
  const moves = screen.getAllByRole("button", { name: /move entry down/i });
  expect(moves).toHaveLength(2);
  expect(moves[1]).toBeDisabled();

  moves[0].click();
  // The whole section, flattened depth-first with the swap applied - the
  // endpoint refuses a payload that does not name every note of the section,
  // and a depth-first order leaves sort_index ascending as the page draws.
  expect(onReorder).toHaveBeenCalledWith("story_list_main", [
    "c2",
    "c1",
    "s1",
    "b1",
  ]);
});

it("adds a child under the row whose button was pressed", async () => {
  const onCreate = vi.fn();
  renderTree({ onCreate });

  await userEvent.click(
    screen.getByRole("button", { name: "Add entry under The Gate" }),
  );
  await userEvent.type(screen.getByLabelText("Name"), "Second beat");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      section: "story_list_main",
      title: "Second beat",
      parent_id: "s1",
    }),
  );
});

it("adds a root with no parent_id when the card's own Add is used", async () => {
  const onCreate = vi.fn();
  renderTree({ onCreate });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.type(screen.getByLabelText("No."), "3");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));

  const payload = onCreate.mock.calls[0][0];
  expect(payload.locator).toBe("3");
  expect(payload).not.toHaveProperty("parent_id");
});

it("saves an entry with only an order number, and refuses one with neither", async () => {
  const onCreate = vi.fn();
  renderTree({ onCreate, notes: [] });

  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  // A description alone is a body with nothing to call it: require_any bites.
  await userEvent.type(screen.getByLabelText("Description"), "Something happens");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).not.toHaveBeenCalled();

  await userEvent.type(screen.getByLabelText("No."), "3.2");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalled();
});

it("shows an orphaned row at the top level rather than hiding it", () => {
  // The router refuses a parent from another owner or section and a delete
  // cascades, so this should not arise — but dropping the row would hide it
  // with nothing to say so.
  renderTree({
    notes: [{ system_id: "x", title: "Stray", parent_id: "does-not-exist" }],
  });
  expect(screen.getByText("Stray")).toBeInTheDocument();
});

it("offers no nesting affordance on a flat section", () => {
  renderSection({ notes: [{ system_id: "a", title: "only" }] });
  expect(screen.queryByRole("button", { name: /add entry under/i })).toBeNull();
});
