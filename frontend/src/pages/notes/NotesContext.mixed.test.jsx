// Frontend: mixed sections - catalogue rows and the viewer's own personal
// rows in one section (道具 Items, 地理 Geography, Resources, ...).
//
// The listing marks such a section `mixed`, and each row says whether it is
// `personal`. Which kind a viewer writes is fixed by manage.catalog: its
// holder writes catalogue rows, anyone else holding self.personal_notes its
// own personal rows - never both. So Add shows for either, and each row's
// Edit, Delete, reorder handle and "Add under" follow the row's kind.
//
// Every section below holds rows of BOTH kinds, so a missing control on one
// row is the gate refusing and not an empty list; each viewer is asserted on
// both kinds of row, so one passing case proves the other's refusal.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import NotesTemplate from "./NotesTemplate";
import { rowAccessFor } from "./NotesContext";
import * as api from "./api";

vi.mock("./api");

let held = new Set();
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ has: (p) => held.has(p), hasFeature: () => true }),
}));

const NAME = { key: "name", label: "Name", type: "text", column: "title", options: [] };
const GROUP = { key: "group", label: "Group", type: "select", column: "kind", options: [] };

const ITEMS = {
  key: "items",
  shape: "structured",
  label: "道具 Items",
  scope: "catalog",
  mixed: true,
  require_any: [],
  hierarchical: false,
  fields: [NAME],
};
const CHARACTERS = {
  key: "characters_guide",
  shape: "structured",
  label: "角色 Characters",
  scope: "catalog",
  mixed: true,
  require_any: [],
  hierarchical: false,
  groupable_by: "group",
  fields: [GROUP, NAME],
};
const GEOGRAPHY = {
  key: "geography",
  shape: "structured",
  label: "地理 Geography",
  scope: "catalog",
  mixed: true,
  require_any: [],
  hierarchical: true,
  fields: [NAME],
};
const RESOURCES = {
  key: "resources",
  shape: "name_links",
  label: "Resources",
  scope: "catalog",
  mixed: true,
  fields: [],
};
const TRIVIA = { key: "trivia", shape: "text", label: "Trivia", kinds: [], scope: "catalog" };

const row = (id, section, title, personal, extra = {}) => ({
  system_id: id,
  section,
  title,
  personal,
  sort_index: 0,
  ...extra,
});

// The server sends a personal row FIRST in Items and in Characters' group A,
// so a drawn catalogue-first order is the page's doing, not the fixture's.
const ROWS = [
  row("ip1", "items", "My herb", true),
  row("ic1", "items", "Potion", false),
  row("ic2", "items", "Ether", false),
  row("ip2", "items", "My stone", true),
  row("chp1", "characters_guide", "My ally", true, { kind: "A" }),
  row("chc1", "characters_guide", "Hero", false, { kind: "A" }),
  row("chc2", "characters_guide", "Rival", false, { kind: "B" }),
  row("gc1", "geography", "Capital", false),
  row("gp1", "geography", "My camp", true),
  row("rc1", "resources", "Wiki", false, { links: ["https://wiki.example"] }),
  row("rp1", "resources", "My map", true, { links: ["https://map.example"] }),
  { system_id: "t1", section: "trivia", content: "a catalogue fact", sort_index: 0 },
];

beforeEach(() => {
  localStorage.clear();
  vi.mocked(api.fetchSections).mockResolvedValue([ITEMS, CHARACTERS, GEOGRAPHY, RESOURCES, TRIVIA]);
  vi.mocked(api.fetchNotes).mockResolvedValue(ROWS);
  vi.mocked(api.reorderNotes).mockResolvedValue({ status: "success" });
});

afterEach(() => {
  vi.resetAllMocks();
});

async function renderAs(permissions) {
  held = new Set(["view.extras", ...permissions]);
  render(<NotesTemplate ownerType="game" ownerId="g1" />);
  await waitFor(() => expect(screen.getByText("Potion")).toBeInTheDocument());
  // Items holds four rows; unfold it so the fourth is drawn.
  fireEvent.click(within(card("道具 Items")).getByRole("button", { name: "Show all (4)" }));
}

const card = (label) => screen.getByText(label).closest(".bg-surface");
// The row a title is drawn in: the largest element around it that holds no
// other row's title.
const TITLES = ROWS.map((r) => r.title).filter(Boolean);
const rowOf = (title) => {
  let el = screen.getByText(title);
  while (el.parentElement) {
    const parent = el.parentElement;
    if (TITLES.some((t) => t !== title && within(parent).queryByText(t))) return el;
    el = parent;
  }
  return el;
};
const rowControls = (title) => {
  const r = within(rowOf(title));
  return {
    edit: r.queryByRole("button", { name: "Edit" }),
    remove: r.queryByRole("button", { name: "Delete" }),
  };
};
const handle = (title) => screen.queryByRole("button", { name: `Reorder ${title}` });
const drawnTitles = (label, titles) =>
  [...card(label).querySelectorAll("*")]
    .filter((el) => el.children.length === 0 && titles.includes(el.textContent))
    .map((el) => el.textContent);

