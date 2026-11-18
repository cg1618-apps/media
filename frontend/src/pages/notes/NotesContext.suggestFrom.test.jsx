// Frontend: a structured field naming `suggest_from` is offered the names of
// the owner's rows in that section - 支線任務 Side Quests' Core NPC, from the
// 角色 Characters rows the page already loaded. No request is made for them.
import { fireEvent, render, screen } from "@testing-library/react";

import { NotesProvider } from "./NotesContext";
import { NotesGroup } from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: () => true, hasFeature: () => true }),
}));

const NAME = { key: "name", label: "Name", type: "text", column: "title", options: [] };

const CHARACTERS = {
  key: "characters_guide",
  shape: "structured",
  label: "角色 Characters",
  scope: "catalog",
  require_any: [],
  hierarchical: false,
  group: "compendium",
  group_label: "圖鑑與名詞 Compendium & Terms",
  fields: [NAME],
};
const SIDE_QUESTS = {
  key: "side_quests",
  shape: "structured",
  label: "支線任務 Side Quests",
  scope: "catalog",
  require_any: [["name"]],
  hierarchical: true,
  group: "story_list",
  group_label: "劇情&任務 Story & Quests",
  fields: [
    NAME,
    {
      key: "core_npc",
      label: "Core NPC",
      type: "text",
      column: null,
      options: [],
      suggest_from: "characters_guide",
    },
  ],
};

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue([CHARACTERS, SIDE_QUESTS]);
  vi.mocked(api.fetchNotes).mockResolvedValue([
    { system_id: "c1", section: "characters_guide", title: "Ranni", sort_index: 0 },
    { system_id: "c2", section: "characters_guide", title: "Ranni", sort_index: 1 },
    { system_id: "c3", section: "characters_guide", title: " ", sort_index: 2 },
    { system_id: "c4", section: "characters_guide", title: "Blaidd", sort_index: 3 },
  ]);
});

afterEach(() => {
  vi.resetAllMocks();
});

it("offers the characters' names, once each, to a side quest's Core NPC", async () => {
  render(
    <NotesProvider ownerType="game" ownerId="g1">
      <NotesGroup groupKey="story_list" />
    </NotesProvider>,
  );
  await screen.findByText("支線任務 Side Quests");
  fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
  fireEvent.focus(screen.getByLabelText("Core NPC"));

  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["Ranni", "Blaidd"]);
});
