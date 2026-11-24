// Frontend: tests for the full order page's way into the editor.
//
// "Edit this order" opens /orders on this order (?order=<system_id>),
// scoped to its owner (?owner=<tier>:<system_id>), not on the page's start.
// The scope above the title is the guide's type filter on a cross-type order,
// and a static pill on a single-type one.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrderPage from "./OrderPage";

let isAdmin = true;

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin, has: () => false }),
}));

vi.mock("../../components/tracker/FollowOrderButton", () => ({
  default: () => null,
}));

vi.mock("../../hooks/useCanonicalPath", () => ({
  useCanonicalPath: () => {},
}));

const ORDER = {
  system_id: "L1",
  public_id: 7,
  list_name: "Main order",
  franchise_id: "FR001",
  media_types: [],
  items: [],
};

// The order the detail fetch answers with; a test swaps in one with steps.
let order = ORDER;

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  isAdmin = true;
  order = ORDER;
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/order/lists?")) return jsonRes([ORDER]);
      if (u.startsWith("/api/franchise/")) {
        return jsonRes({ system_id: "FR001", franchise_name_en: "Elden Ring" });
      }
      return jsonRes(order);
    }),
  );
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/order/7"]}>
      <Routes>
        <Route path="/order/:publicId/:slug?" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrderPage edit link", () => {
  it("opens this order in the editor, scoped to its owner", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: "Edit this order" });
    expect(
      Object.fromEntries(new URL(link.getAttribute("href"), "http://x").searchParams),
    ).toEqual({ owner: "franchise:FR001", order: "L1" });
  });

  it("draws no link for a guest", async () => {
    isAdmin = false;
    renderPage();
    await screen.findByText("Main order");
    expect(screen.queryByRole("link", { name: "Edit this order" })).toBeNull();
  });
});

const step = (id, name, media_type, section_id = null) => ({
  system_id: id,
  entry_id: `E-${id}`,
  display_name: name,
  media_type,
  section_id,
  importance: "Normal",
});

// Two movies and two TV shows, interleaved, the first two inside a part: a
// filter that renumbered, or dropped the part box, would show on either type.
const CROSS = {
  ...ORDER,
  media_types: ["movie", "tv-show"],
  item_count: 4,
  sections: [{ system_id: "S1", position: 1, section_name: "Part 1" }],
  items: [
    step("i1", "Film A", "movie", "S1"),
    step("i2", "Show B", "tv-show", "S1"),
    step("i3", "Film C", "movie"),
    step("i4", "Show D", "tv-show"),
  ],
};

/** The number drawn on the step named `name`. */
const stepNumber = (name) =>
  within(screen.getByText(name).closest("li")).getByText(/^\d+$/).textContent;

describe("OrderPage type filter", () => {
  it("narrows a cross-type order to the picked type, keeping step numbers", async () => {
    order = CROSS;
    renderPage();
    await screen.findByText("Film A");

    const filter = screen.getByRole("group", { name: "Filter steps by type" });
    expect(within(filter).getByText("Cross-type")).toBeTruthy();
    expect(
      within(filter).getAllByRole("button").map((b) => b.textContent),
    ).toEqual(["All", "Movie", "TV Show"]);
    expect(
      within(filter).getByRole("button", { name: "All" }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(within(filter).getByRole("button", { name: "TV Show" }));

    expect(screen.queryByText("Film A")).toBeNull();
    expect(screen.queryByText("Film C")).toBeNull();
    expect(stepNumber("Show B")).toBe("2");
    expect(stepNumber("Show D")).toBe("4");
    // The part keeps its box, holding only what the filter left in it.
    expect(screen.getByText("Part 1")).toBeTruthy();
    expect(screen.getByText("1 step")).toBeTruthy();

    fireEvent.click(within(filter).getByRole("button", { name: "All" }));

    expect(["Film A", "Show B", "Film C", "Show D"].map(stepNumber)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
  });

  it("returns to every step when the picked type is clicked again", async () => {
    order = CROSS;
    renderPage();
    await screen.findByText("Film A");

    const movie = screen.getByRole("button", { name: "Movie" });
    fireEvent.click(movie);
    expect(screen.queryByText("Show B")).toBeNull();
    expect(stepNumber("Film C")).toBe("3");

    fireEvent.click(movie);
    expect(screen.getByText("Show B")).toBeTruthy();
    expect(movie.getAttribute("aria-pressed")).toBe("false");
  });

  it("draws a single-type order's type as a pill with nothing to press", async () => {
    order = {
      ...ORDER,
      media_types: ["anime"],
      items: [step("i1", "Show A", "anime"), step("i2", "Show B", "anime")],
    };
    renderPage();
    await screen.findByText("Show A");

    const scope = screen.getByTestId("order-type-scope");
    expect(within(scope).getByText("Single-type")).toBeTruthy();
    expect(within(scope).getByText("Anime")).toBeTruthy();
    expect(within(scope).queryAllByRole("button")).toEqual([]);
    expect(screen.queryByRole("group", { name: "Filter steps by type" })).toBeNull();
  });

  it("offers the filter on a cross-type order only (mirror of the above)", async () => {
    order = CROSS;
    renderPage();
    await screen.findByText("Film A");

    const scope = screen.getByTestId("order-type-scope");
    expect(within(scope).getAllByRole("button")).toHaveLength(3);
    expect(within(scope).queryByText("Single-type")).toBeNull();
  });
});
