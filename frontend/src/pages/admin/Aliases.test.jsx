// /aliases: every value of an aliased category, with or without a conversion,
// and no scopes column.
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Aliases from "./Aliases";

const OPTIONS = [
  {
    system_id: "1",
    category: "Game Platform",
    value: "Mobile",
    family: null,
    scopes: ["game"],
    aliases: [],
  },
  {
    system_id: "2",
    category: "Game Platform",
    value: "Android",
    family: "Mobile",
    scopes: ["game"],
    aliases: [{ source: "igdb", value: "Android" }],
  },
  {
    system_id: "3",
    category: "Game Platform",
    value: "PS4",
    family: "PlayStation",
    scopes: ["game"],
    aliases: [{ source: "igdb", value: "PlayStation 4" }],
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(OPTIONS) })),
  );
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  render(
    <MemoryRouter>
      <Aliases />
    </MemoryRouter>,
  );
}

// The table row whose first cell reads `text`.
const rowOf = (text) =>
  [...document.querySelectorAll("tbody tr")].find(
    (tr) => tr.querySelector("td")?.textContent === text,
  );

describe("Aliases", () => {
  it("lists a value with no conversion as a row of its own", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("PlayStation 4")).toBeInTheDocument());
    const unconverted = screen.getByText("No conversion — set by hand").closest("tr");
    expect(unconverted).toHaveTextContent("Mobile");
  });

  it("shows a console stored with its main platform, without repeating the API's name", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("PlayStation 4")).toBeInTheDocument());
    expect(rowOf("PlayStation 4")).toHaveTextContent("PlayStation, PS4");
    const android = rowOf("Android").querySelectorAll("td");
    expect(android[1]).toHaveTextContent(/^Mobile$/);
  });

  it("explains the two stored values before the Game Platform table", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/A console is stored together with its main platform/)).toBeInTheDocument(),
    );
  });

  it("draws no scopes column", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("PlayStation 4")).toBeInTheDocument());
    expect(screen.queryByText("Scopes")).toBeNull();
    expect(screen.queryByText("game")).toBeNull();
  });
});
