// The 待補充 badge is drawn for manage.requests holders only, and only while
// the owner is marked. The refusal case holds every OTHER permission and the
// server would answer a marked owner - so the badge's absence proves it asked
// for that key, and that it did not even ask the server. The mirror case is
// the same viewer and the same mark, with manage.requests added.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NeedsWorkBadge from "./NeedsWorkBadge";

const auth = { handles: false };
vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => ({
    has: (p) => (p === "manage.requests" ? auth.handles : true),
  }),
}));

const MARK = {
  owner_type: "anime",
  owner_id: "a-uuid",
  flagged: true,
  note: "續集未補",
  created_at: "2026-11-19T10:00:00",
  updated_at: "2026-11-19T10:00:00",
};
let mark = MARK;

beforeEach(() => {
  auth.handles = false;
  mark = MARK;
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(mark) })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBadge() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NeedsWorkBadge ownerType="anime" ownerId="a-uuid" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("NeedsWorkBadge", () => {
  it("is hidden from a viewer without manage.requests, whatever else they hold", async () => {
    renderBadge();
    await Promise.resolve();
    expect(screen.queryByText("待補充")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the mark and its note to a holder, linking to the page", async () => {
    auth.handles = true;
    renderBadge();
    const badge = await screen.findByText("待補充");
    expect(badge.closest("a")).toHaveAttribute("href", "/needs-work");
    expect(screen.getByText(/續集未補/)).toBeInTheDocument();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/needs-work/anime/a-uuid");
  });

  it("draws nothing for an owner that is not marked", async () => {
    auth.handles = true;
    mark = { ...MARK, flagged: false, note: null };
    renderBadge();
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("待補充")).toBeNull();
  });
});
