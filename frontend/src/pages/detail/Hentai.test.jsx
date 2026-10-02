// Frontend: the hentai detail page.
//
// Tracked like a cartoon: an episode stepper that finishes the entry at its
// total - and it draws the shared notes page, since the type has no section
// of its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider, useToast } from "../../hooks/useToast";
import Hentai from "./Hentai";

const REMARK = { key: "remark", shape: "text", label: "Remark", owner_where: {} };

function mockFetch(entry, cast = [], { admin = false, patched = null } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url, init) => {
      const u = String(url);
      let body = [];
      if (init?.method === "PATCH") {
        body = patched ? patched(JSON.parse(init.body)) : entry;
      } else if (u.startsWith("/api/auth/me")) {
        body = {
          is_admin: admin,
          username: "cg1618",
          role: "user",
          is_root: false,
          permissions: [],
          visible_gated_types: ["h-comic", "h-game", "hentai"],
        };
      } else if (u.startsWith(`/api/hentai/${entry.system_id}`)) {
        body = entry;
      } else if (u.startsWith(`/api/casting/hentai/${entry.system_id}`)) {
        body = { cast };
      } else if (u.startsWith("/api/notes/sections")) {
        body = [REMARK];
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

// The provider holds toasts and draws none; this draws them as text.
function Toasts() {
  const { toasts } = useToast();
  return toasts.map((t) => <p key={t.id}>{t.message}</p>);
}

function mount(entry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <Toasts />
          <MemoryRouter initialEntries={[`/hentai/${entry.system_id}`]}>
            <Routes>
              <Route path="/hentai/:publicId/:slug?" element={<Hentai />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

const ENTRY = {
  system_id: "h1",
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [{ key: "hentai", name: "Hentai" }],
  credit_refs: {},
  studio_refs: [],
  hentai_name_cn: "中文名",
  hentai_name_en: "English Name",
  source_material: "Manga",
  originality: "原創",
  airing_status: "Finished Airing",
  release_date: "2020-03",
  watching_status: "Completed",
  ep_total: 2,
  ep_fin: 1,
  usefulness: "實用",
  h_genre_plot: "Plot A",
  mal_link: "https://myanimelist.net/anime/1/x",
  anidb_link: "https://anidb.net/anime/1",
};

describe("Hentai detail page", () => {
  it("draws the entry with its own fields and its episode counter", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    expect(screen.getByRole("heading", { name: "English Name" })).toBeInTheDocument();
    expect(screen.getByText("Source Material")).toBeInTheDocument();
    expect(screen.getAllByText("Manga").length).toBeGreaterThan(0);
    expect(screen.getByText("Plot A")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Usefulness" })).toHaveValue("實用");
    expect(screen.getByRole("combobox", { name: "Watching status" })).toHaveValue("Completed");
    // Cartoon's stepper, ep_fin of ep_total, read-only for a non-admin.
    const counter = screen.getByRole("spinbutton", { name: "Episodes finished" });
    expect(counter).toHaveValue(1);
    expect(counter).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next episode" })).toBeDisabled();
    // And the total in the Information card.
    expect(screen.getByText("Episodes")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /anidb/i })).toHaveAttribute(
      "href",
      "https://anidb.net/anime/1",
    );
  });

  it("steps the episode counter with a PATCH of ep_fin", async () => {
    const watching = { ...ENTRY, watching_status: "Active Watching", ep_total: 3, ep_fin: 1 };
    mockFetch(watching, [], {
      admin: true,
      patched: (payload) => ({ ...watching, ...payload }),
    });
    mount(watching);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    const patch = fetch.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(String(patch[0])).toContain("/api/hentai/h1");
    expect(JSON.parse(patch[1].body)).toEqual({ ep_fin: 2 });
    await screen.findByText("Episode progress saved");
    expect(screen.getByRole("spinbutton", { name: "Episodes finished" })).toHaveValue(2);
  });

  it("says Completed when a step reaches the total", async () => {
    const watching = { ...ENTRY, watching_status: "Active Watching", ep_total: 2, ep_fin: 1 };
    mockFetch(watching, [], {
      admin: true,
      // The server finishes the entry when the counter reaches its total.
      patched: (payload) => ({ ...watching, ...payload, watching_status: "Completed" }),
    });
    mount(watching);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    await screen.findByText("Marked as Completed!");
  });

  it("never steps past the total", async () => {
    const done = { ...ENTRY, ep_total: 2, ep_fin: 2 };
    mockFetch(done, [], { admin: true });
    mount(done);
    const user = userEvent.setup();
    const next = await screen.findByRole("button", { name: "Next episode" });
    await waitFor(() => expect(next).toBeEnabled());
    await user.click(next);
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("draws the shared notes page", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByText("Notes");
    // The shared registry, asked for this type: no section of its own.
    const urls = fetch.mock.calls.map(([url]) => String(url));
    expect(urls).toContain("/api/notes/sections?owner_type=hentai");
  });

  it("draws the cast with each character's seiyuu", async () => {
    mockFetch(ENTRY, [
      {
        system_id: "c1",
        role: "Main",
        position: 0,
        character_name: "Heroine",
        character_public_id: 7,
        voices: [{ person_id: "p1", person_name: "Voice Actor", person_public_id: 9, remark: null }],
      },
    ]);
    mount(ENTRY);
    await screen.findByText("Heroine");
    expect(screen.getByText("Cast")).toBeInTheDocument();
    expect(screen.getByText("voiced by")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voice Actor" })).toBeInTheDocument();
  });

  it("draws no cast slip for an entry with no cast", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    await screen.findByText("Notes");
    expect(screen.queryByText("Cast")).toBeNull();
  });
});
