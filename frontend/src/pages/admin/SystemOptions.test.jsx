// /options lists every choice list in four tiers: the closed enums and the
// entity records (Internal Keys), then system_option split as the Add / Modify
// sub-tabs split it - System Options, Tags, Common Options.
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SystemOptions from "./SystemOptions";

const option = (category, value, extra = {}) => ({
  system_id: `${category}:${value}`,
  category,
  value,
  sort_order: 0,
  scopes: [],
  usages: [],
  aliases: [],
  ...extra,
});

const OPTIONS = [
  option("Genre Main", "奇幻"),
  option("Platform", "Netflix"),
  option("Country", "Japan"),
];

const COUNTS = {
  person_roles: { director: 4, author: 2 },
  studios: 7,
  publishers: 3,
  characters: 9,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const body = String(url).startsWith("/api/options/record-counts")
        ? COUNTS
        : String(url).startsWith("/api/options/")
          ? OPTIONS
          : null;
      return Promise.resolve({ ok: body !== null, json: () => Promise.resolve(body) });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  render(
    <MemoryRouter>
      <SystemOptions />
    </MemoryRouter>,
  );
}

const tier = (id) => document.getElementById(id);

// The entities table's row whose Record cell reads `name`.
const entityRow = (name) =>
  [...tier("tier-1").querySelectorAll("tbody tr")].find(
    (tr) => tr.querySelector("td")?.textContent === name,
  );

describe("SystemOptions", () => {
  it("heads the four tiers in order", async () => {
    renderPage();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(["Internal Keys", "System Options", "Tags", "Common Options"]);
  });

  it("puts each category in the tier its Add / Modify sub-tab names", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("奇幻")).toBeInTheDocument());
    expect(within(tier("tier-2")).getByText("Netflix")).toBeInTheDocument();
    expect(within(tier("tier-3")).getByText("奇幻")).toBeInTheDocument();
    expect(within(tier("tier-4")).getByText("Japan")).toBeInTheDocument();
    expect(within(tier("tier-2")).queryByText("奇幻")).toBeNull();
  });

  it("lists the entity records under Internal Keys, with their counts", async () => {
    renderPage();
    const records = (name) => entityRow(name).querySelectorAll("td")[4];
    await waitFor(() => expect(records("Publisher")).toHaveTextContent(/^3$/));
    expect(records("Studio")).toHaveTextContent(/^7$/);
    expect(records("Character")).toHaveTextContent(/^9$/);
    expect(records("Director")).toHaveTextContent(/^4$/);
  });

  it("leaves out a person role the server does not count", async () => {
    renderPage();
    await waitFor(() => expect(entityRow("Director")).toBeDefined());
    expect(entityRow("Club")).toBeUndefined();
  });

  it("carries none of the old page descriptions", () => {
    renderPage();
    expect(screen.queryByText(/Every choice list in the app/)).toBeNull();
    expect(screen.queryByText(/Values only humans read/)).toBeNull();
    expect(screen.queryByText(/Counts are of distinct records/)).toBeNull();
  });
});
