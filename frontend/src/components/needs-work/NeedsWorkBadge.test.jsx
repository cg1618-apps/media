// The 待補充 badge is drawn for manage.requests holders only - red with its
// note while the owner is marked, a dashed "+ 待補充" while it is not - and
// either opens the mark control. The refusal case holds every OTHER
// permission and the server would answer a marked owner - so the badge's
// absence proves it asked for that key, and that it did not even ask the
// server. The mirror case is the same viewer and the same mark, with
// manage.requests added.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
vi.mock("../../hooks/useToast", () => ({
  useToast: () => ({ showToast: vi.fn() }),
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
    vi.fn((url) => {
      // The control's note field reads the common notes; every other read
      // is the mark.
      const body = url.startsWith("/api/options/") ? [] : mark;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
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

  it("shows the mark and its note to a holder, and opens the control and the page link", async () => {
    auth.handles = true;
    const user = userEvent.setup();
    renderBadge();
    const badge = await screen.findByText("待補充");
    expect(screen.getByText(/續集未補/)).toBeInTheDocument();
    expect(global.fetch.mock.calls[0][0]).toBe("/api/needs-work/anime/a-uuid");

    await user.click(badge);
    const dialog = screen.getByRole("dialog", { name: "待補充 Needs Work" });
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByTestId("needs-work-control")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Needs Work page/ })).toHaveAttribute(
      "href",
      "/needs-work",
    );

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("offers an unmarked owner a dashed chip that opens the control", async () => {
    auth.handles = true;
    mark = { ...MARK, flagged: false, note: null };
    const user = userEvent.setup();
    renderBadge();
    const chip = await screen.findByText("+ 待補充");
    expect(screen.queryByText(/續集未補/)).toBeNull();
    await user.click(chip);
    expect(await screen.findByRole("checkbox", { name: "待補充" })).not.toBeChecked();
  });
});