describe("rowAccessFor", () => {
  const has = (set) => (p) => set.has(p);

  it("in a mixed section lets a user add and write its personal rows only", () => {
    const access = rowAccessFor(ITEMS, has(new Set(["self.personal_notes"])));
    expect(access.canWrite).toBe(true);
    expect(access.canEditRow({ personal: true })).toBe(true);
    expect(access.canEditRow({ personal: false })).toBe(false);
    expect(access.canMoveRow({ personal: true })).toBe(true);
    expect(access.canMoveRow({ personal: false })).toBe(false);
    expect(access.canAddUnder({ personal: false })).toBe(true);
    expect(access.canAddUnder({ personal: true })).toBe(true);
  });

  it("in a mixed section gives a catalogue writer the mirror, and no personal parent", () => {
    const access = rowAccessFor(ITEMS, has(new Set(["manage.catalog"])));
    expect(access.canWrite).toBe(true);
    expect(access.canEditRow({ personal: false })).toBe(true);
    expect(access.canEditRow({ personal: true })).toBe(false);
    expect(access.canMoveRow({ personal: false })).toBe(true);
    expect(access.canMoveRow({ personal: true })).toBe(false);
    expect(access.canAddUnder({ personal: false })).toBe(true);
    expect(access.canAddUnder({ personal: true })).toBe(false);
  });

  it("leaves a non-mixed catalogue section to manage.catalog alone", () => {
    const user = rowAccessFor(TRIVIA, has(new Set(["self.personal_notes"])));
    expect(user.canWrite).toBe(false);
    expect(user.canEditRow({ personal: false })).toBe(false);
    const writer = rowAccessFor(TRIVIA, has(new Set(["manage.catalog"])));
    expect(writer.canWrite).toBe(true);
    expect(writer.canEditRow({})).toBe(true);
  });
});

describe("write gating in a mixed section", () => {
  it("gives a user Add and controls on its personal rows, none on the catalogue rows", async () => {
    await renderAs(["self.list", "self.personal_notes"]);

    expect(within(card("道具 Items")).getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(rowControls("My herb").edit).not.toBeNull();
    expect(rowControls("My herb").remove).not.toBeNull();
    expect(rowControls("Potion").edit).toBeNull();
    expect(rowControls("Potion").remove).toBeNull();

    // Resources is a mixed name_links section: the same rule.
    expect(within(card("Resources")).getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(rowControls("My map").edit).not.toBeNull();
    expect(rowControls("Wiki").edit).toBeNull();

    // A non-mixed catalogue section is unchanged: no Add, no row controls.
    expect(within(card("Trivia")).queryByRole("button", { name: "Add" })).toBeNull();
    expect(within(card("Trivia")).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("gives a catalogue writer without self.personal_notes the mirror", async () => {
    await renderAs(["manage.catalog"]);

    expect(within(card("道具 Items")).getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(rowControls("Potion").edit).not.toBeNull();
    expect(rowControls("Potion").remove).not.toBeNull();
    expect(rowControls("My herb").edit).toBeNull();
    expect(rowControls("My herb").remove).toBeNull();

    expect(rowControls("Wiki").edit).not.toBeNull();
    expect(rowControls("My map").edit).toBeNull();

    expect(within(card("Trivia")).getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("offers a catalogue writer only catalogue rows as a parent in Geography", async () => {
    await renderAs(["manage.catalog"]);
    expect(screen.getByRole("button", { name: "Add entry under Capital" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add entry under My camp" })).toBeNull();
  });

  it("lets a user put its own rows under either kind in Geography", async () => {
    await renderAs(["self.personal_notes"]);
    expect(screen.getByRole("button", { name: "Add entry under Capital" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add entry under My camp" })).toBeInTheDocument();
  });
});

describe("how a personal row looks", () => {
  it("marks personal rows Mine and catalogue rows not", async () => {
    await renderAs(["self.personal_notes"]);
    for (const title of ["My herb", "My stone", "My ally", "My camp", "My map"]) {
      expect(within(rowOf(title)).getByText("Mine")).toBeInTheDocument();
    }
    for (const title of ["Potion", "Ether", "Hero", "Capital", "Wiki"]) {
      expect(within(rowOf(title)).queryByText("Mine")).toBeNull();
    }
  });

  it("draws the catalogue rows before the personal rows, within each group", async () => {
    await renderAs(["self.personal_notes"]);
    expect(
      drawnTitles("道具 Items", ["Potion", "Ether", "My herb", "My stone"]),
    ).toEqual(["Potion", "Ether", "My herb", "My stone"]);
    // Characters is grouped by its Group: group A holds Hero before My ally.
    const groupA = screen.getByRole("region", { name: "A" });
    const inA = [...groupA.querySelectorAll("*")]
      .filter((el) => el.children.length === 0 && ["Hero", "My ally"].includes(el.textContent))
      .map((el) => el.textContent);
    expect(inA).toEqual(["Hero", "My ally"]);
  });
});

describe("reorder by kind", () => {
  it("gives a user handles on its own rows only and sends only their ids", async () => {
    await renderAs(["self.personal_notes"]);
    expect(handle("Potion")).toBeNull();
    expect(handle("Ether")).toBeNull();
    fireEvent.keyDown(handle("My herb"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "items", ["ip2", "ip1"]);
  });

  it("gives a catalogue writer handles on the catalogue rows only and sends only theirs", async () => {
    await renderAs(["manage.catalog"]);
    expect(handle("My herb")).toBeNull();
    expect(handle("My stone")).toBeNull();
    fireEvent.keyDown(handle("Potion"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "items", ["ic2", "ic1"]);
  });

  it("sends only the user's own ids from a mixed name_links section", async () => {
    vi.mocked(api.fetchNotes).mockResolvedValue([
      ...ROWS,
      row("rp2", "resources", "My guide", true, { links: ["https://guide.example"] }),
    ]);
    await renderAs(["self.personal_notes"]);
    expect(handle("Wiki")).toBeNull();
    fireEvent.keyDown(handle("My map"), { key: "ArrowDown" });
    expect(api.reorderNotes).toHaveBeenCalledWith("game", "g1", "resources", ["rp2", "rp1"]);
  });
});
