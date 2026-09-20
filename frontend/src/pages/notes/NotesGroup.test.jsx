// Frontend: tests for rendering ONE group away from the run of cards, and for
// suppressing it where the cards are.
//
// The game detail page puts 待辦 Todo inside its Progress slip and everything
// else at the bottom. What these pin is that the pair is complementary - the
// group appears exactly once on such a page - and that one provider serves
// both places, because two would be two fetches of the same two endpoints.
import { render, screen, waitFor } from "@testing-library/react";

import { NotesProvider } from "./NotesContext";
import { NotesBlocks, NotesGroup } from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

const SECTIONS = [
  { key: "remark", shape: "text", label: "Remark", kinds: [], singleton: true },
  {
    key: "todo_now",
    shape: "text",
    label: "Doing now",
    kinds: [],
    group: "todo",
    group_label: "待辦 Todo",
  },
  {
    key: "todo_next",
    shape: "text",
    label: "To do next",
    kinds: [],
    group: "todo",
    group_label: "待辦 Todo",
  },
  {
    key: "lore",
    shape: "text",
    label: "Lore",
    kinds: [],
    group: "story",
    group_label: "劇情 Story",
  },
];

const NOTES = [
  { system_id: "n1", section: "todo_now", content: "beat Malenia", sort_index: 0 },
  { system_id: "n2", section: "lore", content: "the Erdtree", sort_index: 0 },
];

beforeEach(() => {
  // Call COUNTS are asserted below, and they accumulate across tests in a
  // file otherwise - "fetched once" would pass on the first test and fail on
  // the fourth for a reason that has nothing to do with the code.
  vi.clearAllMocks();
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockResolvedValue(NOTES);
});

const renderPage = (props = {}) =>
  render(
    <NotesProvider ownerType="game" ownerId="abc" isAdmin>
      <div data-testid="slip">
        <NotesGroup groupKey="todo" />
      </div>
      <NotesBlocks hideGroups={["todo"]} {...props} />
    </NotesProvider>,
  );

it("renders the group where the screen asked for it", async () => {
  renderPage();
  const slip = await screen.findByTestId("slip");
  expect(await screen.findByText("Doing now")).toBeInTheDocument();
  expect(slip).toHaveTextContent("Doing now");
  expect(slip).toHaveTextContent("To do next");
  // Its rows come through too - the group is not just labels.
  expect(slip).toHaveTextContent("beat Malenia");
});

it("gives the group no card of its own, because the screen supplies one", async () => {
  renderPage();
  await screen.findByText("Doing now");
  // 劇情 Story renders its own GroupCard; 待辦 Todo does not, or the Progress
  // slip would have a second header inside it.
  expect(screen.getByText("劇情 Story")).toBeInTheDocument();
  expect(screen.queryByText("待辦 Todo")).toBeNull();
});

it("hides the group from the cards, so it appears exactly once", async () => {
  renderPage();
  await screen.findByText("Doing now");
  expect(screen.getAllByText("Doing now")).toHaveLength(1);
  expect(screen.getAllByText("To do next")).toHaveLength(1);
});

it("fetches once for both places", async () => {
  renderPage();
  await screen.findByText("Doing now");
  await waitFor(() => {
    expect(api.fetchSections).toHaveBeenCalledTimes(1);
    expect(api.fetchNotes).toHaveBeenCalledTimes(1);
  });
});

it("hides a group and a section independently", async () => {
  renderPage({ hideSections: ["remark"] });
  await screen.findByText("Doing now");
  expect(screen.queryByText("Remark")).toBeNull();
  expect(screen.getByText("Lore")).toBeInTheDocument();
});

it("renders nothing for a group this owner does not have", async () => {
  render(
    <NotesProvider ownerType="game" ownerId="abc" isAdmin>
      <div data-testid="slip">
        <NotesGroup groupKey="music" />
      </div>
      <NotesBlocks />
    </NotesProvider>,
  );
  await screen.findByText("Doing now");
  expect(screen.getByTestId("slip")).toBeEmptyDOMElement();
});

it("refuses to render a notes component outside a provider", () => {
  // A blank screen with no error is the failure this replaces: every one of
  // these reads its data from the context and would otherwise render nothing.
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  expect(() => render(<NotesGroup groupKey="todo" />)).toThrow(
    /outside NotesProvider/,
  );
  quiet.mockRestore();
});
