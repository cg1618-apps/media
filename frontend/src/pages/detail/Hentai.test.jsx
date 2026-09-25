// Frontend: the hentai detail page.
//
// One entry is one episode, so the page has no counter to step - and it draws
// the shared notes page, since the type has no section of its own.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { ToastProvider } from "../../hooks/useToast";
import Hentai from "./Hentai";

const REMARK = { key: "remark", shape: "text", label: "Remark", owner_where: {} };

function mockFetch(entry) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      let body = [];
      if (u.startsWith("/api/auth/me")) {
        body = {
          is_admin: false,
          username: "cg1618",
          role: "user",
          is_root: false,
          permissions: [],
          visible_gated_types: ["h-comic", "h-game", "hentai"],
        };
      } else if (u.startsWith(`/api/hentai/${entry.system_id}`)) {
        body = entry;
      } else if (u.startsWith("/api/notes/sections")) {
        body = [REMARK];
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount(entry) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
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
  usefulness: "實用",
  h_genre_plot: "Plot A",
  mal_link: "https://myanimelist.net/anime/1/x",
};

describe("Hentai detail page", () => {
  it("draws the entry with its own fields and no episode counter", async () => {
    mockFetch(ENTRY);
    mount(ENTRY);
    await screen.findByRole("heading", { name: "中文名" });
    expect(screen.getByRole("heading", { name: "English Name" })).toBeInTheDocument();
    expect(screen.getByText("Source Material")).toBeInTheDocument();
    expect(screen.getAllByText("Manga").length).toBeGreaterThan(0);
    expect(screen.getByText("Plot A")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Usefulness" })).toHaveValue("實用");
    expect(screen.getByRole("combobox", { name: "Watching status" })).toHaveValue("Completed");
    // One entry is one episode: nothing to count.
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByText(/episodes/i)).toBeNull();
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
});
