// Frontend: the TV show detail page's tracker - the shared MyTrackerCard.
//
// Status, rating, progress and the plan flags are the viewer's own list row:
// the card is drawn and enabled for a holder of self.list who is not an
// editor, and every change goes through /api/me, never the catalogue PATCH.
// Without self.list the card is not drawn. The release step in the editor's
// toolbar edits the work and the viewer's row together, so it is split: the
// release through the PATCH, the status move through /api/me.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider, useToast } from "../../hooks/useToast";
import TV from "./TV";

const SHOW = {
  system_id: "t1",
  tv_name_cn: "測試劇",
  tv_name_en: "Test Show",
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [],
  credit_refs: {},
  airing_status: "Airing",
  release_date: "2026-10-03",
  watching_status: "Active Watching",
  ep_fin: 3,
  ep_total: 10,
  my_rating: null,
  watch_next: false,
  to_rewatch: false,
};

function mockFetch(entry, { admin = false, permissions = [] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      const u = String(url);
      let body = [];
      if (init?.method === "PUT" && u.startsWith("/api/me/list/")) {
        body = { media_id: entry.system_id, media_type: "tv-show", ...JSON.parse(init.body) };
      } else if (init?.method === "PUT" && u.startsWith("/api/me/plan-flags/")) {
        body = JSON.parse(init.body);
      } else if (init?.method === "PATCH") {
        body = { ...entry, ...JSON.parse(init.body) };
      } else if (u.startsWith("/api/auth/me")) {
        body = {
          is_admin: admin,
          username: "reader",
          role: admin ? "super" : "user",
          permissions,
        };
      } else if (u.startsWith(`/api/tv-shows/${entry.system_id}`)) {
        body = entry;
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function Toasts() {
  const { toasts } = useToast();
  return toasts.map((t) => <p key={t.id}>{t.message}</p>);
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <Toasts />
          <MemoryRouter initialEntries={["/tv-show/t1"]}>
            <Routes>
              <Route path="/tv-show/:publicId/:slug?" element={<TV />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const puts = (prefix) =>
  fetch.mock.calls.filter(([url, init]) => init?.method === "PUT" && String(url).startsWith(prefix));
const patches = () => fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");

describe("TV detail page own tracker", () => {
  it("lets a list holder who is not an editor change the status, through /api/me/list", async () => {
    mockFetch(SHOW, { permissions: ["self.list"] });
    mount();
    const status = await screen.findByRole("combobox", { name: "Watching status" });
    expect(status).toBeEnabled();
    await userEvent.selectOptions(status, "Paused");
    await screen.findByText("Status updated");
    expect(puts("/api/me/list/")).toHaveLength(1);
    expect(puts("/api/me/list/")[0][0]).toBe("/api/me/list/t1");
    expect(JSON.parse(puts("/api/me/list/")[0][1].body)).toEqual({ watching_status: "Paused" });
    expect(patches()).toHaveLength(0);
    expect(status).toHaveValue("Paused");
  });

  it("steps the episode counter through /api/me/list", async () => {
    mockFetch(SHOW, { permissions: ["self.list"] });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Next episode" }));
    await screen.findByText("Episode progress saved");
    expect(JSON.parse(puts("/api/me/list/")[0][1].body)).toEqual({ ep_fin: 4 });
    expect(patches()).toHaveLength(0);
  });

  it("toggles a plan flag through /api/me/plan-flags", async () => {
    mockFetch(SHOW, { permissions: ["self.list"] });
    mount();
    await userEvent.click(await screen.findByRole("checkbox", { name: "To rewatch" }));
    await screen.findByText("Marked for rewatch");
    expect(puts("/api/me/plan-flags/")).toHaveLength(1);
    expect(puts("/api/me/plan-flags/")[0][0]).toBe("/api/me/plan-flags/t1");
    expect(JSON.parse(puts("/api/me/plan-flags/")[0][1].body)).toEqual({ to_rewatch: true });
    expect(puts("/api/me/list/")).toHaveLength(0);
    expect(patches()).toHaveLength(0);
  });

  it("draws no tracker without self.list", async () => {
    mockFetch(SHOW, { permissions: [] });
    mount();
    await screen.findByRole("heading", { name: "測試劇" });
    expect(screen.queryByText("My tracker")).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Watching status" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: "To rewatch" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next episode" })).toBeNull();
  });
});

describe("TV detail page release step", () => {
  const waiting = { ...SHOW, airing_status: "Not Yet Aired", watching_status: "Watch When Airs" };

  it("sends the release to the PATCH and the status move to /api/me for an editor with a list", async () => {
    mockFetch(waiting, { admin: true, permissions: ["manage.catalog", "self.list"] });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Mark airing" }));
    await waitFor(() => expect(puts("/api/me/list/")).toHaveLength(1));
    expect(patches()).toHaveLength(1);
    expect(String(patches()[0][0])).toBe("/api/tv-shows/t1");
    expect(JSON.parse(patches()[0][1].body)).toEqual({ airing_status: "Airing" });
    expect(JSON.parse(puts("/api/me/list/")[0][1].body)).toEqual({
      watching_status: "Active Watching",
    });
  });

  it("keeps the release an editor's without self.list, and moves no status", async () => {
    mockFetch(waiting, { admin: true, permissions: ["manage.catalog"] });
    mount();
    await userEvent.click(await screen.findByRole("button", { name: "Mark airing" }));
    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(JSON.parse(patches()[0][1].body)).toEqual({ airing_status: "Airing" });
    expect(puts("/api/me/")).toHaveLength(0);
    // The editor's toolbar is drawn; the viewer's own tracker is not.
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeInTheDocument();
    expect(screen.queryByText("My tracker")).toBeNull();
  });
});
