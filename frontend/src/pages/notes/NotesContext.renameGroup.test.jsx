// Frontend: how the notes page saves a group rename (NotesContext's
// `onRenameGroup`): one POST /api/notes/rename-group naming the owner, the
// section and both names, then the rows are reloaded; a refusal says why.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => p === "manage.catalog" }),
}));

const CONTROLS = {
  key: "controls",
  shape: "structured",
  label: "操作 Controls",
  scope: "catalog",
  require_any: [],
  hierarchical: false,
  group_by: null,
  groupable_by: "type",
  owner_where: {},
  fields: [
    { key: "type", label: "Type", type: "select", column: "kind", options: [] },
    { key: "control", label: "Control", type: "text", column: "title", options: [] },
  ],
};

const row = (id, title, kind) => ({ system_id: id, section: "controls", title, kind, fields: {} });

beforeEach(() => {
  vi.mocked(api.fetchSections).mockResolvedValue([CONTROLS]);
  vi.mocked(api.fetchNotes).mockResolvedValue([row("a", "Roll", "Combat"), row("b", "Map", "Menu")]);
});

afterEach(() => {
  vi.resetAllMocks();
  try {
    localStorage.clear();
  } catch {
    // storage unavailable - nothing to clear
  }
});

const rename = async (from, to) => {
  await userEvent.click(await screen.findByRole("button", { name: `Rename group ${from}` }));
  const input = screen.getByRole("textbox", { name: "Group name" });
  await userEvent.clear(input);
  await userEvent.type(input, `${to}{Enter}`);
};

it("sends one rename for the owner and section, then reloads the rows", async () => {
  vi.mocked(api.renameGroup).mockResolvedValue({ renamed: 1 });
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  vi.mocked(api.fetchNotes).mockResolvedValue([row("a", "Roll", "Fight"), row("b", "Map", "Menu")]);

  await rename("Combat", "Fight");

  expect(api.renameGroup).toHaveBeenCalledWith("game", "g1", "controls", "Combat", "Fight");
  expect(await screen.findByRole("button", { name: "Rename group Fight" })).toBeInTheDocument();
  expect(api.fetchNotes).toHaveBeenCalledTimes(2);
});

it("says why when the rename is refused", async () => {
  vi.mocked(api.renameGroup).mockRejectedValue(new Error("A group name cannot be blank."));
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  await rename("Combat", "Fight");
  await waitFor(() =>
    expect(screen.getByText("A group name cannot be blank.")).toBeInTheDocument(),
  );
});

it("refetches the entry after renaming a group_by group, whose order it carries", async () => {
  const HIGHLIGHTS = {
    ...CONTROLS,
    key: "h_game_highlights",
    scope: "catalog",
    groupable_by: null,
    group_by: "female_characters",
    fields: [{ key: "female_characters", label: "Female Characters", type: "names", options: [] }],
  };
  vi.mocked(api.fetchSections).mockResolvedValue([HIGHLIGHTS]);
  vi.mocked(api.fetchNotes).mockResolvedValue([
    { system_id: "h", section: "h_game_highlights", fields: { female_characters: ["Ana"] } },
  ]);
  vi.mocked(api.renameGroup).mockResolvedValue({ renamed: 1 });
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  render(
    <QueryClientProvider client={queryClient}>
      <NotesTemplate ownerType="h-game" ownerId="g1" groupOrder={["Ana"]} />
    </QueryClientProvider>,
  );

  await rename("Ana", "Cia");

  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["media-item", "h-game"] }),
  );
  expect(api.renameGroup).toHaveBeenCalledWith("h-game", "g1", "h_game_highlights", "Ana", "Cia");
});
