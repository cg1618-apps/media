// Frontend: tests for the Order tab's way into the admin page.
//
// The tab is read-only; an admin edits on /orders. "Build one by hand"
// opens it on this group (?owner=<tier>:<system_id>), and "Edit" also opens
// the order the tab is showing (?order=<system_id>). The picker draws the
// custom orders and the built-in ones on rows of their own.
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import OrderSection from "./OrderSection";

let isAdmin = true;
let lists = [];

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin, has: () => false }),
}));

// One showToast for the whole file, as the real hook gives: the page's loaders
// depend on it, and a new one per render refetches forever.
const toast = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock("../../hooks/useToast", () => ({
  useToast: () => toast,
}));

vi.mock("../../api/mutations/useOrderFollows", () => ({
  useOrderFollows: () => ({ data: [] }),
  useToggleFollow: () => ({ mutate: vi.fn(), isPending: false }),
}));

const ORDER = {
  system_id: "L1",
  public_id: 7,
  list_name: "Main order",
  franchise_id: "FR001",
  media_types: [],
  items: [],
};

function jsonRes(body) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
}

beforeEach(() => {
  isAdmin = true;
  lists = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url) =>
      String(url).startsWith("/api/order/lists?") ? jsonRes(lists) : jsonRes(ORDER),
    ),
  );
});

function renderSection(props) {
  render(
    <MemoryRouter>
      <OrderSection {...props} />
    </MemoryRouter>,
  );
}

const linkParams = (link) =>
  Object.fromEntries(new URL(link.getAttribute("href"), "http://x").searchParams);

describe("OrderSection admin links", () => {
  it.each([
    [{ franchiseId: "FR001" }, "franchise:FR001"],
    [{ seriesId: "SE001" }, "series:SE001"],
    [{ collectionId: "CO001" }, "collection:CO001"],
  ])("scopes Build one by hand for %o", async (props, owner) => {
    renderSection(props);
    const link = await screen.findByRole("link", { name: "Build one by hand" });
    expect(link.getAttribute("href")).toMatch(/^\/orders\?/);
    expect(linkParams(link)).toEqual({ owner });
  });

  it("opens the order shown when Edit is followed", async () => {
    lists = [ORDER];
    renderSection({ franchiseId: "FR001" });
    const link = await screen.findByRole("link", { name: "Edit" });
    expect(linkParams(link)).toEqual({ owner: "franchise:FR001", order: "L1" });
  });

  it("draws no link for a guest", async () => {
    isAdmin = false;
    renderSection({ franchiseId: "FR001" });
    await screen.findByText("No order has been written yet.");
    expect(screen.queryByRole("link", { name: "Build one by hand" })).toBeNull();
  });
});

// Hand-written orders on one row, generated ones on a row of their own below,
// each under its label; a group with no orders draws no row at all.
describe("OrderSection picker rows", () => {
  const order = (id, name, auto_source = null) => ({
    ...ORDER,
    system_id: id,
    list_name: name,
    auto_source,
    item_count: 3,
  });

  const rowNames = (label) =>
    within(screen.getByRole("group", { name: `${label} orders` }))
      .getAllByRole("button")
      .map((b) => b.getAttribute("title"));

  it("puts built-in orders on their own row after the custom ones", async () => {
    lists = [
      order("L1", "Main order"),
      order("L2", "Chronological"),
      order("L3", "Release order", "release"),
    ];
    renderSection({ franchiseId: "FR001" });
    await screen.findByRole("group", { name: "Custom orders" });

    expect(rowNames("Custom")).toEqual(["Main order", "Chronological"]);
    expect(rowNames("Built-in")).toEqual(["Release order"]);
    expect(
      screen.getAllByRole("group").map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Custom orders", "Built-in orders"]);
  });

  it("draws no built-in row when every order is hand-written", async () => {
    lists = [order("L1", "Main order"), order("L2", "Chronological")];
    renderSection({ franchiseId: "FR001" });
    await screen.findByRole("group", { name: "Custom orders" });

    expect(screen.queryByRole("group", { name: "Built-in orders" })).toBeNull();
    expect(screen.queryByText("Built-in")).toBeNull();
  });

  it("draws no custom row when every order is built-in", async () => {
    lists = [
      order("L1", "Release order", "release"),
      order("L2", "Anime release order", "release_anime"),
    ];
    renderSection({ franchiseId: "FR001" });
    await screen.findByRole("group", { name: "Built-in orders" });

    expect(screen.queryByRole("group", { name: "Custom orders" })).toBeNull();
    expect(rowNames("Built-in")).toEqual(["Release order", "Anime release order"]);
  });
});
