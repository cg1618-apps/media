// Frontend: tests for the Watch Order tab's way into the admin page.
//
// The tab is read-only; an admin edits on /watch-orders. "Build one by hand"
// opens it on this group (?owner=<tier>:<system_id>), and "Edit" also opens
// the order the tab is showing (?order=<system_id>).
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrderSection from "./WatchOrderSection";

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

vi.mock("../../api/mutations/useWatchOrderFollows", () => ({
  useWatchOrderFollows: () => ({ data: [] }),
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
      String(url).startsWith("/api/watch-order/lists?") ? jsonRes(lists) : jsonRes(ORDER),
    ),
  );
});

function renderSection(props) {
  render(
    <MemoryRouter>
      <WatchOrderSection {...props} />
    </MemoryRouter>,
  );
}

const linkParams = (link) =>
  Object.fromEntries(new URL(link.getAttribute("href"), "http://x").searchParams);

describe("WatchOrderSection admin links", () => {
  it.each([
    [{ franchiseId: "FR001" }, "franchise:FR001"],
    [{ seriesId: "SE001" }, "series:SE001"],
    [{ collectionId: "CO001" }, "collection:CO001"],
  ])("scopes Build one by hand for %o", async (props, owner) => {
    renderSection(props);
    const link = await screen.findByRole("link", { name: "Build one by hand" });
    expect(link.getAttribute("href")).toMatch(/^\/watch-orders\?/);
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
    await screen.findByText("No watch order has been written yet.");
    expect(screen.queryByRole("link", { name: "Build one by hand" })).toBeNull();
  });
});
