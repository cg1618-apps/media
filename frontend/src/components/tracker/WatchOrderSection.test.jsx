// Frontend: tests for the Watch Order tab's way into the admin page.
//
// The tab is read-only; an admin edits on /watch-orders, and the link there
// carries the group as ?owner=<tier>:<system_id> so the page opens on it.
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WatchOrderSection from "./WatchOrderSection";

let isAdmin = true;

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({ isAdmin, has: () => false }),
}));

vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock("../../api/mutations/useWatchOrderFollows", () => ({
  useWatchOrderFollows: () => ({ data: [] }),
}));

beforeEach(() => {
  isAdmin = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve([]) }),
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

describe("WatchOrderSection admin link", () => {
  it.each([
    [{ franchiseId: "FR001" }, "/watch-orders?owner=franchise:FR001"],
    [{ seriesId: "SE001" }, "/watch-orders?owner=series:SE001"],
    [{ collectionId: "CO001" }, "/watch-orders?owner=collection:CO001"],
  ])("scopes the link for %o", async (props, href) => {
    renderSection(props);
    expect(
      (await screen.findByRole("link", { name: "Build one by hand" })).getAttribute("href"),
    ).toBe(href);
  });

  it("draws no link for a guest", async () => {
    isAdmin = false;
    renderSection({ franchiseId: "FR001" });
    await screen.findByText("No watch order has been written yet.");
    expect(screen.queryByRole("link", { name: "Build one by hand" })).toBeNull();
  });
});
