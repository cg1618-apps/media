// Hentai detail page - the browser tab title and the table of contents,
// as Anime.contents.test.jsx pins them for the anime page.
//
// A gated type: the session names it among its visible gated types, as
// Hentai.test.jsx mounts it.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthProvider } from "../../contexts/AuthContext";
import { PageTitleProvider } from "../../contexts/PageTitleContext";
import { ToastProvider } from "../../hooks/useToast";
import Hentai from "./Hentai";

const ENTRY = {
  system_id: "e1",
  public_id: 1,
  franchise_id: null,
  series_id: null,
  cover_image_file: null,
  sources: [],
  content_labels: [{"key": "hentai", "name": "Hentai"}],
  credit_refs: {},
  hentai_name_cn: "測試",
  hentai_name_en: "Test Entry",
  airing_status: "Finished Airing",
  watching_status: "Completed",
  ep_fin: 1,
  ep_total: 2,
  remark: "Seen twice",
};

const CAST_ROW = {
  system_id: "cc1",
  character_id: "char-1",
  character_public_id: 1,
  character_name: "Protagonist",
  voices: [],
  role: "Main",
  position: 0,
  remark: null,
};

const ok = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

// A member with a list of their own (self.list), so the tracker is drawn.
function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((url) => {
      const u = String(url);
      if (u.startsWith("/api/casting/hentai/")) return ok({ cast: [CAST_ROW] });
      if (u.startsWith("/api/hentai/")) return ok(ENTRY);
      if (u.startsWith("/api/auth/me")) {
        return ok({
          username: "reader",
          role: "user",
          permissions: ["view.character", "self.list"],
            visible_gated_types: ["h-comic", "h-game", "hentai"],
        });
      }
      return ok([]);
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={["/hentai/1"]}>
            <PageTitleProvider>
              <Routes>
                <Route path="/hentai/:publicId/:slug?" element={<Hentai />} />
              </Routes>
            </PageTitleProvider>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

const rows = () =>
  within(screen.getByRole("navigation", { name: "Contents" }))
    .getAllByRole("button")
    .map((b) => b.textContent);

describe("Hentai detail page - tab title and contents", () => {
  it("titles the tab with the entry's displayed title, the one the heading shows", async () => {
    mockFetch();
    mount();
    await screen.findByRole("heading", { level: 1, name: "測試" });
    await waitFor(() => expect(document.title).toBe("測試"));
  });

  it("lists the main-column sections in page order", async () => {
    mockFetch();
    mount();
    await screen.findByText("Protagonist");
    await waitFor(() =>
      expect(rows()).toEqual(["My tracker", "Naming", "Information", "Credits", "Cast", "Genres", "Remarks"]),
    );
  });
});
