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
    group: "worldbuilding",
    group_label: "世界觀 Worldbuilding",
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
    <NotesProvider ownerType="game" ownerId="abc">
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
  // 世界觀 Worldbuilding renders its own GroupCard; 待辦 Todo does not, or the
  // Progress slip would have a second header inside it.
  expect(screen.getByText("世界觀 Worldbuilding")).toBeInTheDocument();
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

it("renders nothing for a group this owner does not have", async () => {
  render(
    <NotesProvider ownerType="game" ownerId="abc">
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

// beforeGroup: something that is not a note (the game page's cast) drawn just
// before a named group's card - a sibling of the card, never inside it.
it("draws a beforeGroup node just before that group's card, outside it", async () => {
  renderPage({ beforeGroup: { worldbuilding: <div data-testid="cast">CAST</div> } });
  const card = (await screen.findByText("Lore")).closest("section");
  const cast = screen.getByTestId("cast");
  expect(card).not.toContainElement(cast);
  // Immediately before it in document order.
  expect(cast.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(cast.parentElement).toBe(card.parentElement);
  expect(cast.nextElementSibling).toBe(card);
});

it("still draws a beforeGroup node whose group this owner lacks", async () => {
  renderPage({ beforeGroup: { compendium: <div data-testid="cast">CAST</div> } });
  expect(await screen.findByText("Lore")).toBeInTheDocument();
  expect(screen.getByTestId("cast")).toBeInTheDocument();
});

