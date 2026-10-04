// Frontend: tests for the franchise's and series' notes on an entry's notes.
//
// An entry's section also shows the rows its series and its franchise hold in
// that same section, read-only, as their own labelled sub-lists after the
// entry's own rows: own rows, then the series', then the franchise's. A section
// the entry does not have shows nothing of the group's, and an entry with no
// franchise or series shows nothing extra.
//
// The "no edit controls" assertions only bite because the entry's own rows in
// the same render DO carry them - an admin render with two own rows, so both
// the Edit / Delete buttons and the reorder grips are there to be missing from
// the group's rows.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { entityPath } from "../../lib/entityPath";
import NotesTemplate from "./NotesTemplate";
import * as api from "./api";

vi.mock("./api");

const SECTIONS = [
  { key: "foreshadowing", shape: "text_links", label: "伏筆/前後呼應 Foreshadowing", kinds: [] },
  { key: "trivia", shape: "text", label: "Trivia", kinds: [] },
];

const SERIES = { system_id: "s-id", public_id: 7, series_name_cn: "進擊系列" };
const FRANCHISE = { system_id: "f-id", public_id: 3, franchise_name_cn: "進擊的巨人" };

const OWN = [
  { system_id: "e1", section: "foreshadowing", content: "own one", links: [] },
  { system_id: "e2", section: "foreshadowing", content: "own two", links: [] },
];
const SERIES_ROWS = [
  { system_id: "s1", section: "foreshadowing", content: "series one", links: [] },
  { system_id: "s2", section: "foreshadowing", content: "series two", links: [] },
  // A section the entry does not have: never shown on the entry.
  { system_id: "s3", section: "symmetry", content: "series symmetry", links: [] },
];
const FRANCHISE_ROWS = [
  { system_id: "f1", section: "foreshadowing", content: "franchise one", links: [] },
  { system_id: "f2", section: "trivia", content: "franchise trivia" },
];

const rowsFor = { anime: OWN, series: SERIES_ROWS, franchise: FRANCHISE_ROWS };

beforeEach(() => {
  // The call-count assertions below count this test's calls alone.
  vi.clearAllMocks();
  vi.mocked(api.fetchSections).mockResolvedValue(SECTIONS);
  vi.mocked(api.fetchNotes).mockImplementation(async (ownerType) => rowsFor[ownerType]);
});

const renderTemplate = (props = {}) =>
  render(
    <MemoryRouter>
      <NotesTemplate ownerType="anime" ownerId="abc" isAdmin {...props} />
    </MemoryRouter>,
  );

const cardOf = (label) => screen.getByText(label).closest("div.bg-surface");

describe("group notes on an entry", () => {
  it("plugs the series' and franchise's rows into the matching section, labelled and linked", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    // The franchise also has a Trivia row, so its heading appears twice on the
    // page - once per section it holds rows in. Read this section's.
    await screen.findByText("franchise one");
    const card = cardOf("伏筆/前後呼應 Foreshadowing");
    const fromSeries = within(card).getByRole("group", { name: "From series: 進擊系列" });
    const fromFranchise = within(card).getByRole("group", { name: "From franchise: 進擊的巨人" });

    // Inside the section's own card, not a block of their own.
    expect(screen.getAllByRole("group", { name: "From series: 進擊系列" })).toHaveLength(1);
    expect(within(fromSeries).getByText("series one")).toBeInTheDocument();
    expect(within(fromSeries).getByText("series two")).toBeInTheDocument();
    expect(within(fromFranchise).getByText("franchise one")).toBeInTheDocument();

    // Each heading links to the group's own page, where its notes live.
    expect(entityPath("series", SERIES)).toMatch(/^\/series\/7/);
    expect(within(fromSeries).getByRole("link", { name: "進擊系列" })).toHaveAttribute(
      "href",
      entityPath("series", SERIES),
    );
    expect(within(fromFranchise).getByRole("link", { name: "進擊的巨人" })).toHaveAttribute(
      "href",
      entityPath("franchise", FRANCHISE),
    );
  });

  it("orders own rows, then the series', then the franchise's", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    await screen.findByText("franchise one");
    const order = ["own one", "own two", "series one", "series two", "franchise one"].map(
      (text) => screen.getByText(text),
    );
    for (let i = 1; i < order.length; i += 1) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("gives the group's rows no edit, delete or reorder control, while the entry's own rows have them", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    // The franchise also has a Trivia row, so its heading appears twice on the
    // page - once per section it holds rows in. Read this section's.
    await screen.findByText("franchise one");
    const card = cardOf("伏筆/前後呼應 Foreshadowing");
    const fromSeries = within(card).getByRole("group", { name: "From series: 進擊系列" });
    const fromFranchise = within(card).getByRole("group", { name: "From franchise: 進擊的巨人" });

    // The mirror case: the entry's own rows in this very card are editable.
    expect(within(card).getAllByRole("button", { name: "Edit" })).toHaveLength(2);
    expect(within(card).getAllByRole("button", { name: "Delete" })).toHaveLength(2);
    expect(within(card).getByRole("button", { name: "Reorder own one" })).toBeInTheDocument();

    for (const group of [fromSeries, fromFranchise]) {
      expect(within(group).queryByRole("button", { name: "Edit" })).toBeNull();
      expect(within(group).queryByRole("button", { name: "Delete" })).toBeNull();
      expect(within(group).queryByRole("button", { name: /^Reorder/ })).toBeNull();
      expect(within(group).queryByRole("button", { name: "Add" })).toBeNull();
    }
    // Two series rows, so a grip would have been drawn had they been sortable.
    expect(screen.queryByRole("button", { name: "Reorder series one" })).toBeNull();
  });

  it("shows nothing of a section the entry does not have", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    await screen.findByText("series one");
    expect(screen.queryByText("series symmetry")).toBeNull();
  });

  it("opens a section the entry has no rows in when the group has some", async () => {
    renderTemplate({ series: SERIES, franchise: FRANCHISE });
    // Trivia holds no row of the entry's: without the franchise's row it
    // would open collapsed, so the row being on screen is the assertion.
    await screen.findByText("franchise trivia");
    const card = cardOf("Trivia");
    const fromFranchise = within(card).getByRole("group", { name: "From franchise: 進擊的巨人" });
    expect(within(fromFranchise).getByText("franchise trivia")).toBeInTheDocument();
    // The entry's empty hint would contradict the rows right under it.
    expect(within(card).queryByText("No entries.")).toBeNull();
  });

  it("shows nothing extra for an entry with no franchise or series", async () => {
    renderTemplate();
    await screen.findByText("own one");
    await waitFor(() => expect(api.fetchNotes).toHaveBeenCalled());
    expect(api.fetchNotes).toHaveBeenCalledTimes(1);
    expect(api.fetchNotes).toHaveBeenCalledWith("anime", "abc");
    expect(screen.queryByRole("group", { name: /^From / })).toBeNull();
    expect(screen.queryByText("series one")).toBeNull();
  });

  it("shows the franchise alone for an entry with no series", async () => {
    renderTemplate({ franchise: FRANCHISE });
    await screen.findByText("franchise one");
    expect(screen.getAllByRole("group", { name: "From franchise: 進擊的巨人" })).toHaveLength(2);
    expect(screen.queryByRole("group", { name: /^From series/ })).toBeNull();
    expect(api.fetchNotes).not.toHaveBeenCalledWith("series", expect.anything());
  });
});
