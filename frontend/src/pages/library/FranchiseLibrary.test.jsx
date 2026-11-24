import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FranchiseLibrary from "./FranchiseLibrary";

// The viewer's scope. A member (every flag on) unless a test says otherwise;
// `scope.<flag> = false` makes the guest case.
const { scope } = vi.hoisted(() => ({
  scope: { studio: true, publisher: true, person: true, character: true, search: true, extras: true, ownData: true },
}));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));
beforeEach(() => {
  Object.assign(scope, { studio: true, publisher: true, person: true, character: true, search: true, extras: true, ownData: true });
});

const COLLECTIONS = [
  { system_id: "c1", public_id: 1, collection_name_en: "Shonen Jump" },
];

const FRANCHISES = [
  {
    system_id: "f1",
    public_id: 1,
    franchise_name_en: "Attack on Titan",
    franchise_name_cn: "進撃の巨人",
    franchise_type: "Anime",
    collection_id: "c1",
    franchise_expectation: "Highest",
    my_rating: "10",
    has_relations: true,
  },
  {
    system_id: "f2",
    public_id: 2,
    franchise_name_en: "Breaking Bad",
    franchise_type: "TV",
    collection_id: null,
    franchise_expectation: "High",
    my_rating: "9",
  },
];

// An anime, a comic and a game, all under f1. Comic and game are the point:
// both were unfetched, so both were invisible to the cover fallback and
// would undercount the Entries column.
const ANIME = [{ system_id: "a1", public_id: 1, franchise_id: "f1" }];
const COMICS = [{ system_id: "cm1", public_id: 1, franchise_id: "f1" }];
const GAMES = [{ system_id: "g1", public_id: 1, franchise_id: "f1" }];

function bodyFor(url) {
  if (url.startsWith("/api/franchise/")) return FRANCHISES;
  if (url.startsWith("/api/collection/")) return COLLECTIONS;
  if (url.startsWith("/api/anime/")) return ANIME;
  if (url.startsWith("/api/comic/")) return COMICS;
  if (url.startsWith("/api/game/")) return GAMES;
  return [];
}

beforeEach(() => {
  global.fetch = vi.fn((url) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(bodyFor(url)) }),
  );
});

async function renderTableView() {
  render(
    <MemoryRouter>
      <FranchiseLibrary />
    </MemoryRouter>,
  );
  await screen.findByText("進撃の巨人");
  await userEvent.click(screen.getByRole("button", { name: "Table view" }));
  return screen.getByRole("table");
}

/** The <tr> whose first cell holds `name`. */
function rowFor(table, name) {
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

describe("FranchiseLibrary table view", () => {
  it("renders a column per field rather than the not-built placeholder", async () => {
    const table = await renderTableView();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Franchise", "Collection", "Type", "Entries", "Expectation", "My"]);
  });

  it("names the parent collection, and says None when there is none", async () => {
    const table = await renderTableView();
    expect(
      within(rowFor(table, "進撃の巨人")).getByText("Shonen Jump"),
    ).toBeInTheDocument();
    expect(within(rowFor(table, "Breaking Bad")).getByText("None")).toBeInTheDocument();
  });

  it("counts every entry type, including the comic and game tables", async () => {
    const table = await renderTableView();
    // anime a1 + comic cm1 + game g1. Reads 1 when comic and game go
    // unfetched, which is what getFranchiseCover's contract forbids.
    expect(within(rowFor(table, "進撃の巨人")).getByText("3")).toBeInTheDocument();
  });

  it("links a row to the franchise detail page", async () => {
    const table = await renderTableView();
    expect(
      within(rowFor(table, "Breaking Bad")).getByRole("link", { name: /Breaking Bad/ }),
    ).toHaveAttribute("href", "/franchise/2/breaking-bad");
  });

  it("keeps the grid view working", async () => {
    render(
      <MemoryRouter>
        <FranchiseLibrary />
      </MemoryRouter>,
    );
    await screen.findByText("進撃の巨人");
    await waitFor(() => {
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });
});

describe("FranchiseLibrary without self.list", () => {
  // FRANCHISES carry a rating and an expectation each, which a member reads
  // in the table and sorts by (the first describe). A viewer without
  // self.list - every other key held - has neither of its own.
  it("drops the Expectation and My columns from the table", async () => {
    scope.ownData = false;
    const table = await renderTableView();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Franchise", "Collection", "Type", "Entries"]);
  });

  it("offers only the title sort", async () => {
    scope.ownData = false;
    await renderTableView();
    const sort = screen.getByRole("combobox");
    expect(within(sort).getAllByRole("option").map((o) => o.value)).toEqual(["title"]);
  });

  it("offers a member the rating and expectation sorts", async () => {
    await renderTableView();
    const sort = screen.getByRole("combobox");
    expect(within(sort).getAllByRole("option").map((o) => o.value)).toEqual([
      "title",
      "my_rating",
      "expectation",
    ]);
  });
});

describe("FranchiseLibrary expectation sort", () => {
  it("breaks an expectation tie by my rating, then by title", async () => {
    const tied = [
      { system_id: "t1", public_id: 11, franchise_name_en: "Mid", franchise_expectation: "High", my_rating: null },
      { system_id: "t2", public_id: 12, franchise_name_en: "Beta", franchise_expectation: "High", my_rating: "B" },
      { system_id: "t3", public_id: 13, franchise_name_en: "Zeta", franchise_expectation: "High", my_rating: "S" },
      { system_id: "t4", public_id: 14, franchise_name_en: "Alpha", franchise_expectation: "High", my_rating: "B" },
      { system_id: "t5", public_id: 15, franchise_name_en: "Top", franchise_expectation: "Highest", my_rating: "F" },
    ];
    global.fetch = vi.fn((url) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.startsWith("/api/franchise/") ? tied : []),
      }),
    );
    render(
      <MemoryRouter>
        <FranchiseLibrary />
      </MemoryRouter>,
    );
    await screen.findByText("Zeta");
    await userEvent.selectOptions(screen.getByRole("combobox"), "expectation");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    const names = within(screen.getByRole("table"))
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(names).toEqual(["Top", "Zeta", "Alpha", "Beta", "Mid"]);
  });
});


// has_relations counts only related franchises the viewer may see (the API
// does that); the filter reads it as given.
describe("FranchiseLibrary Relation filter", () => {
  async function renderWithFilters() {
    render(
      <MemoryRouter>
        <FranchiseLibrary />
      </MemoryRouter>,
    );
    await screen.findByText("進撃の巨人");
    await userEvent.click(screen.getByRole("button", { name: /^Filters/ }));
  }

  it("keeps only the franchises with a relation", async () => {
    await renderWithFilters();
    await userEvent.click(screen.getByRole("button", { name: "Has relation" }));
    expect(screen.getByText("進撃の巨人")).toBeInTheDocument();
    expect(screen.queryByText("Breaking Bad")).toBeNull();
  });

  it("keeps only the franchises without one, a missing flag included", async () => {
    await renderWithFilters();
    await userEvent.click(screen.getByRole("button", { name: "No relation" }));
    expect(screen.getByText("Breaking Bad")).toBeInTheDocument();
    expect(screen.queryByText("進撃の巨人")).toBeNull();
  });
});

// The page's title stands alone: no grey "Library" eyebrow above it.
describe("FranchiseLibrary heading", () => {
  it("draws the title with no Library eyebrow", async () => {
    render(
      <MemoryRouter>
        <FranchiseLibrary />
      </MemoryRouter>,
    );
    await screen.findByText("進撃の巨人");
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByText("Library")).toBeNull();
  });
});
