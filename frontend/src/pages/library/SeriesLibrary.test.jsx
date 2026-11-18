import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesLibrary from "./SeriesLibrary";

// The viewer's scope: a member with a list unless a test says otherwise.
const { scope } = vi.hoisted(() => ({ scope: { ownData: true } }));
vi.mock("../../hooks/useViewScope", () => ({ useViewScope: () => scope }));

const FRANCHISES = [{ system_id: "f1", public_id: 1, franchise_name_en: "Nintendo Sports" }];

const SERIES = [
  {
    system_id: "s1",
    public_id: 1,
    franchise_id: "f1",
    series_name_en: "Switch Sports",
    series_expectation: "High",
    my_rating: "B",
  },
  {
    system_id: "s2",
    public_id: 2,
    franchise_id: null,
    series_name_en: "Attack on Titan",
    series_expectation: "High",
    my_rating: "S",
  },
  {
    system_id: "s3",
    public_id: 3,
    franchise_id: null,
    series_name_en: "Alpha Saga",
    series_expectation: null,
    my_rating: null,
  },
];

// Two games under s1 and an anime under s2: the game table is the one a
// series library could forget, which would undercount and mis-filter.
const GAMES = [
  { system_id: "g1", public_id: 1, series_id: "s1" },
  { system_id: "g2", public_id: 2, series_id: "s1" },
];
const ANIME = [{ system_id: "a1", public_id: 1, series_id: "s2" }];

function bodyFor(url) {
  if (url.startsWith("/api/series/")) return SERIES;
  if (url.startsWith("/api/franchise/")) return FRANCHISES;
  if (url.startsWith("/api/game/")) return GAMES;
  if (url.startsWith("/api/anime/")) return ANIME;
  return [];
}

beforeEach(() => {
  scope.ownData = true;
  global.fetch = vi.fn((url) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(bodyFor(url)) }),
  );
});

function renderPage() {
  render(
    <MemoryRouter>
      <SeriesLibrary />
    </MemoryRouter>,
  );
  return screen.findByText("Switch Sports");
}

async function renderTableView() {
  await renderPage();
  await userEvent.click(screen.getByRole("button", { name: "Table view" }));
  return screen.getByRole("table");
}

function rowFor(table, name) {
  const row = within(table)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

const rowNames = (table) =>
  within(table)
    .getAllByRole("link")
    .map((a) => a.textContent);

describe("SeriesLibrary", () => {
  it("lists every series as a card linking to its page", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: /Switch Sports/ })).toHaveAttribute(
      "href",
      "/series/1/switch-sports",
    );
    expect(screen.getByText("3 series")).toBeInTheDocument();
  });

  it("draws a column per field in the table", async () => {
    const table = await renderTableView();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Series", "Franchise", "Types", "Entries", "Expectation", "My"]);
  });

  it("names the parent franchise and counts the games", async () => {
    const table = await renderTableView();
    const row = rowFor(table, "Switch Sports");
    expect(within(row).getByText("Nintendo Sports")).toBeInTheDocument();
    expect(within(row).getByText("Game")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("sorts by expectation, then my rating, then title", async () => {
    await renderPage();
    await userEvent.selectOptions(screen.getByRole("combobox"), "expectation");
    await userEvent.click(screen.getByRole("button", { name: "Table view" }));
    expect(rowNames(screen.getByRole("table"))).toEqual([
      "Attack on Titan",
      "Switch Sports",
      "Alpha Saga",
    ]);
  });

  it("filters by a media type the series holds", async () => {
    await renderPage();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.click(screen.getByRole("button", { name: "Game" }));
    expect(screen.getByText("1 series")).toBeInTheDocument();
    expect(screen.queryByText("Attack on Titan")).toBeNull();
  });
});

describe("SeriesLibrary without self.list", () => {
  it("drops the personal columns and sorts", async () => {
    scope.ownData = false;
    const table = await renderTableView();
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Series", "Franchise", "Types", "Entries"]);
    const sort = screen.getByRole("combobox");
    expect(within(sort).getAllByRole("option").map((o) => o.value)).toEqual(["title"]);
    expect(rowNames(table)).toEqual(["Alpha Saga", "Attack on Titan", "Switch Sports"]);
  });
});
