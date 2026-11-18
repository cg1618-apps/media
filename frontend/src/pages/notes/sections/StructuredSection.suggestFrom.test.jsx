import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

import StructuredSection from "./StructuredSection";

// 支線任務 Side Quests as the API serves it, cut to the fields under test: a
// text field and a names field that suggest the owner's 角色 Characters rows'
// names (`suggest_from`), beside a names field that suggests the cast.
const SIDE_QUESTS = {
  key: "side_quests",
  shape: "structured",
  label: "支線任務 Side Quests",
  require_any: [["name"]],
  hierarchical: true,
  fields: [
    { key: "name", label: "Name", type: "text", column: "title", options: [] },
    {
      key: "core_npc",
      label: "Core NPC",
      type: "text",
      column: null,
      options: [],
      suggest_from: "characters_guide",
    },
    {
      key: "other_npcs",
      label: "Other NPCs",
      type: "names",
      column: null,
      options: [],
      suggest_from: "characters_guide",
    },
  ],
};

const renderSection = (props = {}) =>
  render(
    <StructuredSection
      section={SIDE_QUESTS}
      notes={[]}
      canWrite
      onCreate={() => {}}
      onUpdate={() => {}}
      onDelete={() => {}}
      onReorder={() => {}}
      sectionTitles={{ characters_guide: ["Ranni", "Blaidd"] }}
      nameSuggestions={["Cast Member"]}
      {...props}
    />,
  );

it("suggests the characters' names for a text field, keeping it free text", async () => {
  const onCreate = vi.fn();
  renderSection({ onCreate });
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  const core = screen.getByLabelText("Core NPC");
  expect(core).toHaveAttribute("role", "combobox");
  await userEvent.click(core);
  expect(screen.getByText("Ranni")).toBeInTheDocument();
  expect(screen.getByText("Blaidd")).toBeInTheDocument();

  await userEvent.type(core, "Nobody Written Down");
  await userEvent.type(screen.getByLabelText("Name"), "Lost Cargo");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Lost Cargo",
      fields: expect.objectContaining({ core_npc: "Nobody Written Down" }),
    }),
  );
});

it("suggests the characters' names, not the cast, for a names field", async () => {
  renderSection();
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

  await userEvent.click(screen.getByLabelText("Other NPCs"));
  expect(screen.getByRole("option", { name: "Ranni" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Cast Member" })).not.toBeInTheDocument();
});

it("leaves the field a plain input when the source section has no rows", async () => {
  renderSection({ sectionTitles: {} });
  await userEvent.click(screen.getByRole("button", { name: /^add$/i }));
  await userEvent.click(screen.getByLabelText("Core NPC"));
  expect(screen.queryByText("Ranni")).not.toBeInTheDocument();
});
